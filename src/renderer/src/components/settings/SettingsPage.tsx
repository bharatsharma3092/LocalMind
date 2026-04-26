import { useState, useEffect } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useProviderStore, type CustomProviderConfig } from '../../stores/providerStore'
import { usePersonaStore } from '../../stores/personaStore'
import { McpConfigEditor } from '../mcp/McpConfigEditor'
import { PersonaLibrary } from '../personas/PersonaLibrary'

type ColorTheme = 'default' | 'amber' | 'orange' | 'rose' | 'crimson' | 'coral' | 'sunset' | 'gold' | 'copper'
type WebSearchProvider = 'tavily' | 'serper' | 'exa' | 'duckduckgo'
type SettingsTab = 'general' | 'models' | 'mcp' | 'personas' | 'data'

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
]

function generateId(): string {
  return `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

const tabLabels: Record<SettingsTab, string> = {
  general: 'General',
  models: 'Models',
  mcp: 'MCP Servers',
  personas: 'Personas',
  data: 'Data',
}

export function SettingsPage({
  onClose,
  initialTab = 'general',
}: {
  onClose: () => void
  initialTab?: SettingsTab
}) {
  const { theme, colorTheme, privacyMode, webSearchEnabled, webSearchProvider, setTheme, setColorTheme, setPrivacyMode, setWebSearchEnabled, setWebSearchProvider } = useSettingsStore()
  const { customProviders, saveCustomProviders, refreshAllModels } = useProviderStore()
  const draftPersonaId = usePersonaStore((state) => state.draftPersonaId)
  const setDraftPersona = usePersonaStore((state) => state.setDraftPersona)
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434')
  const [openaiKey, setOpenaiKey] = useState('')
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [googleKey, setGoogleKey] = useState('')
  const [tavilyKey, setTavilyKey] = useState('')
  const [serperKey, setSerperKey] = useState('')
  const [exaKey, setExaKey] = useState('')
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({})
  const [globalShortcut, setGlobalShortcut] = useState('Ctrl+Shift+Space')
  const [recordingShortcut, setRecordingShortcut] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)

  const [editingProvider, setEditingProvider] = useState<CustomProviderConfig | null>(null)
  const [newProviderName, setNewProviderName] = useState('')
  const [newProviderUrl, setNewProviderUrl] = useState('http://localhost:8080/v1')
  const [newProviderKey, setNewProviderKey] = useState('')
  const [newModelId, setNewModelId] = useState('')
  const [newModelName, setNewModelName] = useState('')

  useEffect(() => {
    window.localmind.settings.get('ollamaUrl').then((r) => {
      if (r.success && r.data) setOllamaUrl(r.data)
    })
    window.localmind.settings.get('globalShortcut').then((r) => {
      if (r.success && r.data) setGlobalShortcut(r.data)
    })
    window.localmind.secrets.get('openai-api-key').then((r) => {
      if (r.success && r.data) setOpenaiKey(r.data)
    })
    window.localmind.secrets.get('openrouter-api-key').then((r) => {
      if (r.success && r.data) setOpenrouterKey(r.data)
    })
    window.localmind.secrets.get('google-api-key').then((r) => {
      if (r.success && r.data) setGoogleKey(r.data)
    })
    window.localmind.secrets.get('tavily-api-key').then((r) => {
      if (r.success && r.data) setTavilyKey(r.data)
    })
    window.localmind.secrets.get('serper-api-key').then((r) => {
      if (r.success && r.data) setSerperKey(r.data)
    })
    window.localmind.secrets.get('exa-api-key').then((r) => {
      if (r.success && r.data) setExaKey(r.data)
    })
  }, [])

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  const saveOllamaUrl = async () => {
    await window.localmind.settings.set('ollamaUrl', ollamaUrl)
  }

  const saveApiKey = async (service: string, value: string) => {
    await window.localmind.secrets.set(service, value)
    setSavedKeys((prev) => ({ ...prev, [service]: true }))
    setTimeout(() => setSavedKeys((prev) => ({ ...prev, [service]: false })), 2000)
  }

  const handleShortcutCapture = async (e: React.KeyboardEvent) => {
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
      const combo = parts.join('+')
      setGlobalShortcut(combo)
      setRecordingShortcut(false)
      await window.localmind.settings.updateShortcut(combo)
    }
  }

  const startAddProvider = () => {
    setEditingProvider({
      id: generateId(),
      name: '',
      baseUrl: 'http://localhost:8080/v1',
      models: [],
    })
    setNewProviderName('')
    setNewProviderUrl('http://localhost:8080/v1')
    setNewProviderKey('')
    setNewModelId('')
    setNewModelName('')
  }

  const startEditProvider = (cp: CustomProviderConfig) => {
    setEditingProvider({ ...cp })
    setNewProviderName(cp.name)
    setNewProviderUrl(cp.baseUrl)
    setNewProviderKey('')
    setNewModelId('')
    setNewModelName('')
    window.localmind.secrets.get(`custom-provider-${cp.id}-api-key`).then((r) => {
      if (r.success && r.data) setNewProviderKey(r.data)
    })
  }

  const saveProvider = async () => {
    if (!editingProvider || !newProviderName.trim()) return
    const updated: CustomProviderConfig = {
      ...editingProvider,
      name: newProviderName.trim(),
      baseUrl: newProviderUrl.trim() || 'http://localhost:8080/v1',
    }
    if (newProviderKey) {
      await window.localmind.secrets.set(`custom-provider-${updated.id}-api-key`, newProviderKey)
    }
    const existing = customProviders.findIndex((p) => p.id === updated.id)
    const newList = [...customProviders]
    if (existing >= 0) {
      newList[existing] = updated
    } else {
      newList.push(updated)
    }
    await saveCustomProviders(newList)
    setEditingProvider(null)
    refreshAllModels()
  }

  const deleteProvider = async (id: string) => {
    const newList = customProviders.filter((p) => p.id !== id)
    await saveCustomProviders(newList)
    if (editingProvider?.id === id) setEditingProvider(null)
    refreshAllModels()
  }

  const addModelToEditing = async () => {
    if (!editingProvider || !newModelId.trim()) return
    const model = { id: newModelId.trim(), name: newModelName.trim() || newModelId.trim() }
    const updated: CustomProviderConfig = {
      ...editingProvider,
      models: [...editingProvider.models, model],
    }
    setEditingProvider(updated)
    setNewModelId('')
    setNewModelName('')
    const existing = customProviders.findIndex((p) => p.id === updated.id)
    const newList = [...customProviders]
    if (existing >= 0) {
      newList[existing] = updated
    } else {
      newList.push(updated)
    }
    await saveCustomProviders(newList)
  }

  const removeModelFromEditing = async (modelId: string) => {
    if (!editingProvider) return
    const updated: CustomProviderConfig = {
      ...editingProvider,
      models: editingProvider.models.filter((m) => m.id !== modelId),
    }
    setEditingProvider(updated)
    const existing = customProviders.findIndex((p) => p.id === updated.id)
    const newList = [...customProviders]
    if (existing >= 0) {
      newList[existing] = updated
    } else {
      newList.push(updated)
    }
    await saveCustomProviders(newList)
  }

  const handleExportAll = async () => {
    setExporting(true)
    try {
      await window.localmind.data.exportAll()
    } finally {
      setExporting(false)
    }
  }

  const handleImportAll = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (file && file.path) {
        setImporting(true)
        try {
          await window.localmind.data.importAll(file.path)
        } finally {
          setImporting(false)
        }
      }
    }
    input.click()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="bg-surface-container rounded-2xl shadow-2xl w-[640px] max-w-full max-h-[85vh] flex flex-col border border-outline-variant overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-outline-variant flex-shrink-0">
          <h2 className="text-xl font-bold text-on-surface">Settings</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-surface-container-high transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Tabs - fixed height, no vertical scroll */}
        <div className="flex gap-1 px-5 pt-4 border-b border-outline-variant overflow-x-auto overflow-y-hidden flex-shrink-0 h-[52px]">
          {(['general', 'models', 'mcp', 'personas', 'data'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap font-medium ${
                tab === t
                  ? 'border-primary text-on-surface'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {tabLabels[t]}
            </button>
          ))}
        </div>

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 min-h-0">
          {tab === 'general' ? (
            <>
              <section>
                <h3 className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Theme</h3>
                <div className="flex gap-2">
                  {(['system', 'light', 'dark'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`px-4 py-2 rounded-lg text-sm capitalize font-medium transition-colors ${
                        theme === t ? 'bg-primary-container text-white' : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Accent Color</h3>
                <div className="flex flex-wrap gap-3">
                  {colorOptions.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setColorTheme(c.id)}
                      className={`group relative w-10 h-10 rounded-xl border-2 transition-all ${
                        colorTheme === c.id ? 'border-on-surface scale-110' : 'border-outline-variant hover:border-on-surface-variant'
                      }`}
                      title={c.label}
                    >
                      <div className="absolute inset-1 rounded-lg" style={{ backgroundColor: c.hex }} />
                      {colorTheme === c.id && (
                        <span className="absolute inset-0 m-auto w-4 h-4 material-symbols-outlined text-white drop-shadow text-[16px] flex items-center justify-center" style={{fontVariationSettings: "'FILL' 1"}}>check</span>
                      )}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Privacy</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setPrivacyMode(!privacyMode)}
                    className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${
                      privacyMode ? 'bg-primary-container' : 'bg-surface-container-high border border-outline-variant'
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        privacyMode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </div>
                  <span className="text-sm text-on-surface">
                    Privacy Mode (local Ollama only)
                    {privacyMode && <span className="text-amber-400 ml-2">🔒</span>}
                  </span>
                </label>
              </section>

              <section>
                <h3 className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Keyboard Shortcut</h3>
                <div className="flex gap-2">
                  <div
                    tabIndex={0}
                    onKeyDown={recordingShortcut ? handleShortcutCapture : undefined}
                    onFocus={() => setRecordingShortcut(true)}
                    onBlur={() => setRecordingShortcut(false)}
                    className={`flex-1 bg-surface-container-low border rounded-lg px-3 py-2 text-sm text-on-surface cursor-pointer select-none ${
                      recordingShortcut ? 'border-primary' : 'border-outline-variant'
                    }`}
                  >
                    {recordingShortcut ? 'Press shortcut combination...' : globalShortcut}
                  </div>
                  <button
                    onClick={() => setRecordingShortcut(true)}
                    className="px-3 py-2 bg-surface-bright border border-outline-variant rounded-lg text-sm text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    Record
                  </button>
                </div>
                <p className="text-xs text-on-surface-variant mt-1">Global shortcut to show/hide the app window</p>
              </section>

              <section>
                <h3 className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Web Search</h3>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                    className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${
                      webSearchEnabled ? 'bg-primary-container' : 'bg-surface-container-high border border-outline-variant'
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        webSearchEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </div>
                  <span className="text-sm text-on-surface">Enable Web Search</span>
                </div>
                {webSearchEnabled && (
                  <>
                    <div className="flex gap-2 mb-3">
                      {(['tavily', 'serper', 'exa', 'duckduckgo'] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => setWebSearchProvider(p)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                            webSearchProvider === p
                              ? 'bg-primary-container text-white'
                              : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    {webSearchProvider !== 'duckduckgo' && (
                      <div className="space-y-3">
                        {webSearchProvider === 'tavily' && (
                          <div>
                            <label className="text-xs text-on-surface-variant">Tavily API Key</label>
                            <div className="flex gap-2 mt-1">
                              <input
                                type="password"
                                value={tavilyKey}
                                onChange={(e) => setTavilyKey(e.target.value)}
                                placeholder="Enter Tavily API key"
                                className="flex-1 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm outline-none focus:border-secondary text-on-surface"
                              />
                              <button
                                onClick={() => saveApiKey('tavily-api-key', tavilyKey)}
                                className="px-3 py-2 rounded-lg text-sm font-semibold bg-primary-container text-white hover:bg-accent-hover transition-colors"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        )}
                        {webSearchProvider === 'serper' && (
                          <div>
                            <label className="text-xs text-on-surface-variant">Serper API Key</label>
                            <div className="flex gap-2 mt-1">
                              <input
                                type="password"
                                value={serperKey}
                                onChange={(e) => setSerperKey(e.target.value)}
                                placeholder="Enter Serper API key"
                                className="flex-1 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm outline-none focus:border-secondary text-on-surface"
                              />
                              <button
                                onClick={() => saveApiKey('serper-api-key', serperKey)}
                                className="px-3 py-2 rounded-lg text-sm font-semibold bg-primary-container text-white hover:bg-accent-hover transition-colors"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        )}
                        {webSearchProvider === 'exa' && (
                          <div>
                            <label className="text-xs text-on-surface-variant">Exa API Key</label>
                            <div className="flex gap-2 mt-1">
                              <input
                                type="password"
                                value={exaKey}
                                onChange={(e) => setExaKey(e.target.value)}
                                placeholder="Enter Exa API key"
                                className="flex-1 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm outline-none focus:border-secondary text-on-surface"
                              />
                              <button
                                onClick={() => saveApiKey('exa-api-key', exaKey)}
                                className="px-3 py-2 rounded-lg text-sm font-semibold bg-primary-container text-white hover:bg-accent-hover transition-colors"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>

              <section>
                <h3 className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Ollama</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    onBlur={saveOllamaUrl}
                    placeholder="http://localhost:11434"
                    className="flex-1 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm outline-none focus:border-secondary text-on-surface"
                  />
                </div>
              </section>

              <section>
                <h3 className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider mb-3">API Keys</h3>
                <div className="space-y-3">
                  {[
                    { label: 'OpenAI', value: openaiKey, setter: setOpenaiKey, service: 'openai-api-key' },
                    { label: 'OpenRouter', value: openrouterKey, setter: setOpenrouterKey, service: 'openrouter-api-key' },
                    { label: 'Google Gemini', value: googleKey, setter: setGoogleKey, service: 'google-api-key' },
                  ].map(({ label, value, setter, service }) => (
                    <div key={service}>
                      <label className="text-xs text-on-surface-variant">{label}</label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="password"
                          value={value}
                          onChange={(e) => setter(e.target.value)}
                          placeholder={`Enter ${label} API key`}
                          className="flex-1 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm outline-none focus:border-secondary text-on-surface"
                        />
                        <button
                          onClick={() => saveApiKey(service, value)}
                          className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            savedKeys[service]
                              ? 'bg-emerald-500 text-white'
                              : 'bg-primary-container text-white hover:bg-accent-hover'
                          }`}
                        >
                          {savedKeys[service] ? 'Saved' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : tab === 'models' ? (
            <>
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider">Custom LLM Providers</h3>
                  <button
                    onClick={startAddProvider}
                    className="px-3 py-1.5 bg-primary-container text-white rounded-lg text-sm font-semibold hover:bg-accent-hover transition-colors"
                  >
                    + Add Provider
                  </button>
                </div>

                {customProviders.length === 0 && !editingProvider && (
                  <p className="text-xs text-on-surface-variant py-2">No custom providers configured. Click "Add Provider" to add one.</p>
                )}

                <div className="space-y-2 mb-4">
                  {customProviders.map((cp) => (
                    <div key={cp.id} className="bg-surface-container-low border border-outline-variant rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-on-surface">{cp.name || 'Unnamed'}</span>
                          <span className="text-xs text-on-surface-variant ml-2">{cp.models.length} model{cp.models.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEditProvider(cp)}
                            className="text-on-surface-variant hover:text-primary p-1 rounded hover:bg-surface-container-high transition-colors"
                            title="Edit"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                          <button
                            onClick={() => deleteProvider(cp.id)}
                            className="text-on-surface-variant hover:text-error p-1 rounded hover:bg-surface-container-high transition-colors"
                            title="Delete"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-on-surface-variant mt-1">{cp.baseUrl}</div>
                    </div>
                  ))}
                </div>

                {editingProvider && (
                  <div className="border border-primary/30 rounded-xl p-4 space-y-4 bg-primary/5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-on-surface">{editingProvider.name ? `Edit: ${editingProvider.name}` : 'New Custom Provider'}</h4>
                      <button
                        onClick={() => setEditingProvider(null)}
                        className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container-high transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                    </div>

                    <div>
                      <label className="text-xs text-on-surface-variant">Provider Name</label>
                      <input
                        type="text"
                        value={newProviderName}
                        onChange={(e) => setNewProviderName(e.target.value)}
                        placeholder="My Local LLM"
                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm outline-none focus:border-secondary text-on-surface mt-1"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-on-surface-variant">Base URL</label>
                      <input
                        type="text"
                        value={newProviderUrl}
                        onChange={(e) => setNewProviderUrl(e.target.value)}
                        placeholder="http://localhost:8080/v1"
                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm outline-none focus:border-secondary text-on-surface mt-1"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-on-surface-variant">API Key (optional)</label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="password"
                          value={newProviderKey}
                          onChange={(e) => setNewProviderKey(e.target.value)}
                          placeholder="Enter API key"
                          className="flex-1 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm outline-none focus:border-secondary text-on-surface"
                        />
                        <button
                          onClick={async () => {
                            if (editingProvider && newProviderKey) {
                              await window.localmind.secrets.set(`custom-provider-${editingProvider.id}-api-key`, newProviderKey)
                              setSavedKeys((prev) => ({ ...prev, [`cp-${editingProvider.id}`]: true }))
                              setTimeout(() => setSavedKeys((prev) => ({ ...prev, [`cp-${editingProvider.id}`]: false })), 2000)
                            }
                          }}
                          className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            savedKeys[`cp-${editingProvider?.id}`]
                              ? 'bg-emerald-500 text-white'
                              : 'bg-primary-container text-white hover:bg-accent-hover'
                          }`}
                        >
                          {savedKeys[`cp-${editingProvider?.id}`] ? 'Saved' : 'Save'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-on-surface-variant">Models</label>
                      <div className="space-y-1.5 mt-1 mb-2">
                        {editingProvider.models.map((m) => (
                          <div key={m.id} className="flex items-center justify-between bg-surface-container-low border border-outline-variant rounded-lg px-3 py-1.5">
                            <div>
                              <span className="text-sm text-on-surface">{m.name}</span>
                              <span className="text-xs text-on-surface-variant ml-2">{m.id}</span>
                            </div>
                            <button
                              onClick={() => removeModelFromEditing(m.id)}
                              className="text-on-surface-variant hover:text-error p-1 rounded hover:bg-surface-container-high transition-colors"
                            >
                              <span className="material-symbols-outlined text-[16px]">close</span>
                            </button>
                          </div>
                        ))}
                        {editingProvider.models.length === 0 && (
                          <p className="text-xs text-on-surface-variant py-1">No models added. Add models below.</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newModelId}
                          onChange={(e) => setNewModelId(e.target.value)}
                          placeholder="Model ID (e.g., my-llm)"
                          className="flex-1 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm outline-none focus:border-secondary text-on-surface"
                          onKeyDown={(e) => e.key === 'Enter' && addModelToEditing()}
                        />
                        <input
                          type="text"
                          value={newModelName}
                          onChange={(e) => setNewModelName(e.target.value)}
                          placeholder="Display name"
                          className="w-32 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm outline-none focus:border-secondary text-on-surface"
                          onKeyDown={(e) => e.key === 'Enter' && addModelToEditing()}
                        />
                        <button
                          onClick={addModelToEditing}
                          disabled={!newModelId.trim()}
                          className="px-3 py-2 bg-surface-bright border border-outline-variant text-on-surface rounded-lg text-sm hover:bg-surface-container-high disabled:opacity-40 transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={saveProvider}
                      disabled={!newProviderName.trim()}
                      className="w-full py-2.5 bg-primary-container text-white rounded-lg text-sm font-semibold hover:bg-accent-hover disabled:opacity-40 transition-colors"
                    >
                      Save Provider
                    </button>
                  </div>
                )}
              </section>
            </>
          ) : tab === 'mcp' ? (
            <McpConfigEditor />
          ) : tab === 'personas' ? (
            <div className="-m-5 min-h-[400px]">
              <PersonaLibrary
                embedded
                selectedPersonaId={draftPersonaId}
                onSelect={(persona) => setDraftPersona(persona.id)}
              />
            </div>
          ) : (
            <section>
              <h3 className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Data Management</h3>

              <div className="space-y-4">
                <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-on-surface mb-1">Export All Data</h4>
                  <p className="text-xs text-on-surface-variant mb-3">
                    Download a ZIP archive of all conversations, settings, and configurations.
                  </p>
                  <button
                    onClick={handleExportAll}
                    disabled={exporting}
                    className="px-4 py-2 bg-primary-container text-white rounded-lg text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    {exporting ? 'Exporting...' : 'Export All'}
                  </button>
                </div>

                <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-on-surface mb-1">Import Data</h4>
                  <p className="text-xs text-on-surface-variant mb-3">
                    Restore from a previously exported ZIP archive.
                  </p>
                  <button
                    onClick={handleImportAll}
                    disabled={importing}
                    className="px-4 py-2 bg-surface-bright border border-outline-variant text-on-surface rounded-lg text-sm font-semibold hover:bg-surface-container-high disabled:opacity-50 transition-colors"
                  >
                    {importing ? 'Importing...' : 'Import from ZIP'}
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
