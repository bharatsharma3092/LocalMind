import { useEffect, useState } from 'react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { ModelSelector } from './ModelSelector'
import { ContextBar } from './ContextBar'
import { useChatStore } from '../../stores/chatStore'
import { usePersonaStore } from '../../stores/personaStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import type { AppPage } from '../sidebar/Sidebar'
import { ContextPanel } from '../layout/ContextPanel'

interface Props {
  currentPage: AppPage
  onNavigate: (page: AppPage) => void
  onSettingsClick: (tab?: 'general' | 'profile' | 'memory' | 'models' | 'mcp' | 'personas' | 'data') => void
}

const QUICK_ACTIONS = [
  { icon: 'edit_note', label: 'Draft something', prompt: 'Help me draft ' },
  { icon: 'code', label: 'Write code', prompt: 'Write a function that ' },
  { icon: 'travel_explore', label: 'Research a topic', prompt: 'Research and summarize ' },
  { icon: 'lightbulb', label: 'Plan a task', prompt: 'Help me plan ' },
]

export function ChatView({ currentPage, onNavigate, onSettingsClick }: Props) {
  const { activeConversationId, createConversation } = useChatStore()
  const draftPersonaId = usePersonaStore((state) => state.draftPersonaId)
  const { workspaces, activeWorkspaceId } = useWorkspaceStore()
  const [displayName, setDisplayName] = useState('')
  const [showContextPanel, setShowContextPanel] = useState(false)

  const hasActiveConv = !!activeConversationId
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const activeWorkspacePath = activeWorkspace?.rootPath ?? null

  useEffect(() => {
    window.localmind?.settings
      ?.get('userProfile')
      .then((res: any) => {
        if (res.success && res.data?.displayName) setDisplayName(res.data.displayName)
      })
      .catch(() => {})
  }, [])

  const startWith = (prompt: string) => {
    if (!activeConversationId) createConversation({ personaId: draftPersonaId })
    window.dispatchEvent(new CustomEvent('localmind:prefill-input', { detail: prompt }))
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background min-w-0">
      {/* Top bar — quiet, dense */}
      <header className="flex justify-between items-center w-full px-3 h-12 shrink-0 bg-surface border-b border-outline-variant">
        <div className="flex items-center gap-2 min-w-0">
          <div className="md:hidden">
            <button className="w-8 h-8 flex items-center justify-center rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low">
              <span className="material-symbols-outlined text-[20px]">menu</span>
            </button>
          </div>
          <ModelSelector />
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setShowContextPanel(!showContextPanel)}
            className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
              showContextPanel
                ? 'text-primary bg-primary/10'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
            }`}
            title="Toggle context panel"
          >
            <span className="material-symbols-outlined text-[20px]">right_panel_open</span>
          </button>
          <button
            onClick={() => onSettingsClick('memory')}
            className="w-8 h-8 flex items-center justify-center rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors"
            title="Memory"
          >
            <span className="material-symbols-outlined text-[20px]">neurology</span>
          </button>
          <button
            onClick={() => onSettingsClick('profile')}
            className="ml-1 w-8 h-8 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center hover:border-primary transition-colors"
            title="Profile"
          >
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">person</span>
          </button>
        </div>
      </header>

      {/* Workspace */}
      <main className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col h-full min-w-0">
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
            <div className="flex-1 flex flex-col items-center justify-center gap-7 px-6 overflow-y-auto">
              <div className="text-center">
                <h1 className="text-[26px] font-semibold text-on-surface tracking-tight">
                  {displayName ? `Welcome back, ${displayName}` : 'What can I help you with?'}
                </h1>
                <p className="text-[13px] text-on-surface-variant mt-1.5">
                  Ask anything, or pick a starting point below.
                </p>
              </div>

              <div className="w-full max-w-2xl">
                <ChatInput
                  conversationId={activeConversationId ?? ''}
                  disabled={false}
                  isLanding={true}
                  workspacePath={activeWorkspacePath}
                />
              </div>

              {/* Active empty state — never passive */}
              <div className="w-full max-w-2xl grid grid-cols-2 sm:grid-cols-4 gap-2">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => startWith(action.prompt)}
                    className="flex flex-col items-start gap-2 p-3 rounded-lg border border-outline-variant bg-surface-container-low hover:bg-surface-container hover:border-outline transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-[20px] text-primary">{action.icon}</span>
                    <span className="text-[12px] font-medium text-on-surface">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right panel — context (resizable width via breakpoints, hideable) */}
        {showContextPanel && (
          <div className="w-[320px] xl:w-[380px] shrink-0 h-full hidden lg:block">
            <ContextPanel
              conversationId={activeConversationId}
              onClose={() => setShowContextPanel(false)}
              onOpenMemory={() => onSettingsClick('memory')}
            />
          </div>
        )}
      </main>
    </div>
  )
}
