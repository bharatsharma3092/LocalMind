import { useState, useEffect } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useProviderStore, type CustomProviderConfig } from '../../stores/providerStore'
import { usePersonaStore } from '../../stores/personaStore'
import { McpConfigEditor } from '../mcp/McpConfigEditor'
import { PersonaLibrary } from '../personas/PersonaLibrary'

type ColorTheme = 'default' | 'amber' | 'orange' | 'rose' | 'crimson' | 'coral' | 'sunset' | 'gold' | 'copper'
type WebSearchProvider = 'tavily' | 'serper' | 'exa' | 'duckduckgo'
type SettingsTab = 'general' | 'profile' | 'memory' | 'models' | 'claudeProxy' | 'mcp' | 'personas' | 'data'
type MemoryEntry = { id: string; content: string; source: string; enabled: boolean; createdAt: number }
type ProxyRole = 'opus' | 'sonnet' | 'haiku'

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
  profile: 'Profile',
  memory: 'Memory',
  models: 'Models',
  claudeProxy: 'Claude Code Proxy',
  mcp: 'MCP Servers',
  personas: 'Personas',
  data: 'Data',
}

export function SettingsPage({
  onClose,
  initialTab = 'general',
}: {
  onClose?: () => void
  initialTab?: SettingsTab
}) {
  const { theme, colorTheme, privacyMode, webSearchEnabled, webSearchProvider, setTheme, setColorTheme, setPrivacyMode, setWebSearchEnabled, setWebSearchProvider } = useSettingsStore()
  const { customProviders, saveCustomProviders, refreshAllModels, availableModels } = useProviderStore()
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
  const [dataStatus, setDataStatus] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [authProvider, setAuthProvider] = useState<'local' | 'google' | 'github' | 'microsoft' | null>(null)
  const [memoryEnabled, setMemoryEnabled] = useState(true)
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [memoryDraft, setMemoryDraft] = useState('')
  const [memoryImportText, setMemoryImportText] = useState('')
  const [memoryStatus, setMemoryStatus] = useState('')

  const [editingProvider, setEditingProvider] = useState<CustomProviderConfig | null>(null)
  const [newProviderName, setNewProviderName] = useState('')
  const [newProviderUrl, setNewProviderUrl] = useState('http://localhost:8080/v1')
  const [newProviderKey, setNewProviderKey] = useState('')
  const [newModelId, setNewModelId] = useState('')
  const [newModelName, setNewModelName] = useState('')
  const [fetchedModels, setFetchedModels] = useState<{ id: string; name: string; selected: boolean }[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [modelFetchStatus, setModelFetchStatus] = useState('')
  const [claudeProxy, setClaudeProxy] = useState<any>({ enabled: false, port: 4000, apiKey: 'localmind-proxy-key' })
  const [claudeProxyStatus, setClaudeProxyStatus] = useState<any>(null)
  const [savingClaudeProxy, setSavingClaudeProxy] = useState(false)
  const [testingClaudeProxy, setTestingClaudeProxy] = useState(false)
  const [claudeProxyTestResults, setClaudeProxyTestResults] = useState<any[]>([])

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
    window.localmind.settings.get('userProfile').then((r) => {
      if (r.success && r.data) {
        setDisplayName(r.data.displayName ?? '')
        setEmail(r.data.email ?? '')
        setAuthProvider(r.data.authProvider ?? null)
      }
    })
    window.localmind.settings.get('memoryEnabled').then((r) => {
      if (r.success && typeof r.data === 'boolean') setMemoryEnabled(r.data)
    })
    window.localmind.settings.get('memories').then((r) => {
      if (r.success && Array.isArray(r.data)) setMemories(r.data)
    })
    window.localmind.claudeProxy?.getSettings?.().then((r) => {
      if (r.success && r.data) setClaudeProxy(r.data)
    })
    window.localmind.claudeProxy?.status?.().then((r) => {
      if (r.success) setClaudeProxyStatus(r.data)
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
    setFetchedModels([])
    setModelFetchStatus('')
  }

  const startEditProvider = (cp: CustomProviderConfig) => {
    setEditingProvider({ ...cp })
    setNewProviderName(cp.name)
    setNewProviderUrl(cp.baseUrl)
    setNewProviderKey('')
    setNewModelId('')
    setNewModelName('')
    setFetchedModels([])
    setModelFetchStatus('')
    window.localmind.secrets.get(`custom-provider-${cp.id}-api-key`).then((r) => {
      if (r.success && r.data) setNewProviderKey(r.data)
    })
  }

  const saveProvider = async () => {
    if (!editingProvider || !newProviderName.trim()) return
    const selectedFetchedModels = fetchedModels
      .filter((model) => model.selected)
      .map((model) => ({ id: model.id, name: model.name || model.id }))
    const fetchedIds = new Set(fetchedModels.map((model) => model.id))
    const mergedModels = [...selectedFetchedModels]
    for (const model of editingProvider.models) {
      if (!fetchedIds.has(model.id) && !mergedModels.some((item) => item.id === model.id)) {
        mergedModels.push(model)
      }
    }
    const updated: CustomProviderConfig = {
      ...editingProvider,
      name: newProviderName.trim(),
      baseUrl: newProviderUrl.trim() || 'http://localhost:8080/v1',
      models: mergedModels,
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

  const fetchModelsForEditingProvider = async () => {
    setFetchingModels(true)
    setModelFetchStatus('')
    try {
      const res = await window.localmind.llm.fetchCustomModels({
        baseUrl: newProviderUrl.trim(),
        apiKey: newProviderKey.trim() || undefined,
      })
      if (!res.success || !res.data) {
        setModelFetchStatus(res.error ?? 'Unable to fetch models.')
        return
      }
      const existingIds = new Set(editingProvider?.models.map((model) => model.id) ?? [])
      const next = res.data.map((model) => ({
        ...model,
        selected: existingIds.has(model.id) || existingIds.size === 0,
      }))
      setFetchedModels(next)
      setModelFetchStatus(next.length ? `Found ${next.length} model${next.length === 1 ? '' : 's'}.` : 'No models returned by this provider.')
    } finally {
      setFetchingModels(false)
    }
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
    setDataStatus('')
    try {
      const res = await window.localmind.data.exportAll()
      setDataStatus(res.success && res.data ? `Exported to ${res.data}` : res.error ?? 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const handleImportAll = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      const filePath = file ? window.localmind?.file?.getPathForFile?.(file) : null
      if (filePath) {
        setImporting(true)
        setDataStatus('')
        try {
          const res = await window.localmind.data.importAll(filePath)
          setDataStatus(res.success && res.data?.imported ? 'Import complete. Restart or refresh lists to see all restored data.' : res.data?.error ?? res.error ?? 'Import failed')
        } finally {
          setImporting(false)
        }
      }
    }
    input.click()
  }

  const saveProfile = async (provider: typeof authProvider = authProvider) => {
    await window.localmind.settings.set('userProfile', {
      displayName: displayName.trim(),
      email: email.trim(),
      authProvider: provider,
    })
    setAuthProvider(provider)
  }

  const saveMemories = async (nextMemories: MemoryEntry[], nextEnabled = memoryEnabled) => {
    setMemories(nextMemories)
    await window.localmind.settings.set('memories', nextMemories)
    await window.localmind.settings.set('memoryEnabled', nextEnabled)
  }

  const addMemory = async (content: string, source = 'manual') => {
    const cleaned = content.trim()
    if (!cleaned) return
    const next = [
      {
        id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        content: cleaned.replace(/^\s*[-*]\s*/, ''),
        source,
        enabled: true,
        createdAt: Date.now(),
      },
      ...memories,
    ]
    await saveMemories(next)
    setMemoryDraft('')
  }

  const importMemoriesFromText = async () => {
    const entries = memoryImportText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('```'))
      .map((line) => line.replace(/^\[[^\]]+\]\s*-\s*/, '').replace(/^\s*[-*]\s*/, '').trim())
      .filter(Boolean)

    if (entries.length === 0) {
      setMemoryStatus('Paste exported memory text first.')
      return
    }

    const imported = entries.map((content) => ({
      id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      content,
      source: 'import',
      enabled: true,
      createdAt: Date.now(),
    }))
    await saveMemories([...imported, ...memories])
    setMemoryImportText('')
    setMemoryStatus(`Imported ${imported.length} memories.`)
  }

  const importMemoryFile = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt,.md,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      setMemoryImportText(await file.text())
      setMemoryStatus(`Loaded ${file.name}. Review and click Import.`)
    }
    input.click()
  }

  const updateClaudeProxyRole = (role: ProxyRole, value: string) => {
    const model = availableModels.find((item) => `${item.provider}|${item.customProviderId ?? ''}|${item.id}` === value)
    setClaudeProxy((prev: any) => ({ ...prev, [`${role}Model`]: model }))
  }

  const saveClaudeProxy = async (startAfterSave = false) => {
    setSavingClaudeProxy(true)
    try {
      const saved = await window.localmind.claudeProxy.saveSettings(claudeProxy)
      if (saved.success && saved.data) setClaudeProxy(saved.data)
      if (startAfterSave) {
        const started = await window.localmind.claudeProxy.start()
        if (started.success) setClaudeProxyStatus(started.data)
      }
    } finally {
      setSavingClaudeProxy(false)
    }
  }

  const testClaudeProxyModels = async () => {
    setTestingClaudeProxy(true)
    try {
      const saved = await window.localmind.claudeProxy.saveSettings(claudeProxy)
      const settings = saved.success && saved.data ? saved.data : claudeProxy
      if (saved.success && saved.data) setClaudeProxy(saved.data)
      const tests = await window.localmind.claudeProxy.testModels(settings)
      const status = await window.localmind.claudeProxy.status()
      if (status.success) setClaudeProxyStatus(status.data)
      setClaudeProxyTestResults(tests.success && Array.isArray(tests.data) ? tests.data : [{
        role: 'proxy',
        ok: false,
        error: tests.error ?? 'Unable to test selected models.',
      }])
    } finally {
      setTestingClaudeProxy(false)
    }
  }

  const stopClaudeProxy = async () => {
    const stopped = await window.localmind.claudeProxy.stop()
    if (stopped.success) setClaudeProxyStatus(stopped.data)
  }

  return (
    <div className={onClose ? 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6' : 'h-full min-h-0 overflow-hidden bg-background p-6'}>
      <div className={onClose ? 'bg-surface-container rounded-2xl shadow-2xl w-[640px] max-w-full max-h-[85vh] flex flex-col border border-outline-variant overflow-hidden' : 'mx-auto flex h-full max-w-6xl flex-col overflow-hidden border border-outline-variant bg-surface-container'}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-outline-variant flex-shrink-0">
          <h2 className="text-xl font-bold text-on-surface">Settings</h2>
          {onClose && (
            <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          )}
        </div>

        {/* Tabs - fixed height, no vertical scroll */}
        <div className="flex gap-1 px-5 pt-4 border-b border-outline-variant overflow-x-auto overflow-y-hidden flex-shrink-0 h-[52px]">
          {(['general', 'profile', 'memory', 'models', 'claudeProxy', 'mcp', 'personas', 'data'] as const).map((t) => (
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
          ) : tab === 'profile' ? (
            <section className="space-y-5">
              <div>
                <h3 className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider mb-3">User Profile</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs text-on-surface-variant">Name</label>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-on-surface-variant">Email</label>
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
                    />
                  </div>
                </div>
                <button
                  onClick={() => saveProfile()}
                  className="mt-4 rounded-lg bg-primary-container px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
                >
                  Save Profile
                </button>
              </div>

              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <h4 className="text-sm font-semibold text-on-surface">Account login</h4>
                <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                  LocalMind stores this profile locally. OAuth buttons mark the account provider for now; production sign-in needs provider client IDs and redirect configuration.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {([
                    ['google', 'Gmail'],
                    ['github', 'GitHub'],
                    ['microsoft', 'Microsoft'],
                  ] as const).map(([provider, label]) => (
                    <button
                      key={provider}
                      onClick={() => saveProfile(provider)}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                        authProvider === provider
                          ? 'border-primary bg-primary-container/20 text-on-surface'
                          : 'border-outline-variant bg-surface-container text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      Continue with {label}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : tab === 'memory' ? (
            <section className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider">Memory</h3>
                  <p className="mt-1 text-xs text-on-surface-variant">Enabled memories are added to chat and agent context locally.</p>
                </div>
                <button
                  onClick={async () => {
                    const next = !memoryEnabled
                    setMemoryEnabled(next)
                    await window.localmind.settings.set('memoryEnabled', next)
                  }}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold ${memoryEnabled ? 'bg-primary-container text-white' : 'bg-surface-container-low text-on-surface-variant'}`}
                >
                  {memoryEnabled ? 'Memory On' : 'Memory Off'}
                </button>
              </div>

              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <h4 className="text-sm font-semibold text-on-surface">Add memory</h4>
                <textarea
                  value={memoryDraft}
                  onChange={(e) => setMemoryDraft(e.target.value)}
                  placeholder="Example: I prefer concise engineering answers with exact file references."
                  rows={3}
                  className="mt-3 w-full resize-none rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
                />
                <button
                  onClick={() => addMemory(memoryDraft)}
                  className="mt-3 rounded-lg bg-primary-container px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
                >
                  Add to Memory
                </button>
              </div>

              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-on-surface">Import from another AI app</h4>
                  <button onClick={importMemoryFile} className="rounded-lg border border-outline-variant px-3 py-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface">
                    Load File
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-on-surface-variant">
                  Paste exported memories from Claude, ChatGPT, Gemini, Copilot, or any assistant. Lines like “[date] - memory” are imported as separate entries.
                </p>
                <textarea
                  value={memoryImportText}
                  onChange={(e) => setMemoryImportText(e.target.value)}
                  placeholder="Paste exported memory text here..."
                  rows={6}
                  className="mt-3 w-full resize-y rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
                />
                <div className="mt-3 flex items-center gap-3">
                  <button onClick={importMemoriesFromText} className="rounded-lg bg-primary-container px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover">
                    Import Memories
                  </button>
                  {memoryStatus && <span className="text-xs text-on-surface-variant">{memoryStatus}</span>}
                </div>
              </div>

              <div className="space-y-2">
                {memories.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">No memories saved yet.</p>
                ) : memories.map((memory) => (
                  <div key={memory.id} className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm leading-6 text-on-surface">{memory.content}</p>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => {
                            const next = memories.map((item) => item.id === memory.id ? { ...item, enabled: !item.enabled } : item)
                            saveMemories(next)
                          }}
                          className="rounded border border-outline-variant px-2 py-1 text-xs text-on-surface-variant hover:text-on-surface"
                        >
                          {memory.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                        <button
                          onClick={() => saveMemories(memories.filter((item) => item.id !== memory.id))}
                          className="rounded border border-outline-variant px-2 py-1 text-xs text-on-surface-variant hover:text-error"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] uppercase tracking-wider text-on-surface-variant/70">{memory.source}</p>
                  </div>
                ))}
              </div>
            </section>
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
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          onClick={fetchModelsForEditingProvider}
                          disabled={fetchingModels || !newProviderUrl.trim()}
                          className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface disabled:opacity-40"
                        >
                          {fetchingModels ? 'Fetching...' : 'Fetch Models'}
                        </button>
                        {fetchedModels.length > 0 && (
                          <>
                            <button
                              onClick={() => setFetchedModels((models) => models.map((model) => ({ ...model, selected: true })))}
                              className="rounded-lg border border-outline-variant px-3 py-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface"
                            >
                              Select All
                            </button>
                            <button
                              onClick={() => setFetchedModels((models) => models.map((model) => ({ ...model, selected: false })))}
                              className="rounded-lg border border-outline-variant px-3 py-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface"
                            >
                              Clear
                            </button>
                          </>
                        )}
                        {modelFetchStatus && <span className="text-xs text-on-surface-variant">{modelFetchStatus}</span>}
                      </div>

                      {fetchedModels.length > 0 && (
                        <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-low p-2">
                          {fetchedModels.map((model) => (
                            <label
                              key={model.id}
                              className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-on-surface-variant hover:bg-surface-container"
                            >
                              <input
                                type="checkbox"
                                checked={model.selected}
                                onChange={() => {
                                  setFetchedModels((models) =>
                                    models.map((item) => item.id === model.id ? { ...item, selected: !item.selected } : item)
                                  )
                                }}
                                className="h-4 w-4 accent-primary"
                              />
                              <span className="min-w-0 flex-1 truncate">{model.name || model.id}</span>
                              <span className="truncate font-mono text-[11px] text-on-surface-variant/70">{model.id}</span>
                            </label>
                          ))}
                        </div>
                      )}

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
          ) : tab === 'claudeProxy' ? (
            <section className="space-y-5">
              <div>
                <h3 className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Claude Code Proxy</h3>
                <p className="text-sm leading-6 text-on-surface-variant">
                  Route Claude Code through a local LiteLLM proxy and map Claude tiers to any model available in LocalMind.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs text-on-surface-variant">Proxy Port</label>
                  <input
                    type="number"
                    value={claudeProxy.port ?? 4000}
                    onChange={(e) => setClaudeProxy((prev: any) => ({ ...prev, port: Number(e.target.value) || 4000 }))}
                    className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
                  />
                </div>
                <div>
                  <label className="text-xs text-on-surface-variant">Proxy API Key</label>
                  <input
                    type="password"
                    value={claudeProxy.apiKey ?? ''}
                    onChange={(e) => setClaudeProxy((prev: any) => ({ ...prev, apiKey: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {([
                  ['opus', 'Opus'],
                  ['sonnet', 'Sonnet'],
                  ['haiku', 'Haiku'],
                ] as const).map(([role, label]) => {
                  const selected = claudeProxy[`${role}Model`]
                  const value = selected ? `${selected.provider}|${selected.customProviderId ?? ''}|${selected.id}` : ''
                  return (
                    <div key={role}>
                      <label className="text-xs text-on-surface-variant">{label} model</label>
                      <select
                        value={value}
                        onChange={(e) => updateClaudeProxyRole(role, e.target.value)}
                        className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
                      >
                        <option value="">Choose a model</option>
                        {availableModels.map((model) => (
                          <option
                            key={`${model.provider}-${model.customProviderId ?? ''}-${model.id}`}
                            value={`${model.provider}|${model.customProviderId ?? ''}|${model.id}`}
                          >
                            {model.provider}{model.customProviderId ? `/${model.customProviderId}` : ''}: {model.name || model.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>

              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => saveClaudeProxy(false)}
                    disabled={savingClaudeProxy}
                    className="rounded-lg bg-surface-bright px-4 py-2 text-sm font-semibold text-on-surface hover:bg-surface-container-high disabled:opacity-50"
                  >
                    {savingClaudeProxy ? 'Saving...' : 'Save Config'}
                  </button>
                  <button
                    onClick={() => saveClaudeProxy(true)}
                    disabled={savingClaudeProxy}
                    className="rounded-lg bg-primary-container px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    Start Proxy
                  </button>
                  <button
                    onClick={testClaudeProxyModels}
                    disabled={testingClaudeProxy || savingClaudeProxy}
                    className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface-variant hover:text-on-surface disabled:opacity-50"
                  >
                    {testingClaudeProxy ? 'Testing...' : 'Test Models'}
                  </button>
                  <button
                    onClick={stopClaudeProxy}
                    className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface-variant hover:text-on-surface"
                  >
                    Stop
                  </button>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${claudeProxyStatus?.running ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    {claudeProxyStatus?.running ? 'Running' : 'Stopped'}
                  </span>
                </div>
                <div className="mt-4 grid gap-2 text-xs leading-5 text-on-surface-variant">
                  <p>Base URL: <span className="font-mono text-on-surface">{claudeProxy.baseUrl ?? `http://localhost:${claudeProxy.port ?? 4000}`}</span></p>
                  <p>Config: <span className="font-mono text-on-surface">{claudeProxy.configPath ?? claudeProxyStatus?.configPath ?? 'Save to generate config'}</span></p>
                  <p>Claude Code can use the proxy with Anthropic-compatible model names for Opus, Sonnet, and Haiku.</p>
                </div>
                {claudeProxyStatus?.output && (
                  <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-surface-container px-3 py-2 text-xs text-on-surface-variant">{claudeProxyStatus.output}</pre>
                )}
                {claudeProxyTestResults.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {claudeProxyTestResults.map((result) => (
                      <div
                        key={`${result.role}-${result.model ?? 'none'}`}
                        className={`rounded-lg border px-3 py-2 text-xs leading-5 ${
                          result.ok
                            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500'
                            : 'border-error/30 bg-error/10 text-error'
                        }`}
                      >
                        <span className="font-bold capitalize">{result.role}</span>
                        {result.model && <span className="ml-2 font-mono">{result.model}</span>}
                        <span className="ml-2">{result.ok ? 'OK' : result.error}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
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
                    Export all conversations, settings, memories, personas, skills, and MCP server records as a JSON backup.
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
                    Restore from a previously exported LocalMind JSON backup.
                  </p>
                  <button
                    onClick={handleImportAll}
                    disabled={importing}
                    className="px-4 py-2 bg-surface-bright border border-outline-variant text-on-surface rounded-lg text-sm font-semibold hover:bg-surface-container-high disabled:opacity-50 transition-colors"
                  >
                    {importing ? 'Importing...' : 'Import from JSON'}
                  </button>
                </div>
                {dataStatus && (
                  <p className="text-xs leading-5 text-on-surface-variant">{dataStatus}</p>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
