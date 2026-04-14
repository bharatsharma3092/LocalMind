import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { ModelSelector } from './ModelSelector'
import { ContextBar } from './ContextBar'
import { useChatStore } from '../../stores/chatStore'

export function ChatView() {
  const { activeConversationId, conversations, createConversation } = useChatStore()

  const activeConversation = conversations.find((c) => c.id === activeConversationId)
  const hasActiveConv = !!activeConversationId

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* ── Active conversation header + message area ── */}
      {hasActiveConv ? (
        <>
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <h2 className="text-sm font-medium truncate">
              {activeConversation?.title ?? 'New Conversation'}
            </h2>
            <div className="flex items-center gap-2">
              <ModelSelector />
            </div>
          </div>
          <ContextBar conversationId={activeConversationId} />
          <MessageList conversationId={activeConversationId} />
        </>
      ) : (
        /* ── Welcome screen (sits above the always-mounted ChatInput) ── */
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-text-muted">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-text mb-2">LocalMind</h1>
            <p className="text-sm">Privacy-first AI assistant with MCP support</p>
          </div>
          <button
            onClick={() => createConversation()}
            className="btn-primary text-base px-6 py-3"
          >
            Start New Conversation
          </button>
        </div>
      )}

      {/*
       * ChatInput is ALWAYS mounted — never conditional on activeConversationId.
       *
       * Why: useStreaming() is a hook instance tied to this component. If ChatInput
       * unmounts (e.g. during the brief null-flash between deleteConversation and
       * createConversation), the ipcRenderer listeners for llm:chunk/:done/:error
       * are destroyed and signalReady is never sent.  The main-process buffer then
       * waits forever, pendingClear fires in the finally{} block, and the reply is
       * silently dropped.
       *
       * `disabled` makes the textarea + send button inert when no conversation is
       * active, so the hook stays alive without exposing broken UX.
       */}
      <ChatInput
        conversationId={activeConversationId ?? ''}
        disabled={!hasActiveConv}
      />
    </div>
  )
}
