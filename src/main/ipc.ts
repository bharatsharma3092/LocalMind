import { ipcMain, BrowserWindow, globalShortcut } from 'electron'
import { v4 as uuid } from 'uuid'
import { db, persistDatabase } from './db/connection'
import { conversations, messages, workspaces, mcpServers, skills, personas, artifacts } from './db/schema'
import { eq, like, desc, and, gt } from 'drizzle-orm'
import { ok, fail, safeHandle } from './utils/ipc-response'
import { appStore } from './settings/app-store'
import { getSecret, setSecret } from './settings/secrets'
import { llmRouter } from './llm/router'
import { createStreamId, sendChunk, sendDone, sendError } from './llm/streaming'
import { generateConversationTitle } from './llm/auto-title'
import { countTokens } from './llm/token-counter'
import type { LLMRequest } from './llm/types'

const activeStreams = new Map<string, AbortController>()

export function registerIpcHandlers(win: BrowserWindow): void {

  // ─── LLM ──────────────────────────────────────────

  ipcMain.handle('llm:startStream', async (event, request: LLMRequest) => {
    // BUG FIX 1: capture win synchronously before any await, add null guard
    const browserWin = BrowserWindow.fromWebContents(event.sender)
    if (!browserWin) {
      return fail('Window not found — cannot stream response')
    }

    const streamId = createStreamId()
    const controller = new AbortController()
    activeStreams.set(streamId, controller)

    // BUG FIX 2: fire-and-forget — do NOT await, return streamId immediately
    ;(async () => {
      try {
        for await (const chunk of llmRouter.complete({ ...request, signal: controller.signal })) {
          if (controller.signal.aborted) break
          if (!browserWin.isDestroyed()) sendChunk(browserWin, streamId, chunk)
        }
        if (!browserWin.isDestroyed()) sendDone(browserWin, streamId, { promptTokens: 0, completionTokens: 0 })
      } catch (err: any) {
        if (!browserWin.isDestroyed()) sendError(browserWin, streamId, err.message ?? 'Unknown error')
      } finally {
        activeStreams.delete(streamId)
      }
    })()

    // BUG FIX 3: wrap in ok() so renderer gets {success:true, data:{streamId}}
    // useStreaming reads: res?.streamId ?? res?.data?.streamId
    // Without ok() wrapper it was returning raw {streamId} which the safeHandle
    // path couldn't unwrap, leaving streamId undefined → "Failed to start stream"
    return ok({ streamId })
  })

  ipcMain.handle('llm:cancelStream', async (_, streamId: string) => {
    activeStreams.get(streamId)?.abort()
    activeStreams.delete(streamId)
  })

  ipcMain.handle('llm:listModels', safeHandle(async (_, provider: string) => {
    return await llmRouter.listModels(provider)
  }))

  ipcMain.handle('llm:estimateCost', safeHandle(async (_, request: LLMRequest) => {
    const promptTokens = request.messages.reduce(
      (sum, m) => sum + countTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content), request.model),
      0
    )
    return { promptTokens, completionTokens: request.maxTokens ?? 1024 }
  }))

  // ─── DB ───────────────────────────────────────────

  ipcMain.handle('db:createConversation', safeHandle(async (_, data: any) => {
    const id = data.id ?? uuid()
    const now = Date.now()
    await db.insert(conversations).values({
      id,
      workspaceId: data.workspaceId ?? null,
      title: data.title ?? null,
      modelId: data.modelId ?? null,
      provider: data.provider ?? null,
      createdAt: now,
      updatedAt: now,
    })
    persistDatabase()
    return { id, createdAt: now }
  }))

  ipcMain.handle('db:getConversations', safeHandle(async () => {
    return await db.select().from(conversations).orderBy(desc(conversations.updatedAt))
  }))

  ipcMain.handle('db:getMessages', safeHandle(async (_, convId: string) => {
    return await db.select().from(messages)
      .where(eq(messages.conversationId, convId))
      .orderBy(messages.createdAt)
  }))

  ipcMain.handle('db:saveMessage', safeHandle(async (_, msg: any) => {
    const id = msg.id ?? uuid()
    await db.insert(messages).values({
      id,
      conversationId: msg.conversationId,
      role: msg.role,
      content: msg.content,
      toolCalls: msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
      toolResults: msg.toolResults ? JSON.stringify(msg.toolResults) : null,
      modelId: msg.modelId ?? null,
      tokensUsed: msg.tokensUsed ?? null,
      parentMessageId: msg.parentMessageId ?? null,
      branchId: msg.branchId ?? null,
      createdAt: msg.createdAt ?? Date.now(),
    })
    // Update conversation timestamp
    await db.update(conversations)
      .set({ updatedAt: Date.now() })
      .where(eq(conversations.id, msg.conversationId))
    persistDatabase()
    return undefined
  }))

  ipcMain.handle('db:updateMessage', safeHandle(async (_, id: string, content: string) => {
    await db.update(messages).set({ content }).where(eq(messages.id, id))
    persistDatabase()
    return undefined
  }))

  ipcMain.handle('db:deleteMessagesAfter', safeHandle(async (_, convId: string, messageId: string) => {
    const msg = await db.select().from(messages).where(eq(messages.id, messageId)).get()
    if (msg) {
      await db.delete(messages).where(
        and(
          eq(messages.conversationId, convId),
          gt(messages.createdAt, msg.createdAt)
        )
      )
    }
    persistDatabase()
    return undefined
  }))

  ipcMain.handle('db:deleteConversation', safeHandle(async (_, convId: string) => {
    await db.delete(messages).where(eq(messages.conversationId, convId))
    await db.delete(conversations).where(eq(conversations.id, convId))
    persistDatabase()
    return undefined
  }))

  ipcMain.handle('db:searchConversations', safeHandle(async (_, query: string) => {
    if (!query) return await db.select().from(conversations).orderBy(desc(conversations.updatedAt))
    return await db.select().from(conversations)
      .where(like(conversations.title, `%${query}%`))
      .orderBy(desc(conversations.updatedAt))
  }))

  ipcMain.handle('db:generateTitle', safeHandle(async (_, convId: string) => {
    await generateConversationTitle(convId)
    return undefined
  }))

  // ─── Settings ─────────────────────────────────────

  ipcMain.handle('settings:get', safeHandle(async (_, key: string) => {
    return appStore.get(key as any)
  }))

  ipcMain.handle('settings:set', safeHandle(async (_, key: string, value: any) => {
    appStore.set(key as any, value)
    return undefined
  }))

  ipcMain.handle('settings:getAll', safeHandle(async () => {
    return appStore.store
  }))

  ipcMain.handle('settings:reset', safeHandle(async () => {
    appStore.clear()
    return undefined
  }))

  ipcMain.handle('settings:updateShortcut', safeHandle(async (_, newShortcut: string) => {
    globalShortcut.unregisterAll()
    const success = globalShortcut.register(newShortcut, () => {
      const w = BrowserWindow.getAllWindows()[0]
      if (w) {
        if (w.isMinimized()) w.restore()
        if (!w.isVisible()) w.show()
        w.focus()
      }
    })
    if (!success) throw new Error(`Shortcut "${newShortcut}" is already in use by another app`)
    appStore.set('globalShortcut', newShortcut)
    return undefined
  }))

  // ─── Secrets ──────────────────────────────────────

  ipcMain.handle('secrets:get', safeHandle(async (_, service: string) => {
    return await getSecret(service)
  }))

  ipcMain.handle('secrets:set', safeHandle(async (_, service: string, value: string) => {
    await setSecret(service, value)
    return undefined
  }))

  // ─── MCP (stubs for Phase 1) ─────────────────────

  ipcMain.handle('mcp:connect', safeHandle(async () => { return undefined }))
  ipcMain.handle('mcp:disconnect', safeHandle(async () => { return undefined }))
  ipcMain.handle('mcp:restart', safeHandle(async () => { return undefined }))
  ipcMain.handle('mcp:callTool', safeHandle(async () => { return null }))
  ipcMain.handle('mcp:listTools', safeHandle(async () => { return [] }))
  ipcMain.handle('mcp:listResources', safeHandle(async () => { return [] }))
  ipcMain.handle('mcp:readResource', safeHandle(async () => { return null }))
  ipcMain.handle('mcp:serverStatus', safeHandle(async () => { return [] }))
  ipcMain.handle('mcp:listPrompts', safeHandle(async () => { return [] }))
  ipcMain.handle('mcp:getPrompt', safeHandle(async () => { return null }))

  // ─── Skills (stubs) ──────────────────────────────

  ipcMain.handle('skill:list', safeHandle(async () => { return [] }))
  ipcMain.handle('skill:activate', safeHandle(async () => { return undefined }))
  ipcMain.handle('skill:run', safeHandle(async () => { return null }))
  ipcMain.handle('skill:create', safeHandle(async () => { return undefined }))
  ipcMain.handle('skill:update', safeHandle(async () => { return undefined }))
  ipcMain.handle('skill:delete', safeHandle(async () => { return undefined }))

  // ─── Artifacts (stubs) ───────────────────────────

  ipcMain.handle('artifact:save', safeHandle(async () => { return undefined }))
  ipcMain.handle('artifact:list', safeHandle(async () => { return [] }))
  ipcMain.handle('artifact:export', safeHandle(async () => { return '' }))
  ipcMain.handle('artifact:getVersions', safeHandle(async () => { return [] }))

  // ─── Workspaces (stubs) ──────────────────────────

  ipcMain.handle('workspace:create', safeHandle(async () => { return undefined }))
  ipcMain.handle('workspace:list', safeHandle(async () => { return [] }))
  ipcMain.handle('workspace:update', safeHandle(async () => { return undefined }))
  ipcMain.handle('workspace:delete', safeHandle(async () => { return undefined }))
  ipcMain.handle('workspace:setActive', safeHandle(async () => { return undefined }))

  // ─── Personas (stubs) ────────────────────────────

  ipcMain.handle('persona:list', safeHandle(async () => { return [] }))
  ipcMain.handle('persona:create', safeHandle(async () => { return undefined }))
  ipcMain.handle('persona:update', safeHandle(async () => { return undefined }))
  ipcMain.handle('persona:delete', safeHandle(async () => { return undefined }))

  // ─── RAG (stubs) ─────────────────────────────────

  ipcMain.handle('rag:index', safeHandle(async () => { return undefined }))
  ipcMain.handle('rag:query', safeHandle(async () => { return [] }))
  ipcMain.handle('rag:status', safeHandle(async () => { return null }))
  ipcMain.handle('rag:listDocuments', safeHandle(async () => { return [] }))
  ipcMain.handle('rag:removeDocument', safeHandle(async () => { return undefined }))

  // ─── Data (stubs) ────────────────────────────────

  ipcMain.handle('data:exportAll', safeHandle(async () => { return '' }))
  ipcMain.handle('data:importAll', safeHandle(async () => { return null }))
  ipcMain.handle('data:exportConversation', safeHandle(async () => { return undefined }))

  // ─── File (stubs) ────────────────────────────────

  ipcMain.handle('file:upload', safeHandle(async () => { return null }))
  ipcMain.handle('file:read', safeHandle(async (_, filePath: string) => {
    const fs = await import('fs/promises')
    return await fs.readFile(filePath, 'utf-8')
  }))
  ipcMain.handle('file:uploadFolder', safeHandle(async () => { return [] }))

  // ─── URL (stubs) ─────────────────────────────────

  ipcMain.handle('url:fetch', safeHandle(async () => { return '' }))
}
