import { useEffect, useState } from 'react'
import { Sidebar } from './components/sidebar/Sidebar'
import { ChatView } from './components/chat/ChatView'
import { ToastContainer } from './components/ui/ToastContainer'
import { SettingsPage } from './components/settings/SettingsPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useUIStore } from './stores/uiStore'
import { useSettingsStore } from './stores/settingsStore'
import { useProviderStore } from './stores/providerStore'

function App() {
  const { sidebarOpen, toggleSidebar } = useUIStore()
  const { loadSettings } = useSettingsStore()
  const { refreshModels } = useProviderStore()
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    loadSettings()
    refreshModels('ollama')
  }, [loadSettings, refreshModels])

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-surface text-text">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface">
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-lg hover:bg-surface-offset text-text-muted hover:text-text transition-colors"
              title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              ☰
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-lg hover:bg-surface-offset text-text-muted hover:text-text transition-colors"
                title="Settings"
              >
                ⚙
              </button>
            </div>
          </div>
          <ChatView />
        </div>
        <ToastContainer />
        {settingsOpen && <SettingsPage onClose={() => setSettingsOpen(false)} />}
      </div>
    </ErrorBoundary>
  )
}

export default App
