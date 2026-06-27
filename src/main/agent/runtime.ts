import { join } from 'path'
import { existsSync, mkdirSync, appendFileSync, statSync, readdirSync, unlinkSync } from 'fs'
import { app, type BrowserWindow } from 'electron'
import { v4 as uuid } from 'uuid'
import { db, persistDatabase } from '../db/connection'
import { conversations, messages, memories, commitments } from '../db/schema'
import { eq, desc, and } from 'drizzle-orm'
import { getSecret } from '../settings/secrets'
import { appStore } from '../settings/app-store'
import { llmRouter } from '../llm/router'
import { getWorkspaceContext } from '../workspaces/bootstrapper'
import { countTokens } from '../llm/token-counter'
import type { LLMRequest, LLMMessage, LLMStreamChunk } from '../llm/types'
import { getMcpToolsAsLlmTools, getLocalWorkspaceTools, getSkillTools, getWebSearchTools, isMcpToolName, isLocalToolName, isWebSearchToolName, executeMcpToolCall, executeLocalToolCall, executeWebSearchToolCall } from '../llm/tool-executor'

export class AgentRuntime {
  private static instance: AgentRuntime
  private activeStreams = new Map<string, AbortController>()
  private logRetentionDays = 30

  private constructor() {
    this.cleanupOldLogs()
  }

  public static getInstance(): AgentRuntime {
    if (!AgentRuntime.instance) {
      AgentRuntime.instance = new AgentRuntime()
    }
    return AgentRuntime.instance
  }

  /**
   * Helper to write trace logs to a conversation's ephemeral JSONL file
   */
  private writeJsonlLog(conversationId: string, eventType: string, payload: any) {
    try {
      const logsDir = join(app.getPath('userData'), 'sessions')
      if (!existsSync(logsDir)) {
        mkdirSync(logsDir, { recursive: true })
      }
      const logPath = join(logsDir, `${conversationId}.jsonl`)
      const logEntry = JSON.stringify({
        timestamp: Date.now(),
        eventType,
        ...payload,
      })
      appendFileSync(logPath, logEntry + '\n', 'utf-8')
    } catch (err) {
      console.error('[AgentRuntime][JSONL] Failed to write trace log:', err)
    }
  }

