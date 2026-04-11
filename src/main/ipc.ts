import { ipcMain, BrowserWindow, globalShortcut } from 'electron'
import { v4 as uuid } from 'uuid'
import { db, persistDatabase } from './db/connection'
import { conversations, messages, workspaces, mcpServers, skills, personas, artifacts } from './db/schema'
import { eq, like, desc, and, gt } from 'drizzle-orm'
import { ok, fail, safeHandle } from './utils/ipc-response'
import { appStore } from './settings/app-store'
import { getSecret, setSecret } from './settings/secrets'
import { llmRouter } from './llm/router'
import { createStreamId, initStreamBuffer, clearStreamBuffer, sendChunk, sendDone, sendError } from './llm/streaming'
import { generateConversationTitle } from './llm/auto-title'
import { countTokens } from './llm/token-counter'
import type { LLMRequest } from './llm/types'

// ─── Logger ──────────────────────────────────────────────────────────────────
// Lightweight tagged logger so every log line is grep-able by [IPC] prefix.
const log = {
  info:  (tag: string, msg: string, data?: unknown) =>
    console.log(`[IPC][${tag}] ${msg}`, data !== undefined ? data : ''),
  warn:  (tag: string, msg: string, data?: unknown) =>
    console.warn(`[IPC][${tag}] ⚠ ${msg}`, data !== undefined ? data : ''),
  error: (tag: string, msg: string, data?: unknown) =>
    console.error(`[IPC][${tag}] ✖ ${msg}`, data !== undefined ? data : ''),
}

const activeStreams = new Map<string, AbortController>()

