import { useCallback, useRef } from 'react'
import { v4 as uuid } from 'uuid'
import { useChatStore } from '../stores/chatStore'
import type { Message } from '../stores/chatStore'
import type { LLMStreamChunk, LLMRequest } from '@shared/types/localmind-api'

// ---------------------------------------------------------------------------
// Lightweight tagged logger -- grep by [useStreaming] in DevTools console
// ---------------------------------------------------------------------------
const log = {
  info:  (msg: string, data?: unknown) => console.log(`[useStreaming] ${msg}`,  data !== undefined ? data : ''),
  warn:  (msg: string, data?: unknown) => console.warn(`[useStreaming] [WARN] ${msg}`, data !== undefined ? data : ''),
  error: (msg: string, data?: unknown) => console.error(`[useStreaming] [ERROR] ${msg}`, data !== undefined ? data : ''),
}

export function useStreaming() {
  const { addMessageLocal, updateStreamingMessage, finalizeStreamingMessage, setStreaming } = useChatStore()
  const cleanupRef = useRef<(() => void) | null>(null)

  const startStream = useCallback(async (
    conversationId: string,
    request: LLMRequest,
    onToken?: (token: string) => void
  ) => {
    log.info('startStream called', { conversationId, model: request.model, provider: request.provider, messageCount: request.messages?.length })
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
    log.info('Assistant placeholder added to store', { msgId: assistantMsg.id, conversationId })

    // -- 1. Start stream on main process
    let res: any
    try {
      res = await window.localmind.llm.startStream(request)
      log.info('startStream IPC response received', { success: res?.success, streamId: res?.data?.streamId ?? res?.streamId })
    } catch (err: any) {
      log.error('startStream IPC threw', { error: err?.message, stack: err?.stack })
      updateStreamingMessage(conversationId, assistantMsg.id, `Error: ${err?.message ?? 'Failed to start stream'}`)
      finalizeStreamingMessage(conversationId, assistantMsg.id)
      setStreaming(false)
      return
    }

    // -- 2. Extract streamId
    const streamId = res?.data?.streamId ?? res?.streamId
    if (!streamId || res?.success === false) {
      const errMsg = res?.error ?? 'Failed to start stream'
      log.error('No streamId in IPC response -- aborting', { res, errMsg })
      updateStreamingMessage(conversationId, assistantMsg.id, `Error: ${errMsg}`)
      finalizeStreamingMessage(conversationId, assistantMsg.id)
      setStreaming(false)
      return
    }
    log.info('Got streamId -- attaching ALL listeners before signalReady', { streamId })

    // -- 3. Chunk counter + first-chunk tracker for reply visibility
    let chunkCount = 0
    let totalCharsReceived = 0

    // -------------------------------------------------------------------------
    // CRITICAL ORDER: attach onChunk → onDone → onError → THEN signalReady.
    //
    // Previously signalReady was called after onChunk but before onDone/onError.
    // Main process flushes the entire buffer (including the 'done' event) as
    // soon as it receives the ready signal.  If the 'done' event was replayed
    // before the onDone listener was registered it was silently dropped,
    // leaving the stream permanently stuck with a blank reply.
    // -------------------------------------------------------------------------

    // -- 4a. Attach onChunk listener
    const cleanup = window.localmind.llm.onChunk(streamId, (chunk: LLMStreamChunk) => {
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

    cleanupRef.current = cleanup

    // -- 4b. Attach onDone listener BEFORE signalReady
    window.localmind.llm.onDone(streamId, (usage: any) => {
      const msgs = useChatStore.getState().messages[conversationId] ?? []
      const finalMsg = msgs.find((m) => m.id === assistantMsg.id)
      const replyLength = finalMsg?.content?.length ?? 0

      log.info('>>> STREAM DONE -- Full LLM reply received <<<', {
        streamId,
        totalChunks: chunkCount,
        totalCharsReceived,
        replyLength,
        usage,
        replyPreview: finalMsg?.content?.slice(0, 300) ?? '(empty -- chunks may not have reached store)',
      })

      finalizeStreamingMessage(conversationId, assistantMsg.id)
      setStreaming(false)
      cleanup()
      cleanupRef.current = null

      log.info('Persisting final assistant message to DB', { msgId: assistantMsg.id, replyLength })
      if (finalMsg) window.localmind.db.saveMessage(finalMsg)

      if (msgs.length <= 2) {
        log.info('Auto-generating conversation title', { conversationId })
        window.localmind.db.generateTitle(conversationId)
      }
    })

    // -- 4c. Attach onError listener BEFORE signalReady
    window.localmind.llm.onError(streamId, (err: string) => {
      log.error('>>> STREAM ERROR received from LLM <<<', {
        streamId,
        chunksBeforeError: chunkCount,
        error: err,
      })
      updateStreamingMessage(conversationId, assistantMsg.id, `\n\n**Error:** ${err}`)
      finalizeStreamingMessage(conversationId, assistantMsg.id)
      setStreaming(false)
      cleanup()
      cleanupRef.current = null
    })

    // -- 5. ALL listeners attached -- now safe to signal main process to flush buffer
    log.info('All listeners attached -- signalling ready to main process', { streamId })
    window.localmind.llm.signalReady(streamId)
    log.info('signalReady fired -- main process will now flush buffered chunks', { streamId })

  }, [addMessageLocal, updateStreamingMessage, finalizeStreamingMessage, setStreaming])

  const cancelStream = useCallback(() => {
    log.warn('cancelStream called -- cleaning up listener')
    cleanupRef.current?.()
    cleanupRef.current = null
    setStreaming(false)
  }, [setStreaming])

  return { startStream, cancelStream }
}
