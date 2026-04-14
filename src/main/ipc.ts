import { ipcMain, BrowserWindow, dialog } from 'electron'
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
import type { LLMRequest, LLMStreamChunk } from './llm/types'
import type { ToolCall } from '@shared/types/localmind-api'
import { mcpHostManager, type MCPServerConfig, reconnectSavedServers } from './mcp/host-manager'
import { registerApprovalIpcHandlers } from './mcp/approval'
import { getMcpToolsAsLlmTools, executeMcpToolCall, isMcpToolName } from './llm/tool-executor'
import { loadBuiltinSkills, getAllSkills, addSkill, removeSkill, type SkillManifest } from './skills/loader'
import { runSkill } from './skills/runner'
import { extractFileContent, extractFolderContents } from './files/extractor'
import { fetchUrlContent } from './files/url-fetcher'
import { saveArtifact, listArtifacts, getArtifactVersions, exportArtifact } from './artifacts/manager'
import { listPersonas, createPersona, updatePersona, deletePersona, applyTemplateVariables } from './personas/manager'
import { listWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace, setActiveWorkspace } from './workspaces/manager'
import { initRagIndex, indexDocument, queryDocuments, getRagStatus, listDocuments, removeDocument } from './rag/indexer'
import { exportAllData, importAllData, exportConversation } from './data/manager'

const log = {
  info:  (tag: string, msg: string, data?: unknown) =>
    console.log(`[IPC][${tag}] ${msg}`, data !== undefined ? data : ''),
  warn:  (tag: string, msg: string, data?: unknown) =>
    console.warn(`[IPC][${tag}] [WARN] ${msg}`, data !== undefined ? data : ''),
  error: (tag: string, msg: string, data?: unknown) =>
    console.error(`[IPC][${tag}] [ERROR] ${msg}`, data !== undefined ? data : ''),
}

const activeStreams = new Map<string, AbortController>()

export function registerIpcHandlers(win: BrowserWindow): void {

  registerApprovalIpcHandlers(win)

  // --- LLM -------------------------------------------------------------------

  ipcMain.handle('llm:startStream', async (event, request: LLMRequest) => {
    log.info('startStream', 'Handler invoked', {
      model: request.model,
      provider: request.provider,
      messageCount: request.messages?.length,
    })

    const browserWin = BrowserWindow.fromWebContents(event.sender)
    if (!browserWin) {
      log.error('startStream', 'BrowserWindow not found -- aborting stream')
      return fail('Window not found -- cannot stream response')
    }

    const streamId = createStreamId()
    const controller = new AbortController()
    activeStreams.set(streamId, controller)
    initStreamBuffer(streamId, browserWin)
    log.info('startStream', 'Stream initialised', { streamId, activeStreams: activeStreams.size })

    ;(async () => {
      let chunkCount = 0
      let doneSent   = false
      let totalTokens = { promptTokens: 0, completionTokens: 0 }
      const MAX_TOOL_ROUNDS = 10

      try {
        let currentMessages = [...request.messages]
        const mcpTools = await getMcpToolsAsLlmTools()
        if (mcpTools.length > 0) {
          log.info('startStream', `Injecting ${mcpTools.length} MCP tools into request`, { streamId, tools: mcpTools.map(t => t.function.name) })
        }

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          if (controller.signal.aborted || browserWin.isDestroyed()) break

          const routerRequest: LLMRequest = {
            ...request,
            messages: currentMessages,
            stream: true,
            signal: controller.signal,
            tools: mcpTools.length > 0 ? mcpTools : undefined,
          }

          log.info('startStream', `Round ${round + 1}: sending to LLM`, {
            streamId,
            messageCount: currentMessages.length,
            toolCount: mcpTools.length,
            messages: currentMessages.map((m, i) => ({
              index: i,
              role: m.role,
              contentLength: typeof m.content === 'string' ? m.content.length : 0,
              hasToolCalls: !!(m as any).toolCalls?.length,
              toolCallId: (m as any).toolCallId,
            })),
          })

          let textContent = ''
          let pendingToolCalls: ToolCall[] = []
          let currentToolCall: Partial<ToolCall> | null = null

          for await (const chunk of llmRouter.complete(routerRequest)) {
            if (controller.signal.aborted || browserWin.isDestroyed()) break

            log.info('startStream', `Chunk received`, { streamId, type: chunk.type, hasToolCall: !!chunk.toolCall, contentPreview: chunk.type === 'text' ? (chunk as any).content?.slice(0, 80) : undefined })

            if (chunk.type === 'done') {
              totalTokens = chunk.usage ?? totalTokens
              continue
            }

            if (chunk.type === 'error') {
              const errMsg = (chunk as any).content ?? 'Unknown error'
              log.error('startStream', 'Error chunk from provider', { streamId, error: errMsg })
              sendError(browserWin, streamId, errMsg)
              doneSent = true
              break
            }

            if (chunk.type === 'tool_call' && chunk.toolCall) {
              const tc = chunk.toolCall
              if (tc.id) {
                if (currentToolCall && currentToolCall.name) {
                  pendingToolCalls.push(currentToolCall as ToolCall)
                }
                currentToolCall = { id: tc.id, name: tc.name, arguments: tc.arguments || '' }
              } else if (currentToolCall) {
                if (tc.name) currentToolCall.name = (currentToolCall.name || '') + tc.name
                if (tc.arguments) currentToolCall.arguments = (currentToolCall.arguments || '') + tc.arguments
              }
              log.info('startStream', 'Tool call chunk received', { streamId, toolName: tc.name, partialArgs: tc.arguments?.length })
              sendChunk(browserWin, streamId, chunk)
              continue
            }

            if (chunk.type === 'text') {
              chunkCount++
              textContent += (chunk as any).content ?? ''
              sendChunk(browserWin, streamId, chunk)
            }
          }

          if (controller.signal.aborted || browserWin.isDestroyed()) break

          if (currentToolCall && currentToolCall.name) {
            pendingToolCalls.push(currentToolCall as ToolCall)
          }

          if (pendingToolCalls.length === 0) {
            log.info('startStream', `Round ${round + 1}: no tool calls, streaming complete`, { streamId, textLength: textContent.length })
            if (!doneSent && !browserWin.isDestroyed()) {
              sendDone(browserWin, streamId, totalTokens)
              doneSent = true
            }
            break
          }

          log.info('startStream', `Round ${round + 1}: LLM requested ${pendingToolCalls.length} tool calls`, {
            streamId,
            tools: pendingToolCalls.map(tc => tc.name),
          })

          const assistantMsg: any = {
            role: 'assistant',
            content: textContent || '',
            toolCalls: pendingToolCalls,
          }
          currentMessages.push(assistantMsg)

          for (const tc of pendingToolCalls) {
            if (controller.signal.aborted || browserWin.isDestroyed()) break

            const isMcp = isMcpToolName(tc.name)
            let toolResult: { role: 'tool'; content: string; toolCallId: string }

            if (isMcp) {
              log.info('startStream', `Executing MCP tool: ${tc.name}`, { streamId })
              const resultChunk: LLMStreamChunk = {
                type: 'tool_result',
                toolCall: tc,
                content: 'Executing...',
              }
              sendChunk(browserWin, streamId, resultChunk)

              toolResult = await executeMcpToolCall(tc)
            } else {
              toolResult = {
                role: 'tool',
                content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
                toolCallId: tc.id,
              }
            }

            log.info('startStream', `Tool result for ${tc.name}`, {
              streamId,
              contentLength: toolResult.content.length,
              isError: toolResult.content.includes('"error"'),
            })

            const resultChunk: LLMStreamChunk = {
              type: 'tool_result',
              toolCall: tc,
              content: toolResult.content,
            }
            sendChunk(browserWin, streamId, resultChunk)

            currentMessages.push({
              role: 'tool',
              content: toolResult.content,
              toolCallId: toolResult.toolCallId,
            })
          }
        }

        if (!doneSent && !controller.signal.aborted && !browserWin.isDestroyed()) {
          log.info('startStream', 'Max rounds reached or loop ended, sending done', { streamId, chunkCount })
          sendDone(browserWin, streamId, totalTokens)
          doneSent = true
        }

      } catch (err: any) {
        log.error('startStream', 'Uncaught exception in stream loop', {
          streamId,
          error: err?.message ?? String(err),
          stack: err?.stack,
        })
        if (!browserWin.isDestroyed()) {
          sendError(browserWin, streamId, err.message ?? 'Unknown error')
        }
      } finally {
        activeStreams.delete(streamId)
        clearStreamBuffer(streamId)
        log.info('startStream', 'Stream cleaned up', { streamId, remainingActiveStreams: activeStreams.size })
      }
    })()

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

  // --- DB --------------------------------------------------------------------

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

  const searchPattern = `%${query}%`
  const titleResults = await db.select().from(conversations)
    .where(like(conversations.title, searchPattern))
    .orderBy(desc(conversations.updatedAt))

  if (titleResults.length > 0) return titleResults

  const messageResults = await db.select({ conv: conversations })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(like(messages.content, searchPattern))
    .orderBy(desc(conversations.updatedAt))
    .limit(50)

  const uniqueConvs = messageResults.filter((r, i, arr) =>
    arr.findIndex((a) => a.conv.id === r.conv.id) === i
  ).map((r) => r.conv)

  return uniqueConvs
}))

  ipcMain.handle('db:generateTitle', safeHandle(async (_, convId: string) => {
    await generateConversationTitle(convId)
    return undefined
  }))

  // --- Settings --------------------------------------------------------------

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
    const { globalShortcut } = await import('electron')
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

  // --- Secrets ---------------------------------------------------------------

  ipcMain.handle('secrets:get', safeHandle(async (_, service: string) => {
    return await getSecret(service)
  }))

  ipcMain.handle('secrets:set', safeHandle(async (_, service: string, value: string) => {
    await setSecret(service, value)
    return undefined
  }))

  // --- MCP -------------------------------------------------------------------

  ipcMain.handle('mcp:connect', safeHandle(async (_, config: any) => {
    const serverConfig: MCPServerConfig = {
      id: config.id ?? uuid(),
      name: config.name ?? 'MCP Server',
      transport: config.transport ?? (config.url ? 'http+sse' : 'stdio'),
      command: config.command,
      args: config.args,
      env: config.env,
      url: config.url,
      autoApprove: config.autoApprove ?? [],
      enabled: true,
    }
    await mcpHostManager.connectServer(serverConfig)

    await db.insert(mcpServers).values({
      id: serverConfig.id,
      workspaceId: config.workspaceId ?? null,
      name: serverConfig.name,
      config: JSON.stringify(serverConfig),
      permissions: JSON.stringify({ autoApprove: serverConfig.autoApprove }),
      enabled: true,
    }).catch(() => {})
    persistDatabase()

    return { id: serverConfig.id, name: serverConfig.name }
  }))

  ipcMain.handle('mcp:disconnect', safeHandle(async (_, serverId: string) => {
    await mcpHostManager.disconnectServer(serverId)
    try {
      await db.update(mcpServers).set({ enabled: false }).where(eq(mcpServers.id, serverId))
      persistDatabase()
    } catch {}
    return undefined
  }))

  ipcMain.handle('mcp:restart', safeHandle(async (_, serverId: string) => {
    await mcpHostManager.restartServer(serverId)
    return undefined
  }))

  ipcMain.handle('mcp:callTool', safeHandle(async (_, serverId: string, toolName: string, args: any) => {
    const autoApproved = mcpHostManager.isToolAutoApproved(serverId, toolName)
    if (!autoApproved) {
      const decision = await new Promise<string>((resolve) => {
        win.webContents.send('mcp:approvalRequest', {
          approvalId: `${serverId}:${toolName}:${Date.now()}`,
          serverId,
          toolName,
          args,
        })

        const handler = (_: any, data: { approvalId: string; decision: string }) => {
          if (data.approvalId.startsWith(`${serverId}:${toolName}`)) {
            ipcMain.removeListener('mcp:approvalResponse', handler as any)
            resolve(data.decision)
          }
        }
        ipcMain.on('mcp:approvalResponse', handler as any)
      })

      if (decision === 'denied') {
        throw new Error(`Tool call "${toolName}" was denied by user`)
      }
    }

    return await mcpHostManager.callTool(serverId, toolName, args ?? {})
  }))

  ipcMain.handle('mcp:listTools', safeHandle(async () => {
    return await mcpHostManager.listAllTools()
  }))

  ipcMain.handle('mcp:listResources', safeHandle(async (_, serverId: string) => {
    return await mcpHostManager.listResources(serverId)
  }))

  ipcMain.handle('mcp:readResource', safeHandle(async (_, serverId: string, uri: string) => {
    return await mcpHostManager.readResource(serverId, uri)
  }))

  ipcMain.handle('mcp:serverStatus', safeHandle(async () => {
    const liveStatus = await mcpHostManager.getServerStatus()
    const savedServers = await db.select().from(mcpServers).all()
    const liveIds = new Set(liveStatus.map((s) => s.id))
    const allStatus = [...liveStatus]
    for (const saved of savedServers) {
      if (!liveIds.has(saved.id)) {
        allStatus.push({
          id: saved.id,
          name: saved.name,
          status: 'disconnected' as const,
          toolCount: 0,
          resourceCount: 0,
        })
      }
    }
    return allStatus
  }))

  ipcMain.handle('mcp:listPrompts', safeHandle(async (_, serverId: string) => {
    return await mcpHostManager.listPrompts(serverId)
  }))

  ipcMain.handle('mcp:getPrompt', safeHandle(async (_, serverId: string, promptName: string, args?: any) => {
    return await mcpHostManager.getPrompt(serverId, promptName, args)
  }))

  ipcMain.handle('mcp:removeServer', safeHandle(async (_, serverId: string) => {
    await mcpHostManager.disconnectServer(serverId)
    await db.delete(mcpServers).where(eq(mcpServers.id, serverId))
    persistDatabase()
    return undefined
  }))

  // --- Skills ----------------------------------------------------------------

  ipcMain.handle('skill:list', safeHandle(async () => {
    const builtinSkills = getAllSkills()
    const dbSkills = await db.select().from(skills)
    const allSkills = [...builtinSkills]
    for (const dbs of dbSkills) {
      if (!allSkills.find((s) => s.id === dbs.id)) {
        try {
          const manifest = JSON.parse(dbs.manifest)
          allSkills.push({
            id: dbs.id,
            manifest,
            systemPrompt: manifest.systemPrompt ?? '',
            enabled: dbs.enabled ?? true,
            installedAt: dbs.installedAt,
          })
        } catch {}
      }
    }
    return allSkills.map((s) => ({
      id: s.id,
      name: s.manifest.name,
      description: s.manifest.description,
      category: s.manifest.category,
      icon: s.manifest.icon,
      parameters: s.manifest.parameters,
      enabled: s.enabled,
    }))
  }))

  ipcMain.handle('skill:activate', safeHandle(async (_, skillId: string, convId: string) => {
    return { skillId, conversationId: convId, activated: true }
  }))

  ipcMain.handle('skill:run', safeHandle(async (_, skillId: string, params: any) => {
    const result = []
    for await (const chunk of runSkill({
      skillId,
      messages: params.messages ?? [],
      model: params.model ?? 'qwen2.5:7b',
      provider: params.provider ?? 'ollama',
      parameters: params.parameters,
      tools: params.tools,
    })) {
      result.push(chunk)
    }
    return result
  }))

  ipcMain.handle('skill:create', safeHandle(async (_, manifest: SkillManifest) => {
    const id = manifest.id ?? uuid()
    const skill = {
      id,
      manifest,
      systemPrompt: manifest.systemPrompt ?? '',
      enabled: true,
      installedAt: Date.now(),
    }
    addSkill(skill)

    await db.insert(skills).values({
      id,
      name: manifest.name,
      manifest: JSON.stringify(manifest),
      enabled: true,
      installedAt: Date.now(),
    })
    persistDatabase()

    return { id }
  }))

  ipcMain.handle('skill:update', safeHandle(async (_, id: string, data: any) => {
    const existing = await db.select().from(skills).where(eq(skills.id, id)).get()
    if (!existing) throw new Error('Skill not found')

    const newManifest = data.manifest ? JSON.stringify(data.manifest) : existing.manifest
    const newName = data.manifest?.name ?? existing.name

    await db.update(skills).set({
      name: newName,
      manifest: newManifest,
      enabled: data.enabled ?? existing.enabled,
    }).where(eq(skills.id, id))
    persistDatabase()

    return undefined
  }))

  ipcMain.handle('skill:delete', safeHandle(async (_, id: string) => {
    removeSkill(id)
    await db.delete(skills).where(eq(skills.id, id))
    persistDatabase()
    return undefined
  }))

  // --- Artifacts -------------------------------------------------------------

  ipcMain.handle('artifact:save', safeHandle(async (_, data: any) => {
    return await saveArtifact(data)
  }))

  ipcMain.handle('artifact:list', safeHandle(async (_, convId: string) => {
    return await listArtifacts(convId)
  }))

  ipcMain.handle('artifact:export', safeHandle(async (_, id: string, format: string) => {
    return await exportArtifact(id, format)
  }))

  ipcMain.handle('artifact:getVersions', safeHandle(async (_, id: string) => {
    return await getArtifactVersions(id)
  }))

  // --- Workspaces ------------------------------------------------------------

  ipcMain.handle('workspace:create', safeHandle(async (_, data: any) => {
    return await createWorkspace(data)
  }))

  ipcMain.handle('workspace:list', safeHandle(async () => {
    return await listWorkspaces()
  }))

  ipcMain.handle('workspace:update', safeHandle(async (_, id: string, data: any) => {
    await updateWorkspace(id, data)
    return undefined
  }))

  ipcMain.handle('workspace:delete', safeHandle(async (_, id: string) => {
    await deleteWorkspace(id)
    return undefined
  }))

  ipcMain.handle('workspace:setActive', safeHandle(async (_, id: string) => {
    await setActiveWorkspace(id)
    return undefined
  }))

  // --- Personas --------------------------------------------------------------

  ipcMain.handle('persona:list', safeHandle(async () => {
    return await listPersonas()
  }))

  ipcMain.handle('persona:create', safeHandle(async (_, data: any) => {
    return await createPersona(data)
  }))

  ipcMain.handle('persona:update', safeHandle(async (_, id: string, data: any) => {
    await updatePersona(id, data)
    return undefined
  }))

  ipcMain.handle('persona:delete', safeHandle(async (_, id: string) => {
    await deletePersona(id)
    return undefined
  }))

  // --- RAG -------------------------------------------------------------------

  ipcMain.handle('rag:index', safeHandle(async (_, filePath: string) => {
    const { basename } = await import('path')
    const { readFile } = await import('fs/promises')
    const filename = basename(filePath)
    const text = await readFile(filePath, 'utf-8')
    const doc = await indexDocument(filename, text, (pct) => {
      win.webContents.send('rag:progress', pct)
    })
    return doc
  }))

  ipcMain.handle('rag:query', safeHandle(async (_, text: string, topK?: number) => {
    return await queryDocuments(text, topK)
  }))

  ipcMain.handle('rag:status', safeHandle(async () => {
    return getRagStatus()
  }))

  ipcMain.handle('rag:listDocuments', safeHandle(async () => {
    return listDocuments()
  }))

  ipcMain.handle('rag:removeDocument', safeHandle(async (_, id: string) => {
    removeDocument(id)
    return undefined
  }))

  // --- Data ------------------------------------------------------------------

  ipcMain.handle('data:exportAll', safeHandle(async () => {
    return await exportAllData()
  }))

  ipcMain.handle('data:importAll', safeHandle(async (_, zipPath: string) => {
    return await importAllData(zipPath)
  }))

  ipcMain.handle('data:exportConversation', safeHandle(async (_, convId: string, format: 'pdf' | 'md') => {
    return await exportConversation(convId, format)
  }))

  // --- File ------------------------------------------------------------------

  ipcMain.handle('file:upload', safeHandle(async (_, fileData: any) => {
    const filePath = fileData.path ?? fileData
    const content = await extractFileContent(filePath)
    return {
      filename: content.filename,
      text: content.text,
      isImage: content.isImage,
      mimeType: content.mimeType,
      extension: content.extension,
    }
  }))

  ipcMain.handle('file:read', safeHandle(async (_, filePath: string) => {
    const fs = await import('fs/promises')
    return await fs.readFile(filePath, 'utf-8')
  }))

  ipcMain.handle('file:uploadFolder', safeHandle(async (_, dirPath: string, extensions?: string[]) => {
    const contents = await extractFolderContents(dirPath, extensions)
    return contents.map((c) => ({
      filename: c.filename,
      text: c.text,
      isImage: c.isImage,
      mimeType: c.mimeType,
      extension: c.extension,
    }))
  }))

  // --- URL -------------------------------------------------------------------

  ipcMain.handle('url:fetch', safeHandle(async (_, url: string) => {
    return await fetchUrlContent(url)
  }))

  // --- Init on registration --------------------------------------------------

  initRagIndex()

  const builtinSkills = loadBuiltinSkills()
  log.info('init', `Loaded ${builtinSkills.length} builtin skills`)

  ;(async () => {
    try {
      const savedServers = await db.select().from(mcpServers).all()
      if (savedServers.length > 0) {
        log.info('init', `Found ${savedServers.length} saved MCP servers, reconnecting...`)
        const configs: MCPServerConfig[] = savedServers
          .map((row) => {
            try {
              return JSON.parse(row.config) as MCPServerConfig
            } catch {
              return null
            }
          })
          .filter((c): c is MCPServerConfig => c !== null)
        await reconnectSavedServers(configs)
        log.info('init', `Reconnected ${mcpHostManager.getConnectedServerIds().length} MCP servers`)
      }
    } catch (err: any) {
      log.error('init', `Failed to reconnect MCP servers: ${err.message}`)
    }
  })()
}
