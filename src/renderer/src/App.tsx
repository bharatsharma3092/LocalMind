import { useEffect, useState } from 'react'
import { Sidebar } from './components/sidebar/Sidebar'
import { ChatView } from './components/chat/ChatView'
import { ToastContainer } from './components/ui/ToastContainer'
import { SettingsPage } from './components/settings/SettingsPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ArtifactPanel } from './components/artifacts/ArtifactPanel'
import { McpPermissionDialog } from './components/mcp/McpPermissionDialog'
import { useSettingsStore } from './stores/settingsStore'
import { useProviderStore } from './stores/providerStore'

function App() {
  const { loadSettings } = useSettingsStore()
  const { refreshAllModels } = useProviderStore()
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    loadSettings()
    refreshAllModels()
  }, [loadSettings, refreshAllModels])

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-surface text-text">
        <Sidebar onSettingsClick={() => setSettingsOpen(true)} />
        <div className="flex-1 flex flex-col min-w-0">
          <ChatView />
        </div>
        <ArtifactPanel />
        <ToastContainer />
        <McpPermissionDialog />
        {settingsOpen && <SettingsPage onClose={() => setSettingsOpen(false)} />}
      </div>
    </ErrorBoundary>
  )
}

export default App
