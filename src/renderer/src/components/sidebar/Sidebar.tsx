import { useEffect } from 'react'
import { ConversationList } from './ConversationList'
import { useChatStore } from '../../stores/chatStore'
import { usePersonaStore } from '../../stores/personaStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useRagStore } from '../../stores/ragStore'

export type AppPage = 'chat' | 'mcp' | 'skills' | 'agents' | 'settings'

interface Props {
  currentPage: AppPage
  onNavigate: (page: AppPage) => void
  onSettingsClick: () => void
}

type NavItem = {
  id: AppPage
  label: string
  icon: string
}

const mainNav: NavItem[] = [
  { id: 'chat', label: 'Conversations', icon: 'forum' },
  { id: 'agents', label: 'Agents', icon: 'smart_toy' },
  { id: 'skills', label: 'Skills', icon: 'psychology' },
  { id: 'mcp', label: 'MCP Servers', icon: 'hub' },
]

const footerNav = [
  { id: 'settings' as AppPage, label: 'Settings', icon: 'settings' },
]

export function Sidebar({ currentPage, onNavigate, onSettingsClick }: Props) {
  const { createConversation } = useChatStore()
  const draftPersonaId = usePersonaStore((state) => state.draftPersonaId)
  const { loadWorkspaces } = useWorkspaceStore()
  const { loadDocuments, loadStatus } = useRagStore()

  useEffect(() => {
    loadWorkspaces()
    loadDocuments()
    loadStatus()
  }, [loadWorkspaces, loadDocuments, loadStatus])

  return (
    <nav className="fixed left-0 top-0 h-full w-[260px] border-r border-outline-variant bg-surface-container-lowest flex flex-col py-4 z-40 hidden md:flex">
      {/* Header */}
      <div className="px-6 mb-8 flex items-center gap-3">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-primary-container/30 bg-surface-container text-primary shadow-sm">
          <span
            className="material-symbols-outlined font-black text-[22px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            memory
          </span>
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary-container text-[10px] text-white">
            <span className="material-symbols-outlined text-[12px]">lock</span>
          </span>
        </div>
        <div>
          <h1 className="text-primary-container font-black text-[20px] tracking-tight leading-tight">LocalMind</h1>
          <p className="text-[12px] text-on-surface-variant uppercase tracking-wider font-semibold leading-none mt-0.5">Privacy First AI</p>
        </div>
      </div>

      {/* CTA */}
      <div className="px-4 mb-6">
        <button
          onClick={() => createConversation({ personaId: draftPersonaId })}
          className="w-full bg-primary-container text-white hover:bg-accent-hover transition-colors duration-200 py-3 rounded-lg flex items-center justify-center gap-2 font-semibold text-[14px] shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Chat
        </button>
      </div>

      {/* Main Tabs */}
      <div className="px-2 space-y-1">
        {mainNav.map((item) => {
          const isActive = currentPage === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center py-3 px-4 text-[12px] uppercase tracking-widest font-bold transition-all duration-200 hover:translate-x-1 ${
                isActive
                  ? 'text-accent bg-accent/10 border-l-4 border-primary-container'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40 border-l-4 border-transparent'
              }`}
            >
              <span className="material-symbols-outlined mr-3 text-[20px]">{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </div>

      {/* Conversation list when Chat tab is active */}
      {currentPage === 'chat' && (
        <div className="flex-1 min-h-0 overflow-hidden mt-2 px-2">
          <div className="h-full overflow-y-auto">
            <ConversationList />
          </div>
        </div>
      )}

      {/* Spacer for other tabs */}
      {currentPage !== 'chat' && <div className="flex-1" />}

      {/* Footer Tabs */}
      <div className="mt-auto px-2 space-y-1 pt-4 border-t border-outline-variant/50">
        <button
          onClick={onSettingsClick}
          className={`w-full flex items-center py-3 px-4 text-[12px] uppercase tracking-widest font-bold transition-all hover:translate-x-1 duration-200 ${
            currentPage === 'settings'
              ? 'text-accent bg-accent/10 border-l-4 border-primary-container'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40 border-l-4 border-transparent'
          }`}
        >
          <span className="material-symbols-outlined mr-3 text-[20px]">settings</span>
          Settings
        </button>
      </div>
    </nav>
  )
}