export function registerIpcHandlers(win: BrowserWindow): void {

  // ─── LLM ──────────────────────────────────────────────────────────────────

  ipcMain.handle('llm:startStream', async (event, request: LLMRequest) => {
    // STAGE 1 — IPC handler entered; validate window
    log.info('startStream', 'Handler invoked', {
      model: request.model,
      provider: request.provider,
      messageCount: request.messages?.length,
    })

    const browserWin = BrowserWindow.fromWebContents(event.sender)
    if (!browserWin) {
      log.error('startStream', 'BrowserWindow not found — aborting stream')
      return fail('Window not found — cannot stream response')
    }

    // STAGE 2 — Create stream artefacts
    const streamId = createStreamId()
    const controller = new AbortController()
    activeStreams.set(streamId, controller)
    initStreamBuffer(streamId, browserWin)
    log.info('startStream', 'Stream initialised', { streamId, activeStreams: activeStreams.size })

    // STAGE 3 — Fire async generator and return streamId immediately
    ;(async () => {
      let chunkCount = 0
      let totalTokens = { promptTokens: 0, completionTokens: 0 }

      log.info('startStream', 'Entering llmRouter.complete loop', { streamId })

      try {
        for await (const chunk of llmRouter.complete({ ...request, stream: true, signal: controller.signal })) {

          // STAGE 4a — Aborted mid-stream
          if (controller.signal.aborted) {
            log.warn('startStream', 'Stream aborted mid-chunk — breaking loop', { streamId, chunkCount })
            break
          }

          // STAGE 4b — Window destroyed mid-stream
          if (browserWin.isDestroyed()) {
            log.warn('startStream', 'BrowserWindow destroyed mid-stream — breaking loop', { streamId, chunkCount })
            break
          }

          // STAGE 5 — Route chunk by type
          if (chunk.type === 'done') {
            totalTokens = chunk.usage ?? totalTokens
            log.info('startStream', 'Received done chunk — sending to renderer', { streamId, usage: totalTokens, chunkCount })
            sendDone(browserWin, streamId, totalTokens)
          } else if (chunk.type === 'error') {
            const errMsg = (chunk as any).content ?? 'Unknown error'
            log.error('startStream', 'Received error chunk from provider', { streamId, error: errMsg })
            sendError(browserWin, streamId, errMsg)
          } else {
            chunkCount++
            // Log every 20th text chunk to avoid flooding the console
            if (chunkCount === 1 || chunkCount % 20 === 0) {
              log.info('startStream', `Text chunk #${chunkCount} sent to renderer`, {
                streamId,
                chunkType: chunk.type,
                contentLength: typeof (chunk as any).content === 'string' ? (chunk as any).content.length : '?',
              })
            }
            sendChunk(browserWin, streamId, chunk)
          }
        }

        // STAGE 6 — Loop exhausted without a 'done' chunk (e.g. aborted early)
        if (!controller.signal.aborted && !browserWin.isDestroyed()) {
          log.warn('startStream', 'Loop exited without provider done chunk — sending fallback done', { streamId, chunkCount })
          sendDone(browserWin, streamId, totalTokens)
        } else {
          log.info('startStream', 'Stream ended (aborted or window destroyed — no fallback done needed)', { streamId })
        }

      } catch (err: any) {
        // STAGE 7 — Unexpected exception inside the async generator
        log.error('startStream', 'Uncaught exception in stream loop', {
          streamId,
          error: err?.message ?? String(err),
          stack: err?.stack,
        })
        if (!browserWin.isDestroyed()) {
          sendError(browserWin, streamId, err.message ?? 'Unknown error')
        }
      } finally {
        // STAGE 8 — Always clean up regardless of outcome
        activeStreams.delete(streamId)
        clearStreamBuffer(streamId)
        log.info('startStream', 'Stream cleaned up', { streamId, remainingActiveStreams: activeStreams.size })
      }
    })()

    // STAGE 2 return — renderer receives streamId before first chunk arrives
    log.info('startStream', 'Returning streamId to renderer', { streamId })
    return ok({ streamId })
  })

  ipcMain.handle('llm:cancelStream', async (_, streamId: string) => {
    log.info('cancelStream', 'Cancel requested', { streamId, found: activeStreams.has(streamId) })
    activeStreams.get(streamId)?.abort()
    activeStreams.delete(streamId)
    clearStreamBuffer(streamId)
    log.info('cancelStream', 'Stream cancelled and buffer cleared', { streamId })
  })

  ipcMain.handle('llm:listModels', safeHandle(async (_, provider: string) => {
    log.info('listModels', 'Fetching model list', { provider })
    const models = await llmRouter.listModels(provider)
    log.info('listModels', 'Models fetched', { provider, count: models?.length })
    return models
  }))

  ipcMain.handle('llm:estimateCost', safeHandle(async (_, request: LLMRequest) => {
    const promptTokens = request.messages.reduce(
      (sum, m) => sum + countTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content), request.model),
      0
    )
    log.info('estimateCost', 'Token estimate', { model: request.model, promptTokens })
    return { promptTokens, completionTokens: request.maxTokens ?? 1024 }
  }))

  // ─── DB ──────────────────────────────────────────────────────────────────

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
    log.info('db', 'Conversation created', { id })
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
    await db.update(conversations)
      .set({ updatedAt: Date.now() })
      .where(eq(conversations.id, msg.conversationId))
    persistDatabase()
    log.info('db', 'Message saved', { id, role: msg.role, convId: msg.conversationId })
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
    log.info('db', 'Conversation deleted', { convId })
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

  // ─── Settings ────────────────────────────────────────────────────────────

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

  // ─── Secrets ─────────────────────────────────────────────────────────────

  ipcMain.handle('secrets:get', safeHandle(async (_, service: string) => {
    return await getSecret(service)
  }))

  ipcMain.handle('secrets:set', safeHandle(async (_, service: string, value: string) => {
    await setSecret(service, value)
    return undefined
  }))

  // ─── MCP (stubs for Phase 1) ─────────────────────────────────────────────
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

  // ─── Skills (stubs) ──────────────────────────────────────────────────────
  ipcMain.handle('skill:list', safeHandle(async () => { return [] }))
  ipcMain.handle('skill:activate', safeHandle(async () => { return undefined }))
  ipcMain.handle('skill:run', safeHandle(async () => { return null }))
  ipcMain.handle('skill:create', safeHandle(async () => { return undefined }))
  ipcMain.handle('skill:update', safeHandle(async () => { return undefined }))
  ipcMain.handle('skill:delete', safeHandle(async () => { return undefined }))

  // ─── Artifacts (stubs) ───────────────────────────────────────────────────
  ipcMain.handle('artifact:save', safeHandle(async () => { return undefined }))
  ipcMain.handle('artifact:list', safeHandle(async () => { return [] }))
  ipcMain.handle('artifact:export', safeHandle(async () => { return '' }))
  ipcMain.handle('artifact:getVersions', safeHandle(async () => { return [] }))

  // ─── Workspaces (stubs) ──────────────────────────────────────────────────
  ipcMain.handle('workspace:create', safeHandle(async () => { return undefined }))
  ipcMain.handle('workspace:list', safeHandle(async () => { return [] }))
  ipcMain.handle('workspace:update', safeHandle(async () => { return undefined }))
  ipcMain.handle('workspace:delete', safeHandle(async () => { return undefined }))
  ipcMain.handle('workspace:setActive', safeHandle(async () => { return undefined }))

  // ─── Personas (stubs) ────────────────────────────────────────────────────
  ipcMain.handle('persona:list', safeHandle(async () => { return [] }))
  ipcMain.handle('persona:create', safeHandle(async () => { return undefined }))
  ipcMain.handle('persona:update', safeHandle(async () => { return undefined }))
  ipcMain.handle('persona:delete', safeHandle(async () => { return undefined }))

  // ─── RAG (stubs) ─────────────────────────────────────────────────────────
  ipcMain.handle('rag:index', safeHandle(async () => { return undefined }))
  ipcMain.handle('rag:query', safeHandle(async () => { return [] }))
  ipcMain.handle('rag:status', safeHandle(async () => { return null }))
  ipcMain.handle('rag:listDocuments', safeHandle(async () => { return [] }))
  ipcMain.handle('rag:removeDocument', safeHandle(async () => { return undefined }))

  // ─── Data (stubs) ────────────────────────────────────────────────────────
  ipcMain.handle('data:exportAll', safeHandle(async () => { return '' }))
  ipcMain.handle('data:importAll', safeHandle(async () => { return null }))
  ipcMain.handle('data:exportConversation', safeHandle(async () => { return undefined }))

  // ─── File (stubs) ────────────────────────────────────────────────────────
  ipcMain.handle('file:upload', safeHandle(async () => { return null }))
  ipcMain.handle('file:read', safeHandle(async (_, filePath: string) => {
    const fs = await import('fs/promises')
    return await fs.readFile(filePath, 'utf-8')
  }))
  ipcMain.handle('file:uploadFolder', safeHandle(async () => { return [] }))

  // ─── URL (stubs) ─────────────────────────────────────────────────────────
  ipcMain.handle('url:fetch', safeHandle(async () => { return '' }))
}
