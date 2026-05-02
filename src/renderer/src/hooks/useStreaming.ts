import { useCallback, useRef } from 'react'
import { v4 as uuid } from 'uuid'
import { useChatStore } from '../stores/chatStore'
import type { Message } from '../stores/chatStore'
import type { LLMStreamChunk, LLMRequest } from '@shared/types/localmind-api'

const log = {
  info:  (msg: string, data?: unknown) => console.log(`[useStreaming] ${msg}`,  data !== undefined ? data : ''),
  warn:  (msg: string, data?: unknown) => console.warn(`[useStreaming] [WARN] ${msg}`, data !== undefined ? data : ''),
  error: (msg: string, data?: unknown) => console.error(`[useStreaming] [ERROR] ${msg}`, data !== undefined ? data : ''),
}

export function useStreaming() {
  const { addMessageLocal, updateStreamingMessage, finalizeStreamingMessage, setStreaming } = useChatStore()
  const streamIdRef = useRef<string | null>(null)
  const chunkCleanupRef = useRef<(() => void) | null>(null)
  const doneCleanupRef = useRef<(() => void) | null>(null)
  const errorCleanupRef = useRef<(() => void) | null>(null)
  const assistantMsgRef = useRef<{ id: string; conversationId: string } | null>(null)

  const cleanupAllListeners = useCallback(() => {
    chunkCleanupRef.current?.()
    chunkCleanupRef.current = null
    doneCleanupRef.current?.()
    doneCleanupRef.current = null
    errorCleanupRef.current?.()
    errorCleanupRef.current = null
    streamIdRef.current = null
    assistantMsgRef.current = null
  }, [])

  const startStream = useCallback(async (
    conversationId: string,
    request: LLMRequest,
    onToken?: (token: string) => void
  ) => {
    log.info('startStream called', { conversationId, model: request.model, provider: request.provider, messageCount: request.messages?.length })

    cleanupAllListeners()
    setStreaming(true)

    const assistantMsg: Message = {
      id: uuid(),
      conversationId,
      role: 'assistant',
      content: '',
      modelId: request.model,
      createdAt: Date.now(),
      isStreaming: true,
    }
    addMessageLocal(conversationId, assistantMsg)
    assistantMsgRef.current = { id: assistantMsg.id, conversationId }
    log.info('Assistant placeholder added to store', { msgId: assistantMsg.id, conversationId })

    let res: any
    try {
      res = await window.localmind.llm.startStream(request)
      log.info('startStream IPC response received', { success: res?.success, streamId: res?.data?.streamId ?? res?.streamId })
    } catch (err: any) {
      log.error('startStream IPC threw', { error: err?.message, stack: err?.stack })
      updateStreamingMessage(conversationId, assistantMsg.id, `Error: ${err?.message ?? 'Failed to start stream'}`)
      finalizeStreamingMessage(conversationId, assistantMsg.id)
      setStreaming(false)
      cleanupAllListeners()
      return
    }

    const streamId = res?.data?.streamId ?? res?.streamId
    if (!streamId || res?.success === false) {
      const errMsg = res?.error ?? 'Failed to start stream'
      log.error('No streamId in IPC response -- aborting', { res, errMsg })
      updateStreamingMessage(conversationId, assistantMsg.id, `Error: ${errMsg}`)
      finalizeStreamingMessage(conversationId, assistantMsg.id)
      setStreaming(false)
      cleanupAllListeners()
      return
    }
    streamIdRef.current = streamId
    log.info('Got streamId -- attaching ALL listeners before signalReady', { streamId })

    let chunkCount = 0
    let totalCharsReceived = 0
    let listenersCleaned = false

    const cleanupOnce = () => {
      if (listenersCleaned) return
      listenersCleaned = true
      cleanupAllListeners()
    }

    // -------------------------------------------------------------------------
    // CRITICAL ORDER: attach onChunk -> onDone -> onError -> THEN signalReady.
    // -------------------------------------------------------------------------

    // -- onChunk listener
    const chunkCleanup = window.localmind.llm.onChunk(streamId, (chunk: LLMStreamChunk) => {
      if (chunk.type === 'tool_call' && chunk.toolCall) {
        const toolName = chunk.toolCall.name || 'tool'
        updateStreamingMessage(conversationId, assistantMsg.id, `\n\n_Using ${toolName}..._\n`)
        return
      }

      if (chunk.type === 'tool_result' && chunk.toolCall) {
        const toolName = chunk.toolCall.name || 'tool'
        const resultText = chunk.content && chunk.content !== 'Executing...'
          ? `_${toolName} finished._\n`
          : `_${toolName} is running..._\n`
        updateStreamingMessage(conversationId, assistantMsg.id, `\n${resultText}`)
        return
      }

      if (chunk.type === 'text' && chunk.content) {
        chunkCount++
        totalCharsReceived += chunk.content.length

        if (chunkCount === 1) {
          log.info('>>> FIRST CHUNK received from LLM <<<', {
            streamId,
            preview: chunk.content.slice(0, 120),
          })
        }

        if (chunkCount % 20 === 0) {
          log.info(`Chunk #${chunkCount} received`, {
            streamId,
            totalCharsReceived,
            chunkLength: chunk.content.length,
          })
        }

        updateStreamingMessage(conversationId, assistantMsg.id, chunk.content)
        onToken?.(chunk.content)
      }
    })
    chunkCleanupRef.current = chunkCleanup

    // -- onDone listener BEFORE signalReady
    const doneCleanup = window.localmind.llm.onDone(streamId, (usage: any) => {
      log.info('>>> STREAM DONE <<<', {
        streamId,
        totalChunks: chunkCount,
        totalCharsReceived,
        usage,
      })

      finalizeStreamingMessage(conversationId, assistantMsg.id)
      setStreaming(false)
      cleanupOnce()

      const msgs = useChatStore.getState().messages[conversationId] ?? []
      const finalMsg = msgs.find((m) => m.id === assistantMsg.id)
      const replyLength = finalMsg?.content?.length ?? 0

      log.info('Persisting final assistant message to DB', {
        msgId: assistantMsg.id,
        replyLength,
      })

      if (finalMsg) window.localmind.db.saveMessage(finalMsg)

      if (msgs.filter((m) => m.role !== 'system').length <= 2) {
        log.info('Auto-generating conversation title', { conversationId })
        window.localmind.db.generateTitle(conversationId).then((titleRes) => {
          if (titleRes.success && titleRes.data) {
            useChatStore.getState().updateConversationTitle(conversationId, titleRes.data)
          }
        })
      }
    })
    doneCleanupRef.current = doneCleanup

    // -- onError listener BEFORE signalReady
    const errorCleanup = window.localmind.llm.onError(streamId, (err: string) => {
      log.error('>>> STREAM ERROR <<<', {
        streamId,
        chunksBeforeError: chunkCount,
        error: err,
      })
      updateStreamingMessage(conversationId, assistantMsg.id, `\n\n**Error:** ${err}`)
      finalizeStreamingMessage(conversationId, assistantMsg.id)
      setStreaming(false)
      cleanupOnce()
    })
    errorCleanupRef.current = errorCleanup

    // -- ALL listeners attached -- signal main process to flush buffer
    log.info('All listeners attached -- signalling ready to main process', { streamId })
    window.localmind.llm.signalReady(streamId)
    log.info('signalReady fired', { streamId })

  }, [addMessageLocal, updateStreamingMessage, finalizeStreamingMessage, setStreaming, cleanupAllListeners])

  const cancelStream = useCallback(() => {
    log.warn('cancelStream called')
    const streamId = streamIdRef.current
    const msgRef = assistantMsgRef.current

    if (streamId) {
      window.localmind.llm.cancelStream(streamId)
      log.info('cancelStream: sent cancel to main process', { streamId })
    }

    if (msgRef) {
      finalizeStreamingMessage(msgRef.conversationId, msgRef.id)
    }

    cleanupAllListeners()
    setStreaming(false)
  }, [setStreaming, finalizeStreamingMessage, cleanupAllListeners])

  return { startStream, cancelStream }
}
