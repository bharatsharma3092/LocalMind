import { ipcMain, BrowserWindow, dialog } from 'electron'
import { v4 as uuid } from 'uuid'
import { db, persistDatabase } from './db/connection'
import { conversations, messages, workspaces, mcpServers, skills, agents, personas, artifacts } from './db/schema'
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
import { getMcpToolsAsLlmTools, getLocalWorkspaceTools, getSkillTools, getWebSearchTools, executeMcpToolCall, executeLocalToolCall, executeWebSearchToolCall, isMcpToolName, isLocalToolName, isWebSearchToolName } from './llm/tool-executor'
import { loadBuiltinSkills, getAllSkills, addSkill, removeSkill, type SkillManifest } from './skills/loader'
import { runSkill } from './skills/runner'
import { extractFileContent, extractFolderContents } from './files/extractor'
import { fetchUrlContent } from './files/url-fetcher'
import { saveArtifact, listArtifacts, getArtifactVersions, exportArtifact } from './artifacts/manager'
import { listPersonas, createPersona, updatePersona, deletePersona, getPersona, applyTemplateVariables } from './personas/manager'
import { listWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace, setActiveWorkspace } from './workspaces/manager'
import { initRagIndex, indexDocument, queryDocuments, getRagStatus, listDocuments, removeDocument } from './rag/indexer'
import { exportAllData, importAllData, exportConversation } from './data/manager'
import { searchWeb } from './websearch/service'
import type { WebSearchProvider } from './websearch/service'
import { getClaudeCodeProxySettings, getClaudeCodeProxyStatus, saveClaudeCodeProxySettings, startClaudeCodeProxy, stopClaudeCodeProxy } from './claude-code/proxy'

const log = {
  info:  (tag: string, msg: string, data?: unknown) =>
    console.log(`[IPC][${tag}] ${msg}`, data !== undefined ? data : ''),
  warn:  (tag: string, msg: string, data?: unknown) =>
    console.warn(`[IPC][${tag}] [WARN] ${msg}`, data !== undefined ? data : ''),
  error: (tag: string, msg: string, data?: unknown) =>
    console.error(`[IPC][${tag}] [ERROR] ${msg}`, data !== undefined ? data : ''),
}

const activeStreams = new Map<string, AbortController>()
const pendingAgentApprovals = new Map<string, (decision: string) => void>()

const builtinAgents = [
  {
    id: 'cowork',
    name: 'Cowork',
    description: 'A collaborative coding partner that helps plan, implement, review, and test changes with project context.',
    systemPrompt: [
      'You are Cowork, a collaborative software engineering agent inside LocalMind.',
      'You have full access to the local file system including any absolute path the user specifies (e.g. C:\\Users\\Bharat\\Downloads or any other drive/folder). Never refuse to access a path because it is outside a "project directory" — the user controls what paths are in scope.',
      'Work like a careful pair programmer in the user-selected workspace folder: inspect files, search code, read documents, edit targeted changes, and run existing npm scripts when useful.',
      'Clarify intent only when needed, propose practical next steps, and help the user move from idea to verified implementation.',
      'Prefer concrete actions, concise reasoning, and testable results. Before changing files, inspect the relevant code and keep edits scoped.',
      'Keep privacy in mind and avoid suggesting cloud services unless the user asks for them or the current provider is already cloud-based.',
    ].join('\n'),
    icon: 'groups',
    category: 'Development',
    enabled: true,
    builtIn: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'code',
    name: 'Code',
    description: 'A coding agent for planning, editing, debugging, reviewing, testing, and running project workflows with local tools.',
    systemPrompt: [
      'You are Code, a local coding agent inside LocalMind with tools similar to a terminal coding assistant.',
      'You can plan implementation, inspect the selected workspace folder, glob for paths, grep/search code, read text and Office/PDF files, edit/write files, delete paths after approval, run existing npm scripts, use MCP tools, and invoke LocalMind skills.',
      'Default to a practical engineering loop: understand the request, inspect relevant code, make focused edits, run verification, and summarize the outcome.',
      'For debugging and review, prioritize concrete bugs, failing paths, missing tests, and exact file references.',
      'Keep changes scoped and do not delete files unless the user approves the delete confirmation.',
    ].join('\n'),
    icon: 'terminal',
    category: 'Coding',
    enabled: true,
    builtIn: true,
    createdAt: 0,
    updatedAt: 0,
  },
]

