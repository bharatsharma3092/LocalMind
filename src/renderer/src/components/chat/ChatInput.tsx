import { useState, useRef, useCallback, KeyboardEvent } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useProviderStore } from '../../stores/providerStore'
import { useStreaming } from '../../hooks/useStreaming'
import type { LLMRequest } from '@shared/types/localmind-api'

// ---------------------------------------------------------------------------
// Lightweight tagged logger -- grep by [ChatInput] in DevTools console
// ---------------------------------------------------------------------------
const log = {
  info:  (fn: string, msg: string, data?: unknown) => console.log(`[ChatInput][${fn}] ${msg}`, data !== undefined ? data : ''),
  warn:  (fn: string, msg: string, data?: unknown) => console.warn(`[ChatInput][${fn}] [WARN] ${msg}`, data !== undefined ? data : ''),
  error: (fn: string, msg: string, data?: unknown) => console.error(`[ChatInput][${fn}] [ERROR] ${msg}`, data !== undefined ? data : ''),
}

interface Props {
  conversationId: string
  /** When true the input is inert -- no conv is active yet. useStreaming hook stays
   *  mounted so in-flight stream listeners are never destroyed. */
  disabled?: boolean
}

export function ChatInput({ conversationId, disabled = false }: Props) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { isStreaming, addMessage, messages } = useChatStore()
  const { selectedModel } = useProviderStore()
  const { startStream, cancelStream } = useStreaming()

  const handleSend = useCallback(async () => {
    const content = input.trim()
    if (!content || isStreaming || !conversationId || disabled) return

    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    // Save user message and wait for it to be persisted + added to store
    const userMsg = await addMessage({
      conversationId,
      role: 'user',
      content,
    })

    // Build message list for LLM -- read state AFTER addMessage resolves
    const allMessages = useChatStore.getState().messages[conversationId] ?? []
    const llmMessages = allMessages
      .filter((m) => !m.isStreaming)
      .map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      }))

    const request: LLMRequest = {
      messages: llmMessages,
      model: selectedModel?.id ?? 'qwen2.5:7b',
      provider: (selectedModel?.provider as any) ?? 'ollama',
      stream: true,
    }

    // ------------------------------------------------------------------
    // LOG: show exactly what question + history is being sent to the LLM
    // Grep by [ChatInput][handleSend] in DevTools console
    // ------------------------------------------------------------------
    log.info('handleSend', '>>> SENDING TO LLM <<<', {
      model: request.model,
      provider: request.provider,
      totalMessages: llmMessages.length,
      latestUserMessage: content,
      fullHistory: llmMessages.map((m, i) => ({
        index: i,
        role: m.role,
        contentPreview: m.content.slice(0, 200) + (m.content.length > 200 ? '...' : ''),
      })),
    })

    await startStream(conversationId, request)
  }, [input, isStreaming, conversationId, disabled, selectedModel, addMessage, startStream])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }

  const isInert = disabled || !conversationId

  return (
    <div className="border-t border-border p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-3 bg-surface-offset rounded-2xl border border-border p-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={isInert ? 'Start a conversation first...' : 'Type a message... (Shift+Enter for newline)'}
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-text placeholder:text-text-muted min-h-[24px] max-h-[200px] disabled:opacity-40"
            disabled={isStreaming || isInert}
          />
          {isStreaming ? (
            <button
              onClick={cancelStream}
              className="shrink-0 px-3 py-1.5 bg-danger text-white rounded-lg text-xs font-medium hover:opacity-90"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || isInert}
              className="shrink-0 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
