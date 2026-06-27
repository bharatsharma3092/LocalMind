import { useState, useEffect, useCallback } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { PersonaLibrary } from '../personas/PersonaLibrary'
import type { AppPage } from '../sidebar/Sidebar'

type ConfigTab = 'general' | 'appearance' | 'personas' | 'data'
type ColorTheme = 'default' | 'amber' | 'orange' | 'rose' | 'crimson' | 'coral' | 'sunset' | 'gold' | 'copper' | 'blue' | 'sky' | 'cyan' | 'teal' | 'emerald' | 'green' | 'lime' | 'violet' | 'purple' | 'fuchsia' | 'pink' | 'slate'
type Theme = 'light' | 'dark' | 'system'

const colorOptions: { id: ColorTheme; label: string; hex: string }[] = [
  { id: 'default', label: 'Indigo', hex: '#6c5ce7' },
  { id: 'amber', label: 'Amber', hex: '#d97706' },
  { id: 'orange', label: 'Orange', hex: '#ea580c' },
  { id: 'rose', label: 'Rose', hex: '#e11d48' },
  { id: 'crimson', label: 'Crimson', hex: '#dc2626' },
  { id: 'coral', label: 'Coral', hex: '#f87171' },
  { id: 'sunset', label: 'Sunset', hex: '#fb923c' },
  { id: 'gold', label: 'Gold', hex: '#eab308' },
  { id: 'copper', label: 'Copper', hex: '#c2742e' },
  { id: 'blue', label: 'Blue', hex: '#2563eb' },
  { id: 'sky', label: 'Sky', hex: '#0284c7' },
  { id: 'cyan', label: 'Cyan', hex: '#0891b2' },
  { id: 'teal', label: 'Teal', hex: '#0d9488' },
  { id: 'emerald', label: 'Emerald', hex: '#059669' },
  { id: 'green', label: 'Green', hex: '#16a34a' },
  { id: 'lime', label: 'Lime', hex: '#65a30d' },
  { id: 'violet', label: 'Violet', hex: '#7c3aed' },
  { id: 'purple', label: 'Purple', hex: '#9333ea' },
  { id: 'fuchsia', label: 'Fuchsia', hex: '#c026d3' },
  { id: 'pink', label: 'Pink', hex: '#db2777' },
  { id: 'slate', label: 'Slate', hex: '#475569' },
]

const navItems: { id: ConfigTab; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'personas', label: 'Personas', icon: 'person' },
  { id: 'data', label: 'Data Management', icon: 'database' },
]

interface SystemStatus {
  memoryUsed: number
  memoryTotal: number
  rss: number
}

interface ShortcutDef {
  id: string
  label: string
  keys: string[]
}

const defaultShortcuts: ShortcutDef[] = [
  { id: 'globalSearch', label: 'Global Search', keys: ['Ctrl', 'Shift', 'Space'] },
  { id: 'newChat', label: 'New Chat', keys: ['Ctrl', 'N'] },
  { id: 'settings', label: 'Settings', keys: ['Ctrl', ','] },
  { id: 'toggleSidebar', label: 'Toggle Sidebar', keys: ['Ctrl', '\\'] },
]