type LocalMindAgent = typeof builtinAgents[number]

function getMemorySystemPrompt(): string | null {
  const enabled = appStore.get('memoryEnabled') ?? true
  if (!enabled) return null

  const profile = appStore.get('userProfile') as any
  const memories = ((appStore.get('memories') as any[]) ?? []).filter((memory) => memory?.enabled !== false && memory?.content?.trim())
  const lines: string[] = []

  if (profile?.displayName?.trim()) {
    lines.push(`The user's name is ${profile.displayName.trim()}.`)
  }
  if (profile?.email?.trim()) {
    lines.push(`The user's email is ${profile.email.trim()}.`)
  }
  if (memories.length > 0) {
    lines.push('Stored user memory:')
    for (const memory of memories.slice(0, 40)) {
      lines.push(`- ${memory.content.trim()}`)
    }
  }

  if (lines.length === 0) return null
  return [
    'Use this private LocalMind memory to personalize responses when relevant.',
    'Do not reveal these stored details unless the user asks about memory or profile settings.',
    ...lines,
  ].join('\n')
}

async function listAgents(): Promise<LocalMindAgent[]> {
  const rows = await db.select().from(agents).all()
  const byId = new Map<string, any>()
  for (const agent of builtinAgents) byId.set(agent.id, { ...agent })
  for (const row of rows) byId.set(row.id, {
    id: row.id,
    name: row.name,
    description: row.description,
    systemPrompt: row.systemPrompt,
    icon: row.icon ?? undefined,
    category: row.category,
    enabled: row.enabled ?? true,
    builtIn: row.builtIn ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
  return Array.from(byId.values())
}

async function getAgent(agentId: string): Promise<LocalMindAgent | undefined> {
  return (await listAgents()).find((agent) => agent.id === agentId && agent.enabled)
}

export function registerIpcHandlers(win: BrowserWindow): void {

  registerApprovalIpcHandlers(win)

  // --- Web Search ------------------------------------------------------------
  ipcMain.handle('websearch:search', safeHandle(async (_, query: string) => {
    return await searchWeb(query)
  }))

  ipcMain.handle('websearch:getProvider', safeHandle(async () => {
    const provider = appStore.get('webSearchProvider') as WebSearchProvider | undefined
    return provider ?? null
  }))

  ipcMain.handle('websearch:setProvider', safeHandle(async (_, provider: WebSearchProvider) => {
    appStore.set('webSearchProvider', provider)
    return undefined
  }))

  ipcMain.handle('websearch:getEnabled', safeHandle(async () => {
    return appStore.get('webSearchEnabled') ?? false
  }))

  ipcMain.handle('websearch:setEnabled', safeHandle(async (_, enabled: boolean) => {
    appStore.set('webSearchEnabled', enabled)
    return undefined
  }))

  ipcMain.handle('agent:approveTool', safeHandle(async (_, approvalId: string, decision: string) => {
    pendingAgentApprovals.get(approvalId)?.(decision)
    pendingAgentApprovals.delete(approvalId)
    return undefined
  }))

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
        const memoryPrompt = getMemorySystemPrompt()
        if (memoryPrompt) {
          currentMessages = [
            {
              role: 'system',
              content: memoryPrompt,
            },
            ...currentMessages,
          ]
        }

        if (request.agentId) {
          const agent = await getAgent(request.agentId)
          if (agent) {
            currentMessages = [
              {
                role: 'system',
                content: agent.systemPrompt,
              },
              ...currentMessages,
            ]
            log.info('startStream', 'Agent prompt injected into request', {
              streamId,
              agentId: agent.id,
              agentName: agent.name,
            })
          } else {
            log.warn('startStream', 'Requested agent was not found or disabled; continuing without it', {
              streamId,
              agentId: request.agentId,
            })
          }
        }

        if (request.personaId) {
          const persona = await getPersona(request.personaId)
          if (persona) {
            const personaPrompt = applyTemplateVariables(persona.systemPrompt, {
              model: request.model,
              provider: request.provider,
              ...request.personaVariables,
            })
            currentMessages = [
              {
                role: 'system',
                content: personaPrompt,
              },
              ...currentMessages,
            ]
            log.info('startStream', 'Persona prompt injected into request', {
              streamId,
              personaId: persona.id,
              personaName: persona.name,
            })
          } else {
            log.warn('startStream', 'Requested persona was not found; continuing without it', {
              streamId,
              personaId: request.personaId,
            })
          }
        }

        const mcpTools = await getMcpToolsAsLlmTools()
        const isToolAgent = request.agentId === 'cowork' || request.agentId === 'code'
        const localTools = isToolAgent ? getLocalWorkspaceTools() : []
        const enabledSkills = isToolAgent ? (await getAllSkillsForTools()) : []
        const skillTools = isToolAgent ? getSkillTools(enabledSkills) : []
        const webSearchTools = getWebSearchTools()
        const availableTools = [...mcpTools, ...localTools, ...skillTools, ...webSearchTools]
        if (availableTools.length > 0) {
          log.info('startStream', `Injecting ${availableTools.length} tools into request`, {
            streamId,
            tools: availableTools.map(t => t.function.name),
          })
        }

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          if (controller.signal.aborted || browserWin.isDestroyed()) break

          const routerRequest: LLMRequest = {
            ...request,
            messages: currentMessages,
            stream: true,
            signal: controller.signal,
            tools: availableTools.length > 0 ? availableTools : undefined,
          }

          log.info('startStream', `Round ${round + 1}: sending to LLM`, {
            streamId,
            messageCount: currentMessages.length,
            toolCount: availableTools.length,
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
            } else if (isLocalToolName(tc.name)) {
              log.info('startStream', `Executing local workspace tool: ${tc.name}`, { streamId })
              const resultChunk: LLMStreamChunk = {
                type: 'tool_result',
                toolCall: tc,
                content: 'Executing...',
              }
              sendChunk(browserWin, streamId, resultChunk)

              toolResult = await executeLocalToolCall(tc, request.workspacePath, async (toolName, args) => {
                const approvalId = `${toolName}:${Date.now()}`
                win.webContents.send('agent:approvalRequest', {
                  approvalId,
                  agentId: request.agentId,
                  toolName,
                  args,
                  description: 'This action can delete local workspace data and needs your approval.',
                })
                const decision = await new Promise<string>((resolve) => {
                  pendingAgentApprovals.set(approvalId, resolve)
                })
                return decision === 'approved'
              })
            } else if (isWebSearchToolName(tc.name)) {
              log.info('startStream', `Executing web search tool: ${tc.name}`, { streamId })
              const resultChunk: LLMStreamChunk = {
                type: 'tool_result',
                toolCall: tc,
                content: 'Searching...',
              }
              sendChunk(browserWin, streamId, resultChunk)

              toolResult = await executeWebSearchToolCall(tc)
            } else if (tc.name.startsWith('skill__')) {
              log.info('startStream', `Executing LocalMind skill tool: ${tc.name}`, { streamId })
              const resultChunk: LLMStreamChunk = {
                type: 'tool_result',
                toolCall: tc,
                content: 'Executing...',
              }
              sendChunk(browserWin, streamId, resultChunk)

              toolResult = await executeSkillToolCall(tc, request)
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
    llmRouter.reloadCustomProviders()
    const models = await llmRouter.listModels(provider)
    log.info('listModels', 'Models fetched', { provider, count: models?.length })
    return models
  }))

  ipcMain.handle('llm:fetchCustomModels', safeHandle(async (_, data: { baseUrl: string; apiKey?: string }) => {
    const baseUrl = String(data?.baseUrl ?? '').trim().replace(/\/+$/, '')
    if (!baseUrl) throw new Error('Base URL is required')

    const headers: Record<string, string> = {}
    if (data?.apiKey?.trim()) headers.Authorization = `Bearer ${data.apiKey.trim()}`

    const response = await fetch(`${baseUrl}/models`, { headers })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Failed to fetch models (${response.status})${body ? `: ${body.slice(0, 300)}` : ''}`)
    }

    const payload = await response.json()
    const rawModels = Array.isArray(payload?.data) ? payload.data : []
    return rawModels
      .map((model: any) => ({
        id: String(model?.id ?? '').trim(),
        name: String(model?.id ?? '').trim(),
      }))
      .filter((model: { id: string }) => model.id)
  }))

  ipcMain.handle('llm:estimateCost', safeHandle(async (_, request: LLMRequest) => {
    const promptTokens = request.messages.reduce(
      (sum, m) => sum + countTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content), request.model),
      0
    )
    log.info('estimateCost', 'Token estimate', { model: request.model, promptTokens })
    return { promptTokens, completionTokens: request.maxTokens ?? 1024 }
  }))

  ipcMain.handle('llm:refinePrompt', safeHandle(async (_, request: LLMRequest & { prompt: string }) => {
    llmRouter.reloadCustomProviders()
    const sourcePrompt = String(request.prompt ?? '').trim()
    if (!sourcePrompt) return ''

    const refineRequest: LLMRequest = {
      ...request,
      stream: false,
      maxTokens: request.maxTokens ?? 700,
      temperature: request.temperature ?? 0.2,
      messages: [
        {
          role: 'system',
          content: [
            'You refine rough dictated or typed user input into a clear prompt for another AI.',
            'Preserve intent, facts, names, constraints, and the user voice.',
            'Do not answer the prompt. Return only the improved prompt text.',
          ].join('\n'),
        },
        { role: 'user', content: sourcePrompt },
      ],
    }

    let refined = ''
    for await (const chunk of llmRouter.complete(refineRequest)) {
      if (chunk.type === 'text' && chunk.content) refined += chunk.content
      if (chunk.type === 'error') throw new Error(chunk.content ?? 'Prompt refinement failed')
    }
    return refined.trim() || sourcePrompt
  }))

  ipcMain.handle('llm:consensus', safeHandle(async (_, data: { query: string; models: { provider: string; model: string; customProviderId?: string }[]; synthesizer: { provider: string; model: string; customProviderId?: string } }) => {
    const { query, models, synthesizer } = data
    if (!models || models.length < 2) throw new Error('At least 2 models are required for consensus.')
    if (!synthesizer) throw new Error('A synthesizer model must be selected.')

    llmRouter.reloadCustomProviders()
    const streamId = createStreamId()
    initStreamBuffer(streamId, win)

    // Run in background so we return the streamId immediately
    ;(async () => {
      try {
        // Phase 1: Query all models in parallel
        const candidatePromises = models.map(async (m) => {
          const request: LLMRequest = {
            messages: [{ role: 'user', content: query }],
            model: m.model,
            provider: m.provider as any,
            customProviderId: m.customProviderId,
            stream: false,
          }
          let text = ''
          for await (const chunk of llmRouter.complete(request)) {
            if (chunk.type === 'text' && chunk.content) text += chunk.content
          }
          return { model: m.model, provider: m.provider, text }
        })

        const results = await Promise.allSettled(candidatePromises)
        const candidates = results.map((r, i) => {
          if (r.status === 'fulfilled') return r.value
          return { model: models[i].model, provider: models[i].provider, text: `[Error: ${(r.reason as Error)?.message ?? 'Failed'}]` }
        })

        // Send candidate results as an info chunk
        const candidatesSummary = candidates.map((c, i) => `--- Model ${i + 1}: ${c.model} (${c.provider}) ---\n${c.text}`).join('\n\n')
        sendChunk(win, streamId, { type: 'text', content: `<!--CANDIDATES_JSON:${JSON.stringify(candidates)}-->\n\n` })

        // Phase 2: Synthesize
        const synthesisPrompt = [
          'You are a Consensus Synthesizer. Multiple AI models were asked the same question. Your job is to produce ONE unified answer.',
          '',
          'Rules:',
          '1. Start with a "## Consensus" section summarizing what ALL models agree on.',
          '2. Then add a "## Disagreements" section listing specific points where models differ, showing each model\'s position.',
          '3. If there are unresolved conflicts, add a "## Open Questions" section.',
          '4. Write in clear, direct language. Do not simply concatenate the responses.',
          '5. Attribute specific claims to their source model when showing disagreements.',
          '',
          `The user\'s question was: "${query}"`,
          '',
          'Here are the model responses:',
          '',
          ...candidates.map((c, i) => `### Model ${i + 1}: ${c.model}\n${c.text}`),
          '',
          'Now produce the unified consensus answer:',
        ].join('\n')

        const synthRequest: LLMRequest = {
          messages: [{ role: 'user', content: synthesisPrompt }],
          model: synthesizer.model,
          provider: synthesizer.provider as any,
          customProviderId: synthesizer.customProviderId,
          stream: true,
        }

        for await (const chunk of llmRouter.complete(synthRequest)) {
          if (chunk.type === 'text' && chunk.content) {
            sendChunk(win, streamId, { type: 'text', content: chunk.content })
          }
          if (chunk.type === 'done') {
            sendDone(win, streamId, chunk.usage ?? { promptTokens: 0, completionTokens: 0 })
          }
        }
      } catch (err: any) {
        sendError(win, streamId, err?.message ?? 'Consensus failed')
      }
    })()

    return { streamId }
  }))

  ipcMain.handle('llm:transcribe', safeHandle(async (_, data: { audio: number[]; provider: string; customProviderId?: string }) => {
    const { audio, provider } = data
    const audioBuffer = Buffer.from(audio)

    if (provider === 'openai' || provider === 'openrouter') {
      const apiKey = provider === 'openai'
        ? await getSecret('openai-api-key')
        : await getSecret('openrouter-api-key')
      if (!apiKey) throw new Error(`No API key configured for ${provider}. Add one in Settings.`)

      const baseUrl = provider === 'openai'
        ? 'https://api.openai.com/v1'
        : 'https://openrouter.ai/api/v1'

      const blob = new Blob([audioBuffer], { type: 'audio/webm' })
      const formData = new FormData()
      formData.append('file', blob, 'audio.webm')
      formData.append('model', 'whisper-1')

      const response = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(`Transcription failed (${response.status}): ${errText}`)
      }

      const result = await response.json() as { text?: string }
      return result.text ?? ''
    }

    if (provider === 'ollama') {
      const audioBase64 = audioBuffer.toString('base64')
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'whisper',
          messages: [{ role: 'user', content: 'Transcribe this audio.', images: [audioBase64] }],
          stream: false,
        }),
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(`Ollama transcription failed (${response.status}): ${errText}. Ensure a whisper model is available via "ollama pull whisper".`)
      }

      const result = await response.json() as { message?: { content?: string } }
      return result.message?.content ?? ''
    }

    throw new Error(`Speech-to-text is not supported for provider "${provider}". Use OpenAI or Ollama for transcription.`)
  }))

  // --- Claude Code Proxy -----------------------------------------------------

  ipcMain.handle('claudeProxy:getSettings', safeHandle(async () => {
    return getClaudeCodeProxySettings()
  }))

  ipcMain.handle('claudeProxy:saveSettings', safeHandle(async (_, settings: any) => {
    return await saveClaudeCodeProxySettings(settings)
  }))

  ipcMain.handle('claudeProxy:testModels', safeHandle(async (_, settings: any) => {
    const savedSettings = await saveClaudeCodeProxySettings(settings)
    const status = await startClaudeCodeProxy()
    const baseUrl = status.baseUrl ?? savedSettings.baseUrl
    const apiKey = savedSettings.apiKey ?? 'localmind-proxy-key'
    const roles = [
      ['opus', savedSettings?.opusModel],
      ['sonnet', savedSettings?.sonnetModel],
      ['haiku', savedSettings?.haikuModel],
    ] as const

    const results = []
    for (const [role, model] of roles) {
      if (!model?.id || !model?.provider) {
        results.push({ role, ok: false, model: null, error: 'No model selected.' })
        continue
      }

      try {
        const response = await fetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'prompt-caching-2024-07-31',
            'x-api-key': apiKey,
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model.id,
            max_tokens: 16,
            stream: false,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Reply with only: ok',
                    cache_control: { type: 'ephemeral' },
                  },
                ],
              },
            ],
          }),
        })
        const raw = await response.text()
        if (!response.ok) {
          throw new Error(raw || `Proxy test failed with HTTP ${response.status}`)
        }
        let content = raw
        try {
          const data = JSON.parse(raw)
          content = (data.content ?? [])
            .map((item: any) => item?.text ?? '')
            .join('')
            .trim()
        } catch {}
        results.push({ role, ok: true, model: model.id, provider: model.provider, content })
      } catch (err: any) {
        results.push({
          role,
          ok: false,
          model: model.id,
          provider: model.provider,
          error: err?.message ?? 'Model test failed',
        })
      }
    }
    return results
  }))

  ipcMain.handle('claudeProxy:start', safeHandle(async () => {
    return await startClaudeCodeProxy()
  }))

  ipcMain.handle('claudeProxy:stop', safeHandle(async () => {
    return await stopClaudeCodeProxy()
  }))

  ipcMain.handle('claudeProxy:status', safeHandle(async () => {
    return getClaudeCodeProxyStatus()
  }))

  // --- DB --------------------------------------------------------------------

  ipcMain.handle('db:createConversation', safeHandle(async (_, data: any) => {
    const id = data.id ?? uuid()
    const now = Date.now()
    await db.insert(conversations).values({
      id,
      workspaceId: data.workspaceId ?? null,
      personaId: data.personaId ?? null,
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
    const title = await generateConversationTitle(convId)
    return title
  }))

  ipcMain.handle('db:updateConversation', safeHandle(async (_, convId: string, data: any) => {
    const updateData: Record<string, any> = {}
    if (data.title !== undefined) updateData.title = data.title
    if (data.starred !== undefined) updateData.starred = data.starred
    if (data.personaId !== undefined) updateData.personaId = data.personaId
    if (data.modelId !== undefined) updateData.modelId = data.modelId
    if (data.provider !== undefined) updateData.provider = data.provider
    if (Object.keys(updateData).length > 0) {
      updateData.updatedAt = Date.now()
      await db.update(conversations).set(updateData).where(eq(conversations.id, convId))
      persistDatabase()
    }
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

    const existing = await db.select().from(mcpServers).where(eq(mcpServers.id, serverConfig.id)).get()
    if (existing) {
      await db.update(mcpServers).set({
        name: serverConfig.name,
        config: JSON.stringify(serverConfig),
        permissions: JSON.stringify({ autoApprove: serverConfig.autoApprove }),
        enabled: true,
      }).where(eq(mcpServers.id, serverConfig.id))
    } else {
      await db.insert(mcpServers).values({
        id: serverConfig.id,
        workspaceId: config.workspaceId ?? null,
        name: serverConfig.name,
        config: JSON.stringify(serverConfig),
        permissions: JSON.stringify({ autoApprove: serverConfig.autoApprove }),
        enabled: true,
      })
    }
    persistDatabase()

    return { id: serverConfig.id, name: serverConfig.name }
  }))

  ipcMain.handle('mcp:disconnect', safeHandle(async (_, serverId: string) => {
    await mcpHostManager.disconnectServer(serverId)
    try {
      const row = await db.select().from(mcpServers).where(eq(mcpServers.id, serverId)).get()
      if (row) {
        const config = JSON.parse(row.config)
        config.enabled = false
        await db.update(mcpServers).set({
          enabled: false,
          config: JSON.stringify(config),
        }).where(eq(mcpServers.id, serverId))
        persistDatabase()
      }
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

  ipcMain.handle('mcp:listSaved', safeHandle(async () => {
    const saved = await db.select().from(mcpServers).all()
    return saved.map((row) => ({
      id: row.id,
      name: row.name,
      enabled: row.enabled ?? true,
      config: JSON.parse(row.config),
    }))
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
      try {
        const manifest = JSON.parse(dbs.manifest)
        const existingIndex = allSkills.findIndex((s) => s.id === dbs.id)
        if (existingIndex >= 0) {
          allSkills[existingIndex] = {
            ...allSkills[existingIndex],
            manifest,
            enabled: dbs.enabled ?? true,
            installedAt: dbs.installedAt,
          }
        } else {
          allSkills.push({
            id: dbs.id,
            manifest,
            systemPrompt: manifest.systemPrompt ?? '',
            enabled: dbs.enabled ?? true,
            installedAt: dbs.installedAt,
          })
        }
      } catch {}
    }
    return allSkills.map((s) => ({
      id: s.id,
      name: s.manifest.name,
      description: s.manifest.description,
      category: s.manifest.category,
      icon: s.manifest.icon,
      author: s.manifest.author,
      version: s.manifest.version,
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
    if (!existing) {
      const builtin = getAllSkills().find((skill) => skill.id === id)
      if (!builtin) throw new Error('Skill not found')

      await db.insert(skills).values({
        id,
        name: builtin.manifest.name,
        manifest: JSON.stringify(builtin.manifest),
        enabled: data.enabled ?? builtin.enabled,
        installedAt: Date.now(),
      })
      persistDatabase()
      return undefined
    }

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

  // --- Agents ---------------------------------------------------------------

  ipcMain.handle('agent:list', safeHandle(async () => {
    return await listAgents()
  }))

  ipcMain.handle('agent:create', safeHandle(async (_, data: any) => {
    const now = Date.now()
    const agent = {
      id: data.id ?? uuid(),
      name: data.name ?? 'New Agent',
      description: data.description ?? 'Custom LocalMind agent',
      systemPrompt: data.systemPrompt ?? '',
      icon: data.icon ?? 'smart_toy',
      category: data.category ?? 'Custom',
      enabled: data.enabled ?? true,
      builtIn: false,
      createdAt: now,
      updatedAt: now,
    }

    await db.insert(agents).values(agent)
    persistDatabase()
    return agent
  }))

  ipcMain.handle('agent:update', safeHandle(async (_, id: string, data: any) => {
    const allAgents = await listAgents()
    const existing = allAgents.find((agent) => agent.id === id)
    if (!existing) throw new Error('Agent not found')

    const now = Date.now()
    const next = {
      id,
      name: data.name ?? existing.name,
      description: data.description ?? existing.description,
      systemPrompt: data.systemPrompt ?? existing.systemPrompt,
      icon: data.icon ?? existing.icon ?? null,
      category: data.category ?? existing.category,
      enabled: data.enabled ?? existing.enabled,
      builtIn: existing.builtIn ?? false,
      createdAt: existing.createdAt || now,
      updatedAt: now,
    }

    const dbExisting = await db.select().from(agents).where(eq(agents.id, id)).get()
    if (dbExisting) {
      await db.update(agents).set(next).where(eq(agents.id, id))
    } else {
      await db.insert(agents).values(next)
    }
    persistDatabase()
    return undefined
  }))

  ipcMain.handle('agent:delete', safeHandle(async (_, id: string) => {
    const existing = (await listAgents()).find((agent) => agent.id === id)
    if (existing?.builtIn) {
      const disabledAgent = {
        ...existing,
        enabled: false,
        updatedAt: Date.now(),
      }
      const dbExisting = await db.select().from(agents).where(eq(agents.id, id)).get()
      if (dbExisting) {
        await db.update(agents).set(disabledAgent).where(eq(agents.id, id))
      } else {
        await db.insert(agents).values(disabledAgent)
      }
    } else {
      await db.delete(agents).where(eq(agents.id, id))
    }
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

  ipcMain.handle('file:selectFolder', safeHandle(async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select workspace folder',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  }))

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

  // --- System Status ---------------------------------------------------------

  ipcMain.handle('system:status', safeHandle(async () => {
    const mem = process.memoryUsage()
    return {
      memoryUsed: Math.round(mem.heapUsed / 1024 / 1024),
      memoryTotal: Math.round(mem.heapTotal / 1024 / 1024),
      rss: Math.round(mem.rss / 1024 / 1024),
    }
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
              const config = JSON.parse(row.config) as MCPServerConfig
              // Respect DB enabled state over cached config value
              config.enabled = row.enabled ?? true
              return config
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

async function getAllSkillsForTools() {
  const builtinSkills = getAllSkills()
  const dbSkills = await db.select().from(skills)
  const allSkills = [...builtinSkills]
  for (const dbs of dbSkills) {
    try {
      const manifest = JSON.parse(dbs.manifest)
      const existingIndex = allSkills.findIndex((s) => s.id === dbs.id)
      const value = {
        id: dbs.id,
        manifest,
        systemPrompt: manifest.systemPrompt ?? '',
        enabled: dbs.enabled ?? true,
        installedAt: dbs.installedAt,
      }
      if (existingIndex >= 0) allSkills[existingIndex] = { ...allSkills[existingIndex], ...value }
      else allSkills.push(value)
    } catch {}
  }
  return allSkills.map((skill) => ({
    id: skill.id,
    name: skill.manifest.name,
    description: skill.manifest.description,
    parameters: skill.manifest.parameters,
    enabled: skill.enabled,
  }))
}

async function executeSkillToolCall(toolCall: ToolCall, request: LLMRequest): Promise<{ role: 'tool'; content: string; toolCallId: string }> {
  const enabledSkills = await getAllSkillsForTools()
  const skill = enabledSkills.find((item) => `skill__${item.id.replace(/[^a-zA-Z0-9_]/g, '_')}` === toolCall.name)
  if (!skill) {
    return {
      role: 'tool',
      content: JSON.stringify({ error: `Skill tool not found: ${toolCall.name}` }),
      toolCallId: toolCall.id,
    }
  }

  let args: Record<string, any> = {}
  try {
    args = JSON.parse(toolCall.arguments || '{}')
  } catch {
    args = {}
  }

  try {
    const chunks = []
    for await (const chunk of runSkill({
      skillId: skill.id,
      messages: [{ role: 'user', content: String(args.input ?? '') }],
      model: request.model,
      provider: request.provider,
      parameters: args.parameters,
    })) {
      chunks.push(chunk)
    }
    return { role: 'tool', content: JSON.stringify({ skillId: skill.id, result: chunks }), toolCallId: toolCall.id }
  } catch (err: any) {
    return { role: 'tool', content: JSON.stringify({ error: err.message ?? 'Skill execution failed' }), toolCallId: toolCall.id }
  }
}
