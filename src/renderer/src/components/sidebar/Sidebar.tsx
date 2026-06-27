import { useEffect, useState } from 'react'
import { ConversationList } from './ConversationList'
import { useChatStore } from '../../stores/chatStore'
import { usePersonaStore } from '../../stores/personaStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useRagStore } from '../../stores/ragStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { LocalMindLogo } from '../branding/LocalMindLogo'

export type AppPage = 'chat' | 'mcp' | 'skills' | 'agents' | 'consensus' | 'settings'

interface Props {
  currentPage: AppPage
  onNavigate: (page: AppPage) => void
  onSettingsClick: () => void
}

const PRIMARY_NAV: { id: AppPage; label: string; icon: string }[] = [
  { id: 'chat', label: 'Home', icon: 'home' },
  { id: 'agents', label: 'Agents', icon: 'smart_toy' },
  { id: 'skills', label: 'Skills', icon: 'auto_awesome' },
  { id: 'mcp', label: 'Connections', icon: 'hub' },
  { id: 'consensus', label: 'Consensus', icon: 'forum' },
]

export function Sidebar({ currentPage, onNavigate, onSettingsClick }: Props) {
  const { createConversation, clearActiveConversation } = useChatStore()
  const draftPersonaId = usePersonaStore((state) => state.draftPersonaId)
  const theme = useSettingsStore((state) => state.theme)
  const { loadWorkspaces } = useWorkspaceStore()
  const { loadDocuments, loadStatus } = useRagStore()
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
  )

  useEffect(() => {
    loadWorkspaces()
    loadDocuments()
    loadStatus()
  }, [loadWorkspaces, loadDocuments, loadStatus])

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!query) return
    const handleChange = () => setSystemPrefersDark(query.matches)
    handleChange()
    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [])

  const logoVariant = theme === 'light' || (theme === 'system' && !systemPrefersDark) ? 'light' : 'dark'
  const goHome = () => {
    clearActiveConversation()
    onNavigate('chat')
  }

  return (
    <nav className="h-full w-full flex flex-col bg-surface-container-lowest border-r border-outline-variant">
      {/* Brand */}
      <div className="h-12 px-3 flex items-center border-b border-outline-variant">
        <button
          type="button"
          onClick={goHome}
          className="h-8 flex items-center rounded-md px-1.5 -ml-1 hover:bg-surface-container-low transition-colors"
          aria-label="LocalMind home"
          title="Home"
        >
          <LocalMindLogo variant={logoVariant} />
        </button>
      </div>

      {/* Quick actions: New chat + command palette hint */}
      <div className="p-3 space-y-2">
        <button
          onClick={() => {
            createConversation({ personaId: draftPersonaId })
            onNavigate('chat')
          }}
          className="w-full h-9 bg-primary-container text-on-primary-container hover:opacity-90 transition-opacity rounded-lg flex items-center justify-center gap-2 font-semibold text-[13px]"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Chat
        </button>
        <button
          onClick={() => window.dispatchEvent(new Event('localmind:open-command-palette'))}
          className="w-full h-8 rounded-lg flex items-center gap-2 px-2.5 text-[12px] text-on-surface-variant bg-surface-container-low hover:bg-surface-container border border-outline-variant transition-colors"
          title="Search and commands"
        >
          <span className="material-symbols-outlined text-[16px]">search</span>
          <span className="flex-1 text-left">Search…</span>
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant">⌘K</kbd>
        </button>
      </div>

      {/* Recent chats — the workspace's primary list */}
      <div className="flex-1 min-h-0 flex flex-col px-1.5">
        <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
          Recent
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <ConversationList onConversationClick={() => onNavigate('chat')} />
        </div>
      </div>

      {/* Primary navigation — quiet, secondary to search/AI */}
      <div className="px-1.5 py-2 border-t border-outline-variant space-y-0.5">
        {PRIMARY_NAV.map((item) => {
          const active = currentPage === item.id
          return (
            <button
              key={item.id}
              onClick={() => (item.id === 'chat' ? goHome() : onNavigate(item.id))}
              className={`w-full flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] font-medium transition-colors ${
                active
                  ? 'bg-surface-container-high text-on-surface'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
              }`}
            >
              <span className={`material-symbols-outlined text-[18px] ${active ? 'text-primary' : ''}`}>
                {item.icon}
              </span>
              {item.label}
            </button>
          )
        })}
        <button
          onClick={onSettingsClick}
          className={`w-full flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[13px] font-medium transition-colors ${
            currentPage === 'settings'
              ? 'bg-surface-container-high text-on-surface'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
          }`}
        >
          <span className={`material-symbols-outlined text-[18px] ${currentPage === 'settings' ? 'text-primary' : ''}`}>
            settings
          </span>
          Settings
        </button>
      </div>
    </nav>
  )
}
