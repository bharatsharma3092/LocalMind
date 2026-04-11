import { useCallback, useRef } from 'react'
import { v4 as uuid } from 'uuid'
import { useChatStore } from '../stores/chatStore'
import type { Message } from '../stores/chatStore'
import type { LLMStreamChunk, LLMRequest } from '@shared/types/localmind-api'

export function useStreaming() {
  const { addMessageLocal, updateStreamingMessage, finalizeStreamingMessage, setStreaming } = useChatStore()
  const cleanupRef = useRef<(() => void) | null>(null)

  const startStream = useCallback(async (
    conversationId: string,
    request: LLMRequest,
    onToken?: (token: string) => void
  ) => {
    console.log('[useStreaming] startStream called', { conversationId, model: request.model })
    setStreaming(true)

    const assistantMsg: Message = {
      id: uuid(),
      conversationId,  // BUG FIX: always use the passed-in conversationId, not activeConversationId
      role: 'assistant',
      content: '',
      modelId: request.model,
      createdAt: Date.now(),
      isStreaming: true,
    }
    addMessageLocal(conversationId, assistantMsg)
    console.log('[useStreaming] Assistant placeholder added', { msgId: assistantMsg.id, conversationId })

    // -- 1. Start stream on main process
    let res: any
    try {
      res = await window.localmind.llm.startStream(request)
      console.log('[useStreaming] startStream IPC response', res)
    } catch (err: any) {
      console.error('[useStreaming] startStream IPC threw', err)
      updateStreamingMessage(conversationId, assistantMsg.id, `Error: ${err?.message ?? 'Failed to start stream'}`)
      finalizeStreamingMessage(conversationId, assistantMsg.id)
      setStreaming(false)
      return
    }

    // -- 2. Extract streamId
    const streamId = res?.data?.streamId ?? res?.streamId
    if (!streamId || res?.success === false) {
      const errMsg = res?.error ?? 'Failed to start stream'
      console.error('[useStreaming] No streamId in response', { res, errMsg })
      updateStreamingMessage(conversationId, assistantMsg.id, `Error: ${errMsg}`)
      finalizeStreamingMessage(conversationId, assistantMsg.id)
      setStreaming(false)
      return
    }
    console.log('[useStreaming] Got streamId', { streamId })

    // -- 3. Attach IPC listeners BEFORE signalling readiness
    const cleanup = window.localmind.llm.onChunk(streamId, (chunk: LLMStreamChunk) => {
      if (chunk.type === 'text' && chunk.content) {
        console.log('[useStreaming] onChunk', { streamId, contentLength: chunk.content.length })
        updateStreamingMessage(conversationId, assistantMsg.id, chunk.content)
        onToken?.(chunk.content)
      }
    })

    cleanupRef.current = cleanup

    window.localmind.llm.onDone(streamId, (usage: any) => {
      console.log('[useStreaming] onDone', { streamId, usage })
      finalizeStreamingMessage(conversationId, assistantMsg.id)
      setStreaming(false)
      cleanup()
      cleanupRef.current = null

      // BUG FIX: read store state AFTER finalize so content is complete
      const msgs = useChatStore.getState().messages[conversationId] ?? []
      const finalMsg = msgs.find((m) => m.id === assistantMsg.id)
      console.log('[useStreaming] Saving final message', { msgId: assistantMsg.id, contentLength: finalMsg?.content?.length })
      if (finalMsg) window.localmind.db.saveMessage(finalMsg)

      if (msgs.length <= 2) window.localmind.db.generateTitle(conversationId)
    })

    window.localmind.llm.onError(streamId, (err: string) => {
      console.error('[useStreaming] onError', { streamId, err })
      updateStreamingMessage(conversationId, assistantMsg.id, `\n\n**Error:** ${err}`)
      finalizeStreamingMessage(conversationId, assistantMsg.id)
      setStreaming(false)
      cleanup()
      cleanupRef.current = null
    })

    // -- 4. Signal readiness -- main process flushes buffered chunks now
    console.log('[useStreaming] Signalling ready', { streamId })
    window.localmind.llm.signalReady(streamId)
  }, [addMessageLocal, updateStreamingMessage, finalizeStreamingMessage, setStreaming])

  const cancelStream = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    setStreaming(false)
  }, [setStreaming])

  return { startStream, cancelStream }
}
