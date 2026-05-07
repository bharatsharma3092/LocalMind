import { useEffect, useState } from 'react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { ModelSelector } from './ModelSelector'
import { ContextBar } from './ContextBar'
import { PageNavIcons } from '../ui/PageNavIcons'
import { useChatStore } from '../../stores/chatStore'
import type { AppPage } from '../sidebar/Sidebar'

interface Props {
  currentPage: AppPage
  onNavigate: (page: AppPage) => void
  onSettingsClick: (tab?: 'general' | 'profile' | 'memory' | 'models' | 'mcp' | 'personas' | 'data') => void
}

const topNavTabs = [
  { id: 'chat', label: 'Chat', active: true },
]

export function ChatView({ currentPage, onNavigate, onSettingsClick }: Props) {
  const { activeConversationId } = useChatStore()
  const [displayName, setDisplayName] = useState('')

  const hasActiveConv = !!activeConversationId

  useEffect(() => {
    window.localmind?.settings?.get('userProfile').then((res) => {
      if (res.success && res.data?.displayName) setDisplayName(res.data.displayName)
    }).catch(() => {})
  }, [])

  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* TopAppBar */}
      <header className="flex justify-between items-center w-full px-6 py-2 z-50 h-14 bg-surface-container-low/80 backdrop-blur-md border-b border-outline-variant shadow-sm">
        {/* Left: Model Selector & Multi-tab */}
        <div className="flex items-center gap-6">
          {/* Mobile Menu Trigger */}
          <button className="md:hidden text-on-surface-variant hover:text-on-surface cursor-pointer active:scale-95">
            <span className="material-symbols-outlined">menu</span>
          </button>
          {/* Model Selector */}
          <ModelSelector />
          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {topNavTabs.map((tab) => (
              <a
                key={tab.id}
                href="#"
                className={`px-3 py-4 h-14 flex items-center text-sm tracking-tight transition-colors duration-200 ${
                  tab.active
                    ? 'text-primary border-b-2 border-primary font-semibold hover:bg-surface-container-low'
                    : 'text-on-surface-variant hover:text-on-surface font-medium hover:bg-surface-container-low'
                }`}
              >
                {tab.label}
              </a>
            ))}
          </nav>
          {/* Page Nav Icons */}
          <PageNavIcons currentPage={currentPage} onNavigate={onNavigate} />
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-4">
          {/* Icon Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onSettingsClick('memory')}
              className="w-9 h-9 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors duration-200 cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[20px]">memory</span>
            </button>
            <button
              onClick={onSettingsClick}
              className="w-9 h-9 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors duration-200 cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[20px]">settings</span>
            </button>
          </div>
          {/* Text Actions */}
          <button
            onClick={onSettingsClick}
            className="hidden sm:block text-on-surface-variant hover:text-on-surface font-semibold text-[14px] cursor-pointer active:scale-95 transition-colors duration-200"
          >
            Model Settings
          </button>
          {/* Profile */}
          <button
            onClick={() => onSettingsClick('profile')}
            className="w-8 h-8 rounded-full bg-surface-container border border-outline-variant overflow-hidden cursor-pointer active:scale-95 ml-2 flex items-center justify-center hover:border-primary transition-colors"
            title="Profile"
          >
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">person</span>
          </button>
        </div>
      </header>

      {/* Workspace Area */}
      <main className="flex-1 flex overflow-hidden">
        {/* Chat Column */}
        <div className="flex-1 flex flex-col h-full border-r border-surface-container-high relative">
          {hasActiveConv ? (
            <>
              <ContextBar conversationId={activeConversationId} />
              <MessageList conversationId={activeConversationId} />
              <ChatInput
                conversationId={activeConversationId ?? ''}
                disabled={!hasActiveConv}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-8 text-on-surface-variant px-6">
              <div className="text-center">
                <h1 className="text-4xl font-bold text-on-surface mb-3">
                  {displayName ? `Welcome back, ${displayName}` : 'Welcome to LocalMind'}
                </h1>
                <p className="text-sm text-on-surface-variant/80">Privacy-first AI assistant with MCP support</p>
              </div>
              <div className="w-full max-w-3xl">
                <ChatInput
                  conversationId={activeConversationId ?? ''}
                  disabled={false}
                  isLanding={true}
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
