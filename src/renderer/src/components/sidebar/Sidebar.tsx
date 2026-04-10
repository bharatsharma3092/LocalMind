import { ConversationList } from './ConversationList'
import { useChatStore } from '../../stores/chatStore'
import { useUIStore } from '../../stores/uiStore'

export function Sidebar() {
  const { createConversation } = useChatStore()
  const { sidebarOpen } = useUIStore()

  if (!sidebarOpen) return null

  return (
    <div className="w-[260px] shrink-0 h-full bg-surface border-r border-border flex flex-col">
      <div className="p-3 border-b border-border">
        <button
          onClick={() => createConversation()}
          className="w-full btn-primary text-sm py-2.5"
        >
          + New Conversation
        </button>
      </div>
      <ConversationList />
      <div className="p-3 border-t border-border text-xs text-text-muted text-center">
        LocalMind v1.0
      </div>
    </div>
  )
}
