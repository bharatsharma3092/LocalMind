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

  return (
    <ErrorBoundary>
      <div className="h-screen w-full overflow-hidden flex text-on-background bg-background">
        <Sidebar
          currentPage={currentPage}
          onNavigate={handleNavigate}
          onSettingsClick={() => setCurrentPage('settings')}
        />
        <div className="flex-1 flex flex-col h-full overflow-hidden md:ml-[260px]">
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
      </div>
    </ErrorBoundary>
  )
}

export default App
