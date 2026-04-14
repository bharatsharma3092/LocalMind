import { useState, useEffect } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { McpConfigEditor } from '../mcp/McpConfigEditor'

type ColorTheme = 'default' | 'amber' | 'orange' | 'rose' | 'crimson' | 'coral' | 'sunset' | 'gold' | 'copper'

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

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const { theme, colorTheme, privacyMode, setTheme, setColorTheme, setPrivacyMode } = useSettingsStore()
  const [tab, setTab] = useState<'general' | 'models' | 'mcp'>('general')
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434')
  const [openaiKey, setOpenaiKey] = useState('')
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [googleKey, setGoogleKey] = useState('')
  const [customUrl, setCustomUrl] = useState('http://localhost:8080/v1')
  const [customKey, setCustomKey] = useState('')
  const [customModels, setCustomModels] = useState<{ id: string; name: string }[]>([])
  const [newModelId, setNewModelId] = useState('')
  const [newModelName, setNewModelName] = useState('')
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({})

  useEffect(() => {
    window.localmind.settings.get('ollamaUrl').then((r) => {
      if (r.success && r.data) setOllamaUrl(r.data)
    })
    window.localmind.settings.get('customProviderUrl').then((r) => {
      if (r.success && r.data) setCustomUrl(r.data)
    })
    window.localmind.settings.get('customModels').then((r) => {
      if (r.success && r.data) setCustomModels(r.data)
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
    window.localmind.secrets.get('custom-api-key').then((r) => {
      if (r.success && r.data) setCustomKey(r.data)
    })
  }, [])

  const saveOllamaUrl = async () => {
    await window.localmind.settings.set('ollamaUrl', ollamaUrl)
  }

  const saveCustomUrl = async () => {
    await window.localmind.settings.set('customProviderUrl', customUrl)
  }

  const saveApiKey = async (service: string, value: string) => {
    await window.localmind.secrets.set(service, value)
    setSavedKeys((prev) => ({ ...prev, [service]: true }))
    setTimeout(() => setSavedKeys((prev) => ({ ...prev, [service]: false })), 2000)
  }

  const addCustomModel = async () => {
    if (!newModelId.trim()) return
    const model = { id: newModelId.trim(), name: newModelName.trim() || newModelId.trim() }
    const updated = [...customModels, model]
    setCustomModels(updated)
    setNewModelId('')
    setNewModelName('')
    await window.localmind.settings.set('customModels', updated)
  }

  const removeCustomModel = async (id: string) => {
    const updated = customModels.filter((m) => m.id !== id)
    setCustomModels(updated)
    await window.localmind.settings.set('customModels', updated)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex gap-1 px-4 pt-3 border-b border-border">
          {(['general', 'models', 'mcp'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm capitalize border-b-2 transition-colors ${
                tab === t
                  ? 'border-accent text-text font-medium'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              {t === 'mcp' ? 'MCP Servers' : t === 'models' ? 'Models' : t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {tab === 'general' ? (
            <>
              <section>
                <h3 className="text-sm font-semibold text-text-muted uppercase mb-2">Theme</h3>
                <div className="flex gap-2">
                  {(['system', 'light', 'dark'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`px-4 py-2 rounded-lg text-sm capitalize ${
                        theme === t ? 'bg-accent text-white' : 'bg-surface-offset text-text-muted hover:text-text'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-text-muted uppercase mb-2">Accent Color</h3>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setColorTheme(c.id)}
                      className={`group relative w-10 h-10 rounded-xl border-2 transition-all ${
                        colorTheme === c.id ? 'border-text scale-110' : 'border-border hover:border-text-muted'
                      }`}
                      title={c.label}
                    >
                      <div className="absolute inset-1 rounded-lg" style={{ backgroundColor: c.hex }} />
                      {colorTheme === c.id && (
                        <svg className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-text-muted uppercase mb-2">Privacy</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => setPrivacyMode(!privacyMode)}
                    className={`w-10 h-6 rounded-full relative transition-colors ${
                      privacyMode ? 'bg-accent' : 'bg-surface-offset border border-border'
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        privacyMode ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </div>
                  <span className="text-sm">
                    Privacy Mode (local Ollama only)
                    {privacyMode && <span className="text-amber-500 ml-2">🔒</span>}
                  </span>
                </label>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-text-muted uppercase mb-2">Ollama</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    onBlur={saveOllamaUrl}
                    placeholder="http://localhost:11434"
                    className="flex-1 bg-surface-offset border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent text-text"
                  />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-text-muted uppercase mb-2">API Keys</h3>
                <div className="space-y-3">
                  {[
                    { label: 'OpenAI', value: openaiKey, setter: setOpenaiKey, service: 'openai-api-key' },
                    { label: 'OpenRouter', value: openrouterKey, setter: setOpenrouterKey, service: 'openrouter-api-key' },
                    { label: 'Google Gemini', value: googleKey, setter: setGoogleKey, service: 'google-api-key' },
                  ].map(({ label, value, setter, service }) => (
                    <div key={service}>
                      <label className="text-xs text-text-muted">{label}</label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="password"
                          value={value}
                          onChange={(e) => setter(e.target.value)}
                          placeholder={`Enter ${label} API key`}
                          className="flex-1 bg-surface-offset border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent text-text"
                        />
                        <button
                          onClick={() => saveApiKey(service, value)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            savedKeys[service]
                              ? 'bg-green-600 text-white'
                              : 'bg-accent text-white hover:bg-accent/90'
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
                <h3 className="text-sm font-semibold text-text-muted uppercase mb-2">Custom LLM Provider</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-text-muted">Base URL</label>
                    <input
                      type="text"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      onBlur={saveCustomUrl}
                      placeholder="http://localhost:8080/v1"
                      className="w-full bg-surface-offset border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent text-text mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted">API Key</label>
                    <div className="flex gap-2 mt-1">
                      <input
                        type="password"
                        value={customKey}
                        onChange={(e) => setCustomKey(e.target.value)}
                        placeholder="Enter API key (optional)"
                        className="flex-1 bg-surface-offset border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent text-text"
                      />
                      <button
                        onClick={() => saveApiKey('custom-api-key', customKey)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          savedKeys['custom-api-key']
                            ? 'bg-green-600 text-white'
                            : 'bg-accent text-white hover:bg-accent/90'
                        }`}
                      >
                        {savedKeys['custom-api-key'] ? 'Saved' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-text-muted uppercase mb-2">Custom Models</h3>
                <p className="text-xs text-text-muted mb-3">
                  Add models that will appear under the "Custom" provider in the model selector.
                </p>
                <div className="space-y-2 mb-3">
                  {customModels.map((m) => (
                    <div key={m.id} className="flex items-center justify-between bg-surface-offset border border-border rounded-lg px-3 py-2">
                      <div>
                        <span className="text-sm font-medium">{m.name}</span>
                        <span className="text-xs text-text-muted ml-2">{m.id}</span>
                      </div>
                      <button
                        onClick={() => removeCustomModel(m.id)}
                        className="text-text-muted hover:text-danger p-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {customModels.length === 0 && (
                    <p className="text-xs text-text-muted py-2">No custom models added yet.</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newModelId}
                    onChange={(e) => setNewModelId(e.target.value)}
                    placeholder="Model ID (e.g., my-llm)"
                    className="flex-1 bg-surface-offset border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent text-text"
                    onKeyDown={(e) => e.key === 'Enter' && addCustomModel()}
                  />
                  <input
                    type="text"
                    value={newModelName}
                    onChange={(e) => setNewModelName(e.target.value)}
                    placeholder="Display name"
                    className="w-36 bg-surface-offset border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent text-text"
                    onKeyDown={(e) => e.key === 'Enter' && addCustomModel()}
                  />
                  <button
                    onClick={addCustomModel}
                    disabled={!newModelId.trim()}
                    className="px-3 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </section>
            </>
          ) : (
            <McpConfigEditor />
          )}
        </div>
      </div>
    </div>
  )
}