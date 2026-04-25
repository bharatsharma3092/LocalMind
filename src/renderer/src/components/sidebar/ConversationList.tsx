import { useState, useEffect } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useDebounce } from '../../hooks/useDebounce'

function getConversationDisplayName(conv: { title: string | null; id: string }, messages: Record<string, { role: string; content: string }[]>): string {
  if (conv.title) return conv.title
  const msgs = messages[conv.id]
  if (msgs && msgs.length > 0) {
    const firstUserMsg = msgs.find((m) => m.role === 'user')
    if (firstUserMsg) {
      const preview = firstUserMsg.content.replace(/\n/g, ' ').trim()
      return preview.length > 50 ? preview.slice(0, 50) + '...' : preview
    }
  }
  return 'New Conversation'
}

export function ConversationList() {
  const { conversations, messages, activeConversationId, selectConversation, deleteConversation, loadConversations, searchConversations, toggleStarred } = useChatStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [contextMenu, setContextMenu] = useState<{ convId: string; x: number; y: number } | null>(null)
  const debouncedQuery = useDebounce(searchQuery, 300)

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    searchConversations(debouncedQuery)
  }, [debouncedQuery, searchConversations])

  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  const starredConvs = conversations.filter((c) => c.starred)
  const otherConvs = conversations.filter((c) => !c.starred)

  const handleExportConversation = async (convId: string, format: 'md' | 'pdf') => {
    await window.localmind.data.exportConversation(convId, format)
  }

  const renderConvItem = (conv: any) => (
    <div
      key={conv.id}
      onClick={() => selectConversation(conv.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        setContextMenu({ convId: conv.id, x: e.clientX, y: e.clientY })
      }}
      className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer mb-1 transition-colors ${
        activeConversationId === conv.id
          ? 'bg-accent/10 text-accent'
          : 'hover:bg-surface-hover text-text'
      }`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          toggleStarred(conv.id)
        }}
        className={`flex-shrink-0 transition-colors ${
          conv.starred
            ? 'text-amber-400 hover:text-amber-300'
            : 'text-transparent group-hover:text-text-muted hover:text-amber-400'
        }`}
        title={conv.starred ? 'Unstar' : 'Star'}
      >
        <svg className="w-3.5 h-3.5" fill={conv.starred ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {getConversationDisplayName(conv, messages)}
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
  )

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
        {starredConvs.length > 0 && (
          <div className="mb-2">
            <div className="px-3 py-1 text-xs font-semibold text-text-muted uppercase tracking-wider">
              Starred
            </div>
            {starredConvs.map(renderConvItem)}
          </div>
        )}
        {otherConvs.length > 0 && starredConvs.length > 0 && (
          <div className="px-3 py-1 text-xs font-semibold text-text-muted uppercase tracking-wider">
            Recent
          </div>
        )}
        {(starredConvs.length > 0 ? otherConvs : conversations).map(renderConvItem)}
        {conversations.length === 0 && (
          <div className="p-4 text-center text-sm text-text-muted">No conversations yet</div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed bg-surface border border-border rounded-xl shadow-2xl py-1 z-[100] min-w-48"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              toggleStarred(contextMenu.convId)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-muted hover:bg-surface-offset hover:text-text transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            Toggle Star
          </button>
          <div className="border-t border-border my-1" />
          <button
            onClick={() => {
              handleExportConversation(contextMenu.convId, 'md')
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-muted hover:bg-surface-offset hover:text-text transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export as Markdown
          </button>
          <button
            onClick={() => {
              handleExportConversation(contextMenu.convId, 'pdf')
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-muted hover:bg-surface-offset hover:text-text transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export as PDF
          </button>
          <div className="border-t border-border my-1" />
          <button
            onClick={() => {
              deleteConversation(contextMenu.convId)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-surface-offset transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
