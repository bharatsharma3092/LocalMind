import { useEffect, useState } from 'react'
import { Sidebar, type AppPage } from './components/sidebar/Sidebar'
import { ChatView } from './components/chat/ChatView'
import { McpManagementPage } from './components/mcp/McpManagementPage'
import { SkillsPage } from './components/skills/SkillsPage'
import { ToastContainer } from './components/ui/ToastContainer'
import { SettingsPage } from './components/settings/SettingsPage'
import { ConfigurationPage } from './components/settings/ConfigurationPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ArtifactPanel } from './components/artifacts/ArtifactPanel'
import { McpPermissionDialog } from './components/mcp/McpPermissionDialog'
import { useSettingsStore } from './stores/settingsStore'
import { useProviderStore } from './stores/providerStore'
import { usePersonaStore } from './stores/personaStore'

function App() {
  const { loadSettings } = useSettingsStore()
  const { refreshAllModels, loadCustomProviders } = useProviderStore()
  const { loadPersonas } = usePersonaStore()
  const [currentPage, setCurrentPage] = useState<AppPage>('chat')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'general' | 'models' | 'mcp' | 'personas' | 'data'>('general')

  useEffect(() => {
    loadSettings()
    loadPersonas()
    loadCustomProviders().then(() => refreshAllModels())
  }, [loadSettings, loadPersonas, refreshAllModels, loadCustomProviders])

  useEffect(() => {
    const handleOpenSettingsTab = (event: Event) => {
      const customEvent = event as CustomEvent<'general' | 'models' | 'mcp' | 'personas' | 'data'>
      setSettingsTab(customEvent.detail ?? 'general')
      setSettingsOpen(true)
    }

    window.addEventListener('localmind:open-settings-tab', handleOpenSettingsTab)
    return () => window.removeEventListener('localmind:open-settings-tab', handleOpenSettingsTab)
  }, [])

  const handleNavigate = (page: AppPage) => {
    setCurrentPage(page)
  }

  return (
    <ErrorBoundary>
      <div className="h-screen w-full overflow-hidden flex text-on-background bg-background">
        {currentPage !== 'settings' && (
          <Sidebar
            currentPage={currentPage}
            onNavigate={handleNavigate}
            onSettingsClick={() => setSettingsOpen(true)}
          />
        )}
        <div className={`flex-1 flex flex-col h-full overflow-hidden ${currentPage !== 'settings' ? 'md:ml-[260px]' : ''}`}>
          {currentPage === 'chat' && (
            <ChatView onSettingsClick={(tab) => {
              setSettingsTab(tab ?? 'general')
              setSettingsOpen(true)
            }} />
          )}
          {currentPage === 'mcp' && <McpManagementPage />}
          {currentPage === 'skills' && <SkillsPage />}
          {currentPage === 'settings' && (
            <ConfigurationPage onNavigate={handleNavigate} />
          )}
        </div>
        <ArtifactPanel />
        <ToastContainer />
        <McpPermissionDialog />
        {settingsOpen && <SettingsPage initialTab={settingsTab} onClose={() => setSettingsOpen(false)} />}
      </div>
    </ErrorBoundary>
  )
}

export default App
