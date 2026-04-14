import { useState, useEffect } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useDebounce } from '../../hooks/useDebounce'

export function ConversationList() {
  const { conversations, activeConversationId, selectConversation, deleteConversation, loadConversations, searchConversations } = useChatStore()
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedQuery = useDebounce(searchQuery, 300)

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    searchConversations(debouncedQuery)
  }, [debouncedQuery, searchConversations])

  return (
    <div className="flex flex-col h-full">
      <div className="p-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search conversations..."
          className="w-full bg-surface-offset border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent text-text placeholder:text-text-muted"
        />
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            onClick={() => selectConversation(conv.id)}
            className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer mb-1 transition-colors ${
              activeConversationId === conv.id
                ? 'bg-accent/10 text-accent'
                : 'hover:bg-surface-hover text-text'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {conv.title ?? 'New Conversation'}
              </div>
              <div className="text-xs text-text-muted">
                {new Date(conv.updatedAt).toLocaleDateString()}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                deleteConversation(conv.id)
              }}
              className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger text-xs"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
        {conversations.length === 0 && (
          <div className="p-4 text-center text-sm text-text-muted">No conversations yet</div>
        )}
      </div>
    </div>
  )
}
