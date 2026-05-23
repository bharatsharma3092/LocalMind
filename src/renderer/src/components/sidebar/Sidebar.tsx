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

export function Sidebar({ currentPage, onNavigate, onSettingsClick }: Props) {
  const { createConversation, clearActiveConversation } = useChatStore()
  const draftPersonaId = usePersonaStore((state) => state.draftPersonaId)
  const theme = useSettingsStore((state) => state.theme)
  const { loadWorkspaces } = useWorkspaceStore()
  const { loadDocuments, loadStatus } = useRagStore()
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true)

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
    <nav className="fixed left-0 top-0 h-full w-[260px] border-r border-outline-variant bg-surface-container-lowest flex flex-col py-4 z-40 hidden md:flex">
      {/* Header */}
      <button
        type="button"
        onClick={goHome}
        className="mx-5 mb-8 h-[68px] cursor-pointer rounded-lg text-left transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        aria-label="Go to LocalMind home"
        title="Home"
      >
        <LocalMindLogo variant={logoVariant} />
      </button>

      {/* CTA */}
      <div className="px-4 mb-4">
        <button
          onClick={() => { createConversation({ personaId: draftPersonaId }); onNavigate('chat') }}
          className="w-full bg-primary-container text-white hover:bg-accent-hover transition-colors duration-200 py-3 rounded-lg flex items-center justify-center gap-2 font-semibold text-[14px] shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Chat
        </button>
      </div>

      {/* Conversation list — always visible */}
      <div className="flex-1 min-h-0 overflow-hidden px-2">
        <div className="h-full overflow-y-auto">
          <ConversationList onConversationClick={() => onNavigate('chat')} />
        </div>
      </div>

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
