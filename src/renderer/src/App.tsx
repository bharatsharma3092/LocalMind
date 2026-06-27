import { useEffect, useState } from 'react'
import { Sidebar, type AppPage } from './components/sidebar/Sidebar'
import { ChatView } from './components/chat/ChatView'
import { McpManagementPage } from './components/mcp/McpManagementPage'
import { SkillsPage } from './components/skills/SkillsPage'
import { AgentsPage } from './components/agents/AgentsPage'
import { ConsensusPage } from './components/consensus/ConsensusPage'
import { ToastContainer } from './components/ui/ToastContainer'
import { SettingsPage } from './components/settings/SettingsPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ArtifactPanel } from './components/artifacts/ArtifactPanel'
import { McpPermissionDialog } from './components/mcp/McpPermissionDialog'
import { AgentToolPermissionDialog } from './components/agents/AgentToolPermissionDialog'
import { CommandPalette } from './components/layout/CommandPalette'
import { useSettingsStore } from './stores/settingsStore'
import { useProviderStore } from './stores/providerStore'
import { usePersonaStore } from './stores/personaStore'
import { useChatStore } from './stores/chatStore'

function App() {
  const { loadSettings } = useSettingsStore()
  const { refreshAllModels, loadCustomProviders } = useProviderStore()
  const { loadPersonas } = usePersonaStore()
  const clearActiveConversation = useChatStore((state) => state.clearActiveConversation)
  const [currentPage, setCurrentPage] = useState<AppPage>('chat')
  const [settingsTab, setSettingsTab] = useState<'general' | 'profile' | 'memory' | 'models' | 'mcp' | 'personas' | 'data'>('general')

  useEffect(() => {
    loadSettings()
    loadPersonas()
    loadCustomProviders().then(() => refreshAllModels())
  }, [loadSettings, loadPersonas, refreshAllModels, loadCustomProviders])

  useEffect(() => {
    const handleOpenSettingsTab = (event: Event) => {
      const customEvent = event as CustomEvent<'general' | 'profile' | 'memory' | 'models' | 'mcp' | 'personas' | 'data'>
      setSettingsTab(customEvent.detail ?? 'general')
      setCurrentPage('settings')
    }

    window.addEventListener('localmind:open-settings-tab', handleOpenSettingsTab)
    return () => window.removeEventListener('localmind:open-settings-tab', handleOpenSettingsTab)
  }, [])

  useEffect(() => {
    const handleGoHome = () => {
      clearActiveConversation()
      setCurrentPage('chat')
    }

    window.addEventListener('localmind:go-home', handleGoHome)
    return () => window.removeEventListener('localmind:go-home', handleGoHome)
  }, [clearActiveConversation])

  const handleNavigate = (page: AppPage) => {
    setCurrentPage(page)
  }

  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <ErrorBoundary>
      <div className="h-screen w-full overflow-hidden flex text-on-background bg-background">
        {/* Left panel — navigation (hideable) */}
        {sidebarOpen ? (
          <div className="relative w-[248px] shrink-0 h-full hidden md:block">
            <Sidebar
              currentPage={currentPage}
              onNavigate={handleNavigate}
              onSettingsClick={() => setCurrentPage('settings')}
            />
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-2.5 right-2 w-7 h-7 rounded-md flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors z-10"
              title="Hide sidebar"
            >
              <span className="material-symbols-outlined text-[18px]">left_panel_close</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSidebarOpen(true)}
            className="hidden md:flex absolute top-2.5 left-2 z-50 w-7 h-7 rounded-md items-center justify-center text-on-surface-variant hover:text-on-surface bg-surface-container border border-outline-variant transition-colors"
            title="Show sidebar"
          >
            <span className="material-symbols-outlined text-[18px]">left_panel_open</span>
          </button>
        )}

        {/* Center panel — workspace */}
        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
          {currentPage === 'chat' && (
            <ChatView
              currentPage={currentPage}
              onNavigate={handleNavigate}
              onSettingsClick={(tab) => {
                setSettingsTab(tab ?? 'general')
                setCurrentPage('settings')
              }}
            />
          )}
          {currentPage === 'mcp' && <McpManagementPage currentPage={currentPage} onNavigate={handleNavigate} />}
          {currentPage === 'skills' && <SkillsPage currentPage={currentPage} onNavigate={handleNavigate} />}
          {currentPage === 'agents' && <AgentsPage currentPage={currentPage} onNavigate={handleNavigate} />}
          {currentPage === 'consensus' && <ConsensusPage currentPage={currentPage} onNavigate={handleNavigate} />}
          {currentPage === 'settings' && (
            <SettingsPage initialTab={settingsTab} />
          )}
        </div>
        <ArtifactPanel />
        <ToastContainer />
        <McpPermissionDialog />
        <AgentToolPermissionDialog />
        <CommandPalette
          onNavigate={handleNavigate}
          onNewChat={() => {
            clearActiveConversation()
            useChatStore.getState().createConversation({})
            setCurrentPage('chat')
          }}
        />
      </div>
    </ErrorBoundary>
  )
}

export default App
