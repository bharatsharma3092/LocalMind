import { useEffect } from 'react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { ModelSelector } from './ModelSelector'
import { ContextBar } from './ContextBar'
import { useChatStore } from '../../stores/chatStore'
import { useProviderStore } from '../../stores/providerStore'

export function ChatView() {
  const { activeConversationId, conversations, createConversation } = useChatStore()
  const { refreshModels } = useProviderStore()

  useEffect(() => {
    refreshModels('ollama')
  }, [refreshModels])

  const activeConversation = conversations.find((c) => c.id === activeConversationId)

  if (!activeConversationId) {
    return (
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
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <h2 className="text-sm font-medium truncate">{activeConversation?.title ?? 'New Conversation'}</h2>
        <div className="flex items-center gap-2">
          <ModelSelector />
        </div>
      </div>
      <ContextBar conversationId={activeConversationId} />
      <MessageList conversationId={activeConversationId} />
      <ChatInput conversationId={activeConversationId} />
    </div>
  )
}
