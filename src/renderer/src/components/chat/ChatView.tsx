import { useEffect, useState } from 'react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { ModelSelector } from './ModelSelector'
import { ContextBar } from './ContextBar'
import { PageNavIcons } from '../ui/PageNavIcons'
import { useChatStore } from '../../stores/chatStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import type { AppPage } from '../sidebar/Sidebar'
import { TraceHUD } from './TraceHUD'

interface Props {
  currentPage: AppPage
  onNavigate: (page: AppPage) => void
  onSettingsClick: (tab?: 'general' | 'profile' | 'memory' | 'models' | 'mcp' | 'personas' | 'data') => void
}

const topNavTabs = [
  { id: 'chat', label: 'Chat', active: true },
]

export function ChatView({ currentPage, onNavigate, onSettingsClick }: Props) {
  const { activeConversationId, messages } = useChatStore()
  const { workspaces, activeWorkspaceId } = useWorkspaceStore()
  const [displayName, setDisplayName] = useState('')
  const [showTracePanel, setShowTracePanel] = useState(false)

  const hasActiveConv = !!activeConversationId
  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId)
  const activeWorkspacePath = activeWorkspace?.rootPath ?? null

  useEffect(() => {
    window.localmind?.settings?.get('userProfile').then((res) => {
      if (res.success && res.data?.displayName) setDisplayName(res.data.displayName)
    }).catch(() => {})
  }, [])

  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* TopAppBar */}
      <header className="flex justify-between items-center w-full px-5 py-1 z-50 h-12 bg-surface-container-low/90 backdrop-blur-md border-b border-outline-variant/70">
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
                className={`px-3 py-3 h-12 flex items-center text-sm tracking-tight transition-colors duration-200 ${
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
              onClick={() => setShowTracePanel(!showTracePanel)}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-200 cursor-pointer active:scale-95 ${
                showTracePanel ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
              }`}
              title="Toggle Tool Trace Panel"
            >
              <span className="material-symbols-outlined text-[20px]">analytics</span>
            </button>
            <button
              onClick={() => onSettingsClick('memory')}
              className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors duration-200 cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[20px]">memory</span>
            </button>
            <button
              onClick={onSettingsClick}
              className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors duration-200 cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[20px]">settings</span>
            </button>
          </div>
          {/* Text Actions */}
          <button
            onClick={onSettingsClick}
            className="hidden sm:block text-on-surface-variant hover:text-on-surface font-semibold text-[13px] cursor-pointer active:scale-95 transition-colors duration-200"
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
                workspacePath={activeWorkspacePath}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 text-on-surface-variant px-6">
              <div className="text-center">
                <h1 className="text-3xl font-semibold text-on-surface mb-2">
                  {displayName ? `Welcome back, ${displayName}` : 'Welcome to LocalMind'}
                </h1>
                <p className="text-sm text-on-surface-variant/80">Privacy-first AI assistant with MCP support</p>
              </div>
              <div className="w-full max-w-3xl">
                <ChatInput
                  conversationId={activeConversationId ?? ''}
                  disabled={false}
                  isLanding={true}
                  workspacePath={activeWorkspacePath}
                />
              </div>
            </div>
          )}
        </div>
        {showTracePanel && activeConversationId && (
          <TraceHUD
            conversationId={activeConversationId}
            onClose={() => setShowTracePanel(false)}
          />
        )}
      </main>
    </div>
  )
}
