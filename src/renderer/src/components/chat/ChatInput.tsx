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
    // -----------------------------------------------------------------------
    // TRACE 1: raw input captured the moment Send is triggered
    // -----------------------------------------------------------------------
    log.info('handleSend', '>>> SEND TRIGGERED <<<', {
      rawInput: input,
      rawInputLength: input.length,
      isStreaming,
      conversationId,
      disabled,
      selectedModel: selectedModel?.id ?? '(none)',
      selectedProvider: selectedModel?.provider ?? '(none)',
    })

    const content = input.trim()

    // -----------------------------------------------------------------------
    // TRACE 2: after trim -- shows exactly what will be sent (or why we bail)
    // -----------------------------------------------------------------------
    log.info('handleSend', 'After trim guard', {
      trimmedContent: content,
      trimmedLength: content.length,
      willProceed: !!(content && !isStreaming && conversationId && !disabled),
      guardChecks: {
        hasContent: !!content,
        notStreaming: !isStreaming,
        hasConvId: !!conversationId,
        notDisabled: !disabled,
      },
    })

    if (!content || isStreaming || !conversationId || disabled) {
      log.warn('handleSend', 'Guard failed -- aborting send', {
        content: content || '(empty)',
        isStreaming,
        conversationId: conversationId || '(missing)',
        disabled,
      })
      return
    }

    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    // -----------------------------------------------------------------------
    // TRACE 3: user message about to be persisted to DB + store
    // -----------------------------------------------------------------------
    log.info('handleSend', 'Calling addMessage for user turn', {
      conversationId,
      role: 'user',
      contentPreview: content.slice(0, 300),
      contentLength: content.length,
    })

    // Save user message and wait for it to be persisted + added to store
    const userMsg = await addMessage({
      conversationId,
      role: 'user',
      content,
    })

    // -----------------------------------------------------------------------
    // TRACE 4: addMessage resolved -- show what came back
    // -----------------------------------------------------------------------
    log.info('handleSend', 'addMessage resolved', {
      savedMsgId: (userMsg as any)?.id ?? '(no id returned)',
      savedRole: (userMsg as any)?.role ?? '(unknown)',
      savedContentPreview: ((userMsg as any)?.content ?? '').slice(0, 200),
    })

    // Build message list for LLM -- read state AFTER addMessage resolves
    const allMessages = useChatStore.getState().messages[conversationId] ?? []

    // -----------------------------------------------------------------------
    // TRACE 5: raw store snapshot before filtering
    // -----------------------------------------------------------------------
    log.info('handleSend', 'Raw store snapshot after addMessage', {
      conversationId,
      totalMessagesInStore: allMessages.length,
      storeSnapshot: allMessages.map((m, i) => ({
        index: i,
        id: m.id,
        role: m.role,
        isStreaming: m.isStreaming ?? false,
        contentLength: m.content?.length ?? 0,
        contentPreview: (m.content ?? '').slice(0, 150),
      })),
    })

    const llmMessages = allMessages
      .filter((m) => !m.isStreaming)
      .map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      }))

    // -----------------------------------------------------------------------
    // TRACE 6: exact payload that will be handed to the LLM
    // -----------------------------------------------------------------------
    log.info('handleSend', '>>> FULL LLM PAYLOAD <<<', {
      model: selectedModel?.id ?? 'qwen2.5:7b',
      provider: selectedModel?.provider ?? 'ollama',
      messageCount: llmMessages.length,
      messages: llmMessages.map((m, i) => ({
        index: i,
        role: m.role,
        contentLength: m.content?.length ?? 0,
        content: m.content,          // full content -- NOT truncated
      })),
    })

    const request: LLMRequest = {
      messages: llmMessages,
      model: selectedModel?.id ?? 'qwen2.5:7b',
      provider: (selectedModel?.provider as any) ?? 'ollama',
      stream: true,
    }

    // -----------------------------------------------------------------------
    // TRACE 7: calling startStream -- last renderer-side checkpoint
    // -----------------------------------------------------------------------
    log.info('handleSend', 'Calling startStream', {
      streamModel: request.model,
      streamProvider: request.provider,
      streamMessageCount: request.messages.length,
      lastUserMsg: request.messages.filter(m => m.role === 'user').at(-1)?.content ?? '(none)',
    })

    await startStream(conversationId, request)

    log.info('handleSend', 'startStream awaited -- control returned to handleSend', { conversationId })
  }, [input, isStreaming, conversationId, disabled, selectedModel, addMessage, startStream])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      log.info('handleKeyDown', 'Enter pressed -- calling handleSend', { inputLength: input.length })
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
