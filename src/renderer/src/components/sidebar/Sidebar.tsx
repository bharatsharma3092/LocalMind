import { ConversationList } from './ConversationList'
import { useChatStore } from '../../stores/chatStore'
import { useUIStore } from '../../stores/uiStore'

interface Props {
  onSettingsClick: () => void
}

export function Sidebar({ onSettingsClick }: Props) {
  const { createConversation } = useChatStore()
  const { sidebarOpen, toggleSidebar } = useUIStore()

  return (
    <div
      className={`shrink-0 h-full bg-surface border-r border-border flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${
        sidebarOpen ? 'w-[260px]' : 'w-[52px]'
      }`}
    >
      <div className="p-3 border-b border-border">
        {sidebarOpen ? (
          <button
            onClick={() => createConversation()}
            className="w-full btn-primary text-sm py-2.5"
          >
            + New Conversation
          </button>
        ) : (
          <button
            onClick={() => createConversation()}
            className="w-full flex items-center justify-center py-2.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors"
            title="New Conversation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </div>

      <div className={`flex-1 min-h-0 ${sidebarOpen ? '' : 'hidden'}`}>
        <ConversationList />
      </div>

      <div className="p-3 border-t border-border flex items-center gap-2">
        <button
          onClick={onSettingsClick}
          className="p-2 rounded-lg hover:bg-surface-offset text-text-muted hover:text-text transition-colors"
          title="Settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg hover:bg-surface-offset text-text-muted hover:text-text transition-colors"
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <svg className={`w-5 h-5 transition-transform ${sidebarOpen ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>

        {sidebarOpen && (
          <span className="text-xs text-text-muted ml-auto">LocalMind v1.0</span>
        )}
      </div>
    </div>
  )
}
