import { useState, useRef, useCallback, KeyboardEvent } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useProviderStore } from '../../stores/providerStore'
import { useStreaming } from '../../hooks/useStreaming'
import type { LLMRequest } from '@shared/types/localmind-api'

interface Props {
  conversationId: string
}

export function ChatInput({ conversationId }: Props) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { isStreaming, addMessage, messages } = useChatStore()
  const { selectedModel } = useProviderStore()
  const { startStream, cancelStream } = useStreaming()

  const handleSend = useCallback(async () => {
    const content = input.trim()
    if (!content || isStreaming) return

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

    // Build message list for LLM — read state AFTER addMessage resolves
    // so the user message is guaranteed to be present in the store.
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

    await startStream(conversationId, request)
  }, [input, isStreaming, conversationId, selectedModel, addMessage, startStream])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Auto-resize
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }

  return (
    <div className="border-t border-border p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-3 bg-surface-offset rounded-2xl border border-border p-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Shift+Enter for newline)"
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-text placeholder:text-text-muted min-h-[24px] max-h-[200px]"
            disabled={isStreaming}
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
              disabled={!input.trim()}
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
