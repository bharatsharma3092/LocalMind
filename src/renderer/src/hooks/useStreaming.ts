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

    // ── 1. Start stream — main process inits chunk buffer BEFORE firing LLM call
    let res: any
    try {
      res = await window.localmind.llm.startStream(request)
    } catch (err: any) {
      updateStreamingMessage(conversationId, assistantMsg.id, `Error: ${err?.message ?? 'Failed to start stream'}`)
      finalizeStreamingMessage(conversationId, assistantMsg.id)
      setStreaming(false)
      return
    }

    // ── 2. Extract streamId — main process wraps response in ok({ streamId })
    //    so shape is { success: true, data: { streamId } }
    const streamId = res?.data?.streamId ?? res?.streamId
    if (!streamId || res?.success === false) {
      const errMsg = res?.error ?? 'Failed to start stream'
      updateStreamingMessage(conversationId, assistantMsg.id, `Error: ${errMsg}`)
      finalizeStreamingMessage(conversationId, assistantMsg.id)
      setStreaming(false)
      return
    }

    // ── 3. Attach IPC listeners BEFORE signalling readiness.
    //    Main process buffers all chunks until we call llm:ready.
    const cleanup = window.localmind.llm.onChunk(streamId, (chunk: LLMStreamChunk) => {
      if (chunk.type === 'text' && chunk.content) {
        updateStreamingMessage(conversationId, assistantMsg.id, chunk.content)
        onToken?.(chunk.content)
      }
    })

    cleanupRef.current = cleanup

    window.localmind.llm.onDone(streamId, () => {
      finalizeStreamingMessage(conversationId, assistantMsg.id)
      setStreaming(false)
      cleanup()
      cleanupRef.current = null

      const msgs = useChatStore.getState().messages[conversationId] ?? []
      const finalMsg = msgs.find((m) => m.id === assistantMsg.id)
      if (finalMsg) window.localmind.db.saveMessage(finalMsg)

      if (msgs.length <= 2) window.localmind.db.generateTitle(conversationId)
    })

    window.localmind.llm.onError(streamId, (err: string) => {
      updateStreamingMessage(conversationId, assistantMsg.id, `\n\n**Error:** ${err}`)
      finalizeStreamingMessage(conversationId, assistantMsg.id)
      setStreaming(false)
      cleanup()
      cleanupRef.current = null
    })

    // ── 4. Signal readiness — main process flushes buffered chunks now.
    //    This guarantees we never miss chunks from slow cold-loading models
    //    (e.g. gemma4:e4b takes ~34s to start the llama runner).
    window.localmind.llm.signalReady(streamId)
  }, [addMessageLocal, updateStreamingMessage, finalizeStreamingMessage, setStreaming])

  const cancelStream = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    setStreaming(false)
  }, [setStreaming])

  return { startStream, cancelStream }
}
