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
    log.info('Got streamId -- attaching chunk/done/error listeners', { streamId })

    // -- 3. Chunk counter + first-chunk tracker for reply visibility
    let chunkCount = 0
    let totalCharsReceived = 0

    // -- 4. Attach IPC listeners BEFORE signalling readiness
    const cleanup = window.localmind.llm.onChunk(streamId, (chunk: LLMStreamChunk) => {
      if (chunk.type === 'text' && chunk.content) {
        chunkCount++
        totalCharsReceived += chunk.content.length

        // Log first chunk explicitly so you can confirm LLM started replying
        if (chunkCount === 1) {
          log.info('>>> FIRST CHUNK received from LLM <<<', {
            streamId,
            preview: chunk.content.slice(0, 120),
          })
        }

        // Log every 20th chunk to show stream is alive without flooding console
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

    window.localmind.llm.onDone(streamId, (usage: any) => {
      // Read final assembled reply BEFORE finalizing
      const msgs = useChatStore.getState().messages[conversationId] ?? []
      const finalMsg = msgs.find((m) => m.id === assistantMsg.id)
      const replyLength = finalMsg?.content?.length ?? 0

      log.info('>>> STREAM DONE -- Full LLM reply received <<<', {
        streamId,
        totalChunks: chunkCount,
        totalCharsReceived,
        replyLength,
        usage,
        // Print first 300 chars of the reply so you can eyeball it in the console
        replyPreview: finalMsg?.content?.slice(0, 300) ?? '(empty)',
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

    // -- 5. Signal readiness -- main process flushes buffered chunks now
    log.info('Signalling ready to main process -- chunks will now flow', { streamId })
    window.localmind.llm.signalReady(streamId)
  }, [addMessageLocal, updateStreamingMessage, finalizeStreamingMessage, setStreaming])

  const cancelStream = useCallback(() => {
    log.warn('cancelStream called -- cleaning up listener')
    cleanupRef.current?.()
    cleanupRef.current = null
    setStreaming(false)
  }, [setStreaming])

  return { startStream, cancelStream }
}