  /**
   * Safe logs retention cleanup to prevent disk bloat (ephemeral session traces deleted after 30 days)
   */
  private cleanupOldLogs() {
    try {
      const logsDir = join(app.getPath('userData'), 'sessions')
      if (!existsSync(logsDir)) return

      const files = readdirSync(logsDir)
      const now = Date.now()
      const threshold = this.logRetentionDays * 24 * 60 * 60 * 1000

      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue
        const filePath = join(logsDir, file)
        const stats = statSync(filePath)
        if (now - stats.mtimeMs > threshold) {
          unlinkSync(filePath)
          console.log(`[AgentRuntime] Cleaned up stale ephemeral JSONL log: ${file}`)
        }
      }
    } catch (err) {
      console.error('[AgentRuntime] Failed cleanup of old session logs:', err)
    }
  }

  /**
   * Local Ranked Lexical Recall Memory (Token Overlap Tokenizer)
   */
  private async queryLexicalMemory(queryText: string, topK = 5): Promise<string[]> {
    if (!queryText || queryText.trim().length === 0) return []
    try {
      // 1. Fetch memories from SQLite
      const dbMemories = await db.select().from(memories).where(eq(memories.enabled, true)).all()
      if (dbMemories.length === 0) return []

      // 2. Tokenize query
      const queryTokens = queryText.toLowerCase().split(/[\s,.\-!?;:()]+/).filter(t => t.length > 2)
      if (queryTokens.length === 0) return []

      // 3. Score overlapping tokens
      const scored = dbMemories.map((mem) => {
        const memTokens = mem.content.toLowerCase().split(/[\s,.\-!?;:()]+/)
        let overlap = 0
        for (const token of queryTokens) {
          if (memTokens.includes(token)) overlap++
        }
        return {
          content: mem.content,
          score: overlap / Math.max(1, memTokens.length),
        }
      })

      // 4. Return top matched memories
      return scored
        .filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(m => m.content)
    } catch (err) {
      console.error('[AgentRuntime] Lexical memory search failed:', err)
      return []
    }
  }

  /**
   * Unified Ingest User Memory source of truth upon startup
   */
  public async migrateSettingsMemory(): Promise<void> {
    try {
      const memoriesMigrated = appStore.get('memoriesMigrated' as any)
      if (memoriesMigrated) return

      const settingsMemories = (appStore.get('memories' as any) as any[]) ?? []
      if (settingsMemories.length > 0) {
        console.log(`[AgentRuntime] Migrating ${settingsMemories.length} settings memories to SQLite...`)
        const now = Date.now()
        for (const m of settingsMemories) {
          if (!m.content?.trim()) continue
          await db.insert(memories).values({
            id: uuid(),
            kind: 'semantic',
            content: m.content.trim(),
            enabled: m.enabled ?? true,
            createdAt: now,
            updatedAt: now,
          })
        }
        persistDatabase()
      }
      appStore.set('memoriesMigrated' as any, true)
    } catch (err) {
      console.error('[AgentRuntime] Settings memories migration failed:', err)
    }
  }

  public registerCancelStream(streamId: string) {
    this.activeStreams.get(streamId)?.abort()
    this.activeStreams.delete(streamId)
  }

  /**
   * Main orchestrator loop preserving streaming contracts
   */
  public async handleStartStream(
    win: BrowserWindow,
    streamId: string,
    request: LLMRequest,
    sendChunk: (chunk: LLMStreamChunk) => void,
    sendDone: (tokens: { promptTokens: number; completionTokens: number }) => void,
    sendError: (err: string) => void
  ): Promise<void> {
    const controller = new AbortController()
    this.activeStreams.set(streamId, controller)

    const MAX_TOOL_ROUNDS = 10
    let chunkCount = 0
    let doneSent = false
    let totalTokens = { promptTokens: 0, completionTokens: 0 }

    this.writeJsonlLog(request.conversationId ?? 'anonymous', 'run_started', {
      streamId,
      model: request.model,
      provider: request.provider,
    })

    try {
      let currentMessages = [...request.messages]

      // --- 1. Workspace Bootstrap File Context Injection ---
      if (request.workspacePath) {
        this.writeJsonlLog(request.conversationId ?? 'anonymous', 'bootstrap_load', { path: request.workspacePath })
        const bootContext = await getWorkspaceContext(request.workspacePath)
        const bootPromptParts = []
        if (bootContext.identity) bootPromptParts.push(`\n[Agent Identity Context]\n${bootContext.identity}`)
        if (bootContext.soul) bootPromptParts.push(`\n[Agent Behavior & Persona Rules]\n${bootContext.soul}`)
        if (bootContext.user) bootPromptParts.push(`\n[User Persona Context]\n${bootContext.user}`)
        if (bootContext.agents) bootPromptParts.push(`\n[Workspace Execution Rules]\n${bootContext.agents}`)
        if (bootContext.tools) bootPromptParts.push(`\n[Workspace Tool Rules]\n${bootContext.tools}`)

        if (bootPromptParts.length > 0) {
          currentMessages = [
            {
              role: 'system',
              content: bootPromptParts.join('\n\n'),
            },
            ...currentMessages,
          ]
        }
      }

      // --- 2. Lexical Memory Search & Injection ---
      const lastUserMsg = [...request.messages].reverse().find(m => m.role === 'user')
      if (lastUserMsg && typeof lastUserMsg.content === 'string') {
        const recalledMemories = await this.queryLexicalMemory(lastUserMsg.content)
        if (recalledMemories.length > 0) {
          this.writeJsonlLog(request.conversationId ?? 'anonymous', 'memory_retrieved', { count: recalledMemories.length })
          const memoryPrompt = [
            'Use this private context memory to personalize the response if relevant.',
            'Do not reveal these details directly unless asked about memory settings.',
            ...recalledMemories.map(m => `- ${m}`),
          ].join('\n')

          currentMessages = [
            {
              role: 'system',
              content: memoryPrompt,
            },
            ...currentMessages,
          ]
        }
      }

      // --- 3. Dynamic Tool Ingestion ---
      const mcpTools = await getMcpToolsAsLlmTools()
      const isToolAgent = request.agentId === 'cowork' || request.agentId === 'code' || request.agentId === 'personal-assistant'
      const localTools = isToolAgent ? getLocalWorkspaceTools() : []
      const webSearchTools = getWebSearchTools()
      const availableTools = [...mcpTools, ...localTools, ...webSearchTools]

      // --- 4. Tool Loop Execution ---
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        if (controller.signal.aborted || win.isDestroyed()) break

        const routerRequest: LLMRequest = {
          ...request,
          messages: currentMessages,
          stream: true,
          signal: controller.signal,
          tools: availableTools.length > 0 ? availableTools : undefined,
        }

        this.writeJsonlLog(request.conversationId ?? 'anonymous', 'llm_call_started', {
          round: round + 1,
          messageCount: currentMessages.length,
        })

        let textContent = ''
        const pendingToolCalls: any[] = []
        let currentToolCall: any = null

        for await (const chunk of llmRouter.complete(routerRequest)) {
          if (controller.signal.aborted || win.isDestroyed()) break

          if (chunk.type === 'done') {
            totalTokens = chunk.usage ?? totalTokens
            continue
          }

          if (chunk.type === 'error') {
            const errMsg = (chunk as any).content ?? 'Unknown error'
            sendError(errMsg)
            this.writeJsonlLog(request.conversationId ?? 'anonymous', 'run_failed', { error: errMsg })
            doneSent = true
            break
          }

          if (chunk.type === 'tool_call' && chunk.toolCall) {
            const tc = chunk.toolCall
            if (tc.id) {
              if (currentToolCall && currentToolCall.name) {
                pendingToolCalls.push(currentToolCall)
              }
              currentToolCall = { id: tc.id, name: tc.name, arguments: tc.arguments || '' }
            } else if (currentToolCall) {
              if (tc.name) currentToolCall.name = (currentToolCall.name || '') + tc.name
              if (tc.arguments) currentToolCall.arguments = (currentToolCall.arguments || '') + tc.arguments
            }
            sendChunk(chunk)
            continue
          }

          if (chunk.type === 'text') {
            chunkCount++
            textContent += (chunk as any).content ?? ''
            sendChunk(chunk)
          }
        }

        if (controller.signal.aborted || win.isDestroyed()) break

        if (currentToolCall && currentToolCall.name) {
          pendingToolCalls.push(currentToolCall)
        }

        if (pendingToolCalls.length === 0) {
          this.writeJsonlLog(request.conversationId ?? 'anonymous', 'llm_call_completed', { round: round + 1, tokens: totalTokens })
          if (!doneSent && !win.isDestroyed()) {
            sendDone(totalTokens)
            doneSent = true
          }
          break
        }

        const assistantMsg: any = {
          role: 'assistant',
          content: textContent || '',
          toolCalls: pendingToolCalls,
        }
        currentMessages.push(assistantMsg)

        // Execute tool calls sequentially
        for (const tc of pendingToolCalls) {
          if (controller.signal.aborted || win.isDestroyed()) break

          let toolResult: { role: 'tool'; content: string; toolCallId: string }
          this.writeJsonlLog(request.conversationId ?? 'anonymous', 'tool_call_started', { toolName: tc.name })

          // Send tool results delta
          sendChunk({
            type: 'tool_result',
            toolCall: tc,
            content: 'Executing...',
          })

          if (isMcpToolName(tc.name)) {
            toolResult = await executeMcpToolCall(tc)
          } else if (isLocalToolName(tc.name)) {
            toolResult = await executeLocalToolCall(tc, request.workspacePath, {
              sessionId: request.conversationId,
              permissionMode: (appStore.get('agentPermissionMode' as any) as any) ?? 'balanced',
              approvalHandler: async (toolName, args, details) => {
                const approvalId = `${toolName}:${Date.now()}`
                win.webContents.send('agent:approvalRequest', {
                  approvalId,
                  agentId: request.agentId,
                  toolName,
                  args,
                  description: details?.reason ?? 'This local action requires your explicit approval.',
                  riskLevel: details?.riskLevel,
                  category: details?.category,
                  protectedPath: details?.protectedPath,
                })
                const decision = await new Promise<string>((resolve) => {
                  const handler = (_: any, data: { approvalId: string; decision: string }) => {
                    if (data.approvalId === approvalId) {
                      win.webContents.removeListener('agent:approvalResponse' as any, handler as any)
                      resolve(data.decision)
                    }
                  }
                  win.webContents.on('agent:approvalResponse' as any, handler as any)
                })
                return decision === 'approved'
              },
            })
          } else if (isWebSearchToolName(tc.name)) {
            toolResult = await executeWebSearchToolCall(tc, {
              sessionId: request.conversationId,
              permissionMode: 'trusted',
            })
          } else {
            toolResult = {
              role: 'tool',
              content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
              toolCallId: tc.id,
            }
          }

          this.writeJsonlLog(request.conversationId ?? 'anonymous', 'tool_call_completed', {
            toolName: tc.name,
            success: !toolResult.content.includes('"error"'),
          })

          sendChunk({
            type: 'tool_result',
            toolCall: tc,
            content: toolResult.content,
          })

          currentMessages.push({
            role: 'tool',
            content: toolResult.content,
            toolCallId: toolResult.toolCallId,
          })
        }
      }

      if (!doneSent && !controller.signal.aborted && !win.isDestroyed()) {
        sendDone(totalTokens)
        doneSent = true
      }

      this.writeJsonlLog(request.conversationId ?? 'anonymous', 'run_completed', { tokens: totalTokens })

      // --- 5. Extract Async Memories & Commitments in Background ---
      if (lastUserMsg && textContent && request.conversationId) {
        this.asynchronouslyIngestMemory(request.conversationId, lastUserMsg.content as string, textContent)
      }

    } catch (err: any) {
      console.error('[AgentRuntime] Error in streaming loop:', err)
      this.writeJsonlLog(request.conversationId ?? 'anonymous', 'run_failed', { error: err.message ?? String(err) })
      if (!win.isDestroyed()) {
        sendError(err.message ?? 'Unknown runtime error')
      }
    } finally {
      this.activeStreams.delete(streamId)
    }
  }

  /**
   * Asynchronous context-memory background extractor (avoids blocking client response stream)
   */
  private async asynchronouslyIngestMemory(conversationId: string, userQuery: string, assistantResponse: string) {
    try {
      const apiKey = await getSecret('google-api-key') || await getSecret('openai-api-key')
      if (!apiKey) return

      const extractPrompt = [
        'You are an expert Context Memory and Commitment Extractor.',
        'Given a conversation turn, extract important user preferences or promised agent commitments.',
        '',
        'Rules:',
        '1. If the user expresses a clear personal preference, statement of fact about themselves, or style guideline, extract it as: "preference: <fact>"',
        '2. If the agent promises a future task, reminder, or follow-up, extract it as: "commitment: <action>"',
        '3. Be extremely selective. Only extract highly relevant, long-term items. Do not extract routine conversational text.',
        '4. Output ONLY a clean list of extracted facts, one per line. If nothing is found, output nothing.',
        '',
        `User Message: "${userQuery}"`,
        `Agent Response: "${assistantResponse}"`,
        '',
        'Extracted Items:',
      ].join('\n')

      const response = await llmRouter.complete({
        messages: [{ role: 'user', content: extractPrompt }],
        model: 'gemini-1.5-flash',
        provider: 'google',
        stream: false,
      })

      let text = ''
      for await (const chunk of response) {
        if (chunk.type === 'text' && chunk.content) text += chunk.content
      }

      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
      const now = Date.now()

      for (const line of lines) {
        if (line.toLowerCase().startsWith('preference:')) {
          const content = line.substring(11).trim()
          await db.insert(memories).values({
            id: uuid(),
            kind: 'semantic',
            content,
            sourceConversationId: conversationId,
            createdAt: now,
            updatedAt: now,
          })
          console.log('[AgentRuntime][Memory] Ingested semantic memory preference:', content)
        } else if (line.toLowerCase().startsWith('commitment:')) {
          const content = line.substring(11).trim()
          await db.insert(commitments).values({
            id: uuid(),
            description: content,
            status: 'pending',
            sourceConversationId: conversationId,
            createdAt: now,
            updatedAt: now,
          })
          console.log('[AgentRuntime][Commitment] Ingested actionable commitment:', content)
        }
      }

      if (lines.length > 0) persistDatabase()

    } catch (err) {
      console.error('[AgentRuntime][BackgroundExtract] Memory ingestion failed:', err)
    }
  }
}