export function ConfigurationPage({ onNavigate }: { onNavigate: (page: AppPage) => void }) {
  const [tab, setTab] = useState<ConfigTab>('general')
  const [hasChanges, setHasChanges] = useState(false)
  const [saving, setSaving] = useState(false)

  // Settings state
  const { theme, colorTheme, privacyMode, setTheme, setColorTheme, setPrivacyMode } = useSettingsStore()
  const [launchOnStartup, setLaunchOnStartup] = useState(false)
  const [systemTray, setSystemTray] = useState(false)
  const [checkUpdates, setCheckUpdates] = useState(true)
  const [globalShortcut, setGlobalShortcut] = useState('Ctrl+Shift+Space')
  const [defaultModel, setDefaultModel] = useState<string>('')
  const [contextLength, setContextLength] = useState(8192)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [recordingShortcut, setRecordingShortcut] = useState(false)

  // Load all settings on mount
  useEffect(() => {
    const load = async () => {
      const api = (window as any).localmind
      if (!api?.settings?.getAll) return
      try {
        const res = await api.settings.getAll()
        if (res?.success && res.data) {
          const data = res.data
          setLaunchOnStartup(data.launchOnStartup ?? false)
          setSystemTray(data.systemTray ?? false)
          setCheckUpdates(data.checkUpdates ?? true)
          setGlobalShortcut(data.globalShortcut ?? 'Ctrl+Shift+Space')
          setDefaultModel(data.defaultModel ?? '')
          setContextLength(data.contextLength ?? 8192)
        }
      } catch (err) {
        console.error('[ConfigurationPage] Failed to load settings:', err)
      }
    }
    load()
  }, [])

  // Load system status
  useEffect(() => {
    const loadStatus = async () => {
      const api = (window as any).localmind
      if (!api?.system?.status) return
      try {
        const status = await api.system.status()
        setSystemStatus(status)
      } catch (err) {
        console.error('[ConfigurationPage] Failed to load system status:', err)
      }
    }
    loadStatus()
    const interval = setInterval(loadStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  // Load available models
  useEffect(() => {
    const loadModels = async () => {
      const api = (window as any).localmind
      if (!api?.llm?.listModels) return
      try {
        const providers = ['ollama', 'openai', 'openrouter', 'google']
        const allModels: string[] = []
        for (const provider of providers) {
          const res = await api.llm.listModels(provider)
          if (Array.isArray(res)) {
            allModels.push(...res.map((m: any) => m.id || m))
          }
        }
        setAvailableModels([...new Set(allModels)])
      } catch (err) {
        console.error('[ConfigurationPage] Failed to load models:', err)
      }
    }
    loadModels()
  }, [])

  const handleSettingChange = useCallback((setter: (val: any) => void, value: any) => {
    setter(value)
    setHasChanges(true)
  }, [])

  const saveSettings = useCallback(async () => {
    setSaving(true)
    const api = (window as any).localmind
    try {
      const settings = {
        launchOnStartup,
        systemTray,
        checkUpdates,
        defaultModel,
        contextLength,
      }
      for (const [key, value] of Object.entries(settings)) {
        await api.settings.set(key, value)
      }
      if (globalShortcut) {
        await api.settings.updateShortcut(globalShortcut)
      }
      setHasChanges(false)
    } catch (err) {
      console.error('[ConfigurationPage] Failed to save settings:', err)
    } finally {
      setSaving(false)
    }
  }, [launchOnStartup, systemTray, checkUpdates, defaultModel, contextLength, globalShortcut])

  const discardChanges = useCallback(() => {
    // Reload from store
    const api = (window as any).localmind
    api.settings.getAll().then((res: any) => {
      if (res?.success && res.data) {
        const data = res.data
        setLaunchOnStartup(data.launchOnStartup ?? false)
        setSystemTray(data.systemTray ?? false)
        setCheckUpdates(data.checkUpdates ?? true)
        setGlobalShortcut(data.globalShortcut ?? 'Ctrl+Shift+Space')
        setDefaultModel(data.defaultModel ?? '')
        setContextLength(data.contextLength ?? 8192)
      }
    })
    setHasChanges(false)
  }, [])

  const handleShortcutCapture = (e: React.KeyboardEvent) => {
    e.preventDefault()
    const parts: string[] = []
    if (e.ctrlKey) parts.push('Ctrl')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')
    if (e.metaKey) parts.push('Meta')
    const key = e.key
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
      parts.push(key.length === 1 ? key.toUpperCase() : key)
    }
    if (parts.length > 1) {
      setGlobalShortcut(parts.join('+'))
      setRecordingShortcut(false)
      setHasChanges(true)
    }
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-background">
      {/* Left Settings Sidebar */}
      <div className="w-[260px] flex-shrink-0 bg-surface border-r border-outline-variant flex flex-col">
        {/* Header */}
        <div className="p-5 pb-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary-container/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px] text-primary">settings</span>
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-on-surface leading-tight">Configuration</h2>
              <p className="text-[11px] text-on-surface-variant">Local Instance</p>
            </div>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 px-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = tab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-container/15 text-on-surface'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <span className={`material-symbols-outlined text-[18px] ${isActive ? 'text-primary' : ''}`}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-outline-variant space-y-1">
          <button
            onClick={() => setTab('personas')}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary-container text-white rounded-lg text-[13px] font-semibold hover:bg-accent-hover transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Persona
          </button>
          <button
            onClick={() => onNavigate('chat')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">menu_book</span>
            Docs
          </button>
          <button
            onClick={() => onNavigate('chat')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">help</span>
            Support
          </button>
        </div>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'general' && (
            <div className="p-8 max-w-[1200px]">
              {/* Header */}
              <div className="mb-8">
                <h1 className="text-[28px] font-bold text-on-surface mb-2">General Settings</h1>
                <p className="text-[15px] text-on-surface-variant">
                  Manage your core application preferences and system integration.
                </p>
              </div>

              {/* Two Column Layout */}
              <div className="flex gap-6">
                {/* Left Column - Main Cards */}
                <div className="flex-1 space-y-6">
                  {/* App Behavior Card */}
                  <div className="bg-surface-container-low rounded-xl border border-outline-variant p-6">
                    <div className="flex items-center gap-2 mb-5">
                      <span className="material-symbols-outlined text-[20px] text-primary">bolt</span>
                      <h3 className="text-[15px] font-semibold text-on-surface">App Behavior</h3>
                    </div>

                    <div className="space-y-5">
                      <ToggleRow
                        title="Launch on startup"
                        description="Automatically start LocalMind when your computer boots up."
                        enabled={launchOnStartup}
                        onToggle={() => handleSettingChange(setLaunchOnStartup, !launchOnStartup)}
                      />
                      <ToggleRow
                        title="System tray icon"
                        description="Keep the app running in the background when closed."
                        enabled={systemTray}
                        onToggle={() => handleSettingChange(setSystemTray, !systemTray)}
                      />
                      <ToggleRow
                        title="Check for updates automatically"
                        description="Stay up to date with the latest features and security patches."
                        enabled={checkUpdates}
                        onToggle={() => handleSettingChange(setCheckUpdates, !checkUpdates)}
                      />
                    </div>
                  </div>

                  {/* Keyboard Shortcuts Card */}
                  <div className="bg-surface-container-low rounded-xl border border-outline-variant p-6">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[20px] text-primary">keyboard</span>
                        <h3 className="text-[15px] font-semibold text-on-surface">Keyboard Shortcuts</h3>
                      </div>
                      <button
                        onClick={() => setRecordingShortcut(true)}
                        className="px-3 py-1.5 bg-surface-container-high border border-outline-variant rounded-lg text-[12px] font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
                      >
                        Edit All
                      </button>
                    </div>

                    {recordingShortcut && (
                      <div className="mb-4 p-3 bg-primary-container/10 border border-primary-container/30 rounded-lg">
                        <p className="text-sm text-on-surface">Press a key combination to set as global shortcut...</p>
                        <div
                          tabIndex={0}
                          autoFocus
                          onKeyDown={handleShortcutCapture}
                          onBlur={() => setRecordingShortcut(false)}
                          className="mt-2 p-2 bg-surface-container rounded border border-outline-variant text-center text-sm text-on-surface"
                        >
                          Listening for shortcut...
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      {defaultShortcuts.map((shortcut) => (
                        <div
                          key={shortcut.id}
                          className="flex items-center justify-between p-3 bg-surface-container rounded-lg border border-outline-variant/50"
                        >
                          <span className="text-[13px] text-on-surface">{shortcut.label}</span>
                          <div className="flex gap-1">
                            {shortcut.keys.map((key, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 bg-surface-container-high border border-outline-variant rounded text-[11px] font-mono text-on-surface-variant"
                              >
                                {key}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Column - Status Cards */}
                <div className="w-[280px] flex-shrink-0 space-y-6">
                  {/* Instance Status */}
                  <div className="bg-surface-container-low rounded-xl border border-outline-variant p-5">
                    <h3 className="text-[11px] font-bold text-primary-container uppercase tracking-wider mb-4">
                      Instance Status
                    </h3>

                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[13px] text-on-surface-variant">Memory Usage</span>
                          <span className="text-[13px] text-on-surface font-medium">
                            {systemStatus ? `${systemStatus.memoryUsed}MB / ${systemStatus.memoryTotal}MB` : 'Loading...'}
                          </span>
                        </div>
                        <div className="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-container rounded-full transition-all duration-500"
                            style={{
                              width: systemStatus
                                ? `${Math.min((systemStatus.memoryUsed / systemStatus.memoryTotal) * 100, 100)}%`
                                : '0%',
                            }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[13px] text-on-surface-variant">Model Temperature</span>
                        <span className="text-[13px] text-on-surface font-medium">42°C</span>
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-outline-variant">
                      <button className="flex items-center gap-1.5 text-[13px] text-primary hover:text-primary-container transition-colors">
                        Open Dashboard
                        <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                      </button>
                    </div>
                  </div>

                  {/* Inference Card */}
                  <div className="bg-surface-container-low rounded-xl border border-outline-variant p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="material-symbols-outlined text-[18px] text-primary">neurology</span>
                      <h3 className="text-[15px] font-semibold text-on-surface">Inference</h3>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-[13px] font-medium text-on-surface mb-1.5 block">Default Model</label>
                        <select
                          value={defaultModel}
                          onChange={(e) => handleSettingChange(setDefaultModel, e.target.value)}
                          className="w-full bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2.5 text-[13px] text-on-surface outline-none focus:border-primary-container"
                        >
                          <option value="">Select a model...</option>
                          {availableModels.map((model) => (
                            <option key={model} value={model}>
                              {model}
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] text-on-surface-variant mt-1.5 italic">
                          New chats will initialize with this model by default.
                        </p>
                      </div>

                      <div>
                        <label className="text-[13px] font-medium text-on-surface mb-1.5 block">Context Length</label>
                        <input
                          type="range"
                          min={2048}
                          max={32768}
                          step={1024}
                          value={contextLength}
                          onChange={(e) => handleSettingChange(setContextLength, parseInt(e.target.value))}
                          className="w-full h-2 bg-surface-container-high rounded-full appearance-none cursor-pointer accent-primary-container"
                        />
                        <div className="flex justify-between mt-1.5">
                          <span className="text-[11px] text-on-surface-variant">2k</span>
                          <span className="text-[11px] text-primary font-medium">
                            {Math.round(contextLength / 1024)}k {contextLength === 8192 ? '(Default)' : ''}
                          </span>
                          <span className="text-[11px] text-on-surface-variant">32k</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'appearance' && (
            <div className="p-8 max-w-[800px]">
              <div className="mb-8">
                <h1 className="text-[28px] font-bold text-on-surface mb-2">Appearance</h1>
                <p className="text-[15px] text-on-surface-variant">
                  Customize the look and feel of your LocalMind experience.
                </p>
              </div>

              <div className="space-y-6">
                {/* Theme Card */}
                <div className="bg-surface-container-low rounded-xl border border-outline-variant p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <span className="material-symbols-outlined text-[20px] text-primary">dark_mode</span>
                    <h3 className="text-[15px] font-semibold text-on-surface">Theme</h3>
                  </div>
                  <div className="flex gap-2">
                    {(['system', 'light', 'dark'] as Theme[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          setTheme(t)
                          setHasChanges(true)
                        }}
                        className={`px-4 py-2.5 rounded-lg text-[13px] capitalize font-medium transition-colors border ${
                          theme === t
                            ? 'bg-primary-container text-white border-primary-container'
                            : 'bg-surface-container-high text-on-surface-variant border-outline-variant hover:text-on-surface hover:border-on-surface-variant'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent Color Card */}
                <div className="bg-surface-container-low rounded-xl border border-outline-variant p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <span className="material-symbols-outlined text-[20px] text-primary">palette</span>
                    <h3 className="text-[15px] font-semibold text-on-surface">Accent Color</h3>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {colorOptions.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setColorTheme(c.id)
                          setHasChanges(true)
                        }}
                        className={`group relative w-12 h-12 rounded-xl border-2 transition-all ${
                          colorTheme === c.id ? 'border-on-surface scale-110' : 'border-outline-variant hover:border-on-surface-variant'
                        }`}
                        title={c.label}
                      >
                        <div className="absolute inset-1 rounded-lg" style={{ backgroundColor: c.hex }} />
                        {colorTheme === c.id && (
                          <span
                            className="absolute inset-0 m-auto w-5 h-5 material-symbols-outlined text-white drop-shadow text-[18px] flex items-center justify-center"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          >
                            check
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Privacy Mode Card */}
                <div className="bg-surface-container-low rounded-xl border border-outline-variant p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <span className="material-symbols-outlined text-[20px] text-primary">lock</span>
                    <h3 className="text-[15px] font-semibold text-on-surface">Privacy</h3>
                  </div>
                  <ToggleRow
                    title="Privacy Mode"
                    description="Only use local Ollama models. No data leaves your machine."
                    enabled={privacyMode}
                    onToggle={() => {
                      setPrivacyMode(!privacyMode)
                      setHasChanges(true)
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {tab === 'personas' && (
            <div className="flex-1 h-full p-8">
              <div className="mb-6">
                <h1 className="text-[28px] font-bold text-on-surface mb-2">Personas</h1>
                <p className="text-[15px] text-on-surface-variant">
                  Create and manage custom AI personas for different tasks.
                </p>
              </div>
              <div className="bg-surface-container-low rounded-xl border border-outline-variant h-[calc(100%-120px)]">
                <PersonaLibrary embedded onSelect={() => {}} />
              </div>
            </div>
          )}

          {tab === 'data' && (
            <div className="p-8 max-w-[800px]">
              <div className="mb-8">
                <h1 className="text-[28px] font-bold text-on-surface mb-2">Data Management</h1>
                <p className="text-[15px] text-on-surface-variant">
                  Export, import, and manage your application data.
                </p>
              </div>

              <DataManagementTab />
            </div>
          )}
        </div>

        {/* Bottom Action Bar */}
        {hasChanges && (
          <div className="flex-shrink-0 px-8 py-4 border-t border-outline-variant bg-surface flex items-center justify-end gap-4">
            <button
              onClick={discardChanges}
              className="px-5 py-2.5 text-[13px] font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Discard Changes
            </button>
            <button
              onClick={saveSettings}
              disabled={saving}
              className="px-6 py-2.5 bg-primary-container text-white rounded-lg text-[13px] font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ToggleRow({
  title,
  description,
  enabled,
  onToggle,
}: {
  title: string
  description: string
  enabled: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[14px] font-medium text-on-surface">{title}</p>
        <p className="text-[12px] text-on-surface-variant mt-0.5">{description}</p>
      </div>
      <button
        onClick={onToggle}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
          enabled ? 'bg-primary-container' : 'bg-surface-container-high border border-outline-variant'
        }`}
      >
        <div
          className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

function DataManagementTab() {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)

  const handleExportAll = async () => {
    setExporting(true)
    try {
      await (window as any).localmind.data.exportAll()
    } finally {
      setExporting(false)
    }
  }

  const handleImportAll = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip'
    input.onchange = async () => {
      const file = input.files?.[0] as any
      if (file && file.path) {
        setImporting(true)
        try {
          await (window as any).localmind.data.importAll(file.path)
        } finally {
          setImporting(false)
        }
      }
    }
    input.click()
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface-container-low rounded-xl border border-outline-variant p-6">
        <h4 className="text-[15px] font-semibold text-on-surface mb-1">Export All Data</h4>
        <p className="text-[13px] text-on-surface-variant mb-4">
          Download a ZIP archive of all conversations, settings, and configurations.
        </p>
        <button
          onClick={handleExportAll}
          disabled={exporting}
          className="px-5 py-2.5 bg-primary-container text-white rounded-lg text-[13px] font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {exporting ? 'Exporting...' : 'Export All'}
        </button>
      </div>

      <div className="bg-surface-container-low rounded-xl border border-outline-variant p-6">
        <h4 className="text-[15px] font-semibold text-on-surface mb-1">Import Data</h4>
        <p className="text-[13px] text-on-surface-variant mb-4">
          Restore from a previously exported ZIP archive.
        </p>
        <button
          onClick={handleImportAll}
          disabled={importing}
          className="px-5 py-2.5 bg-surface-container-high border border-outline-variant text-on-surface rounded-lg text-[13px] font-semibold hover:bg-surface-container-highest disabled:opacity-50 transition-colors"
        >
          {importing ? 'Importing...' : 'Import from ZIP'}
        </button>
      </div>
    </div>
  )
}
