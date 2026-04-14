import { useState, useEffect } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { McpConfigEditor } from '../mcp/McpConfigEditor'

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const { theme, privacyMode, setTheme, setPrivacyMode } = useSettingsStore()
  const [tab, setTab] = useState<'general' | 'mcp'>('general')
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434')
  const [openaiKey, setOpenaiKey] = useState('')
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [googleKey, setGoogleKey] = useState('')
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({})

  useEffect(() => {
    window.localmind.settings.get('ollamaUrl').then((r) => {
      if (r.success && r.data) setOllamaUrl(r.data)
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
  }, [])

  const saveOllamaUrl = async () => {
    await window.localmind.settings.set('ollamaUrl', ollamaUrl)
  }

  const saveApiKey = async (service: string, value: string) => {
    await window.localmind.secrets.set(service, value)
    setSavedKeys((prev) => ({ ...prev, [service]: true }))
    setTimeout(() => setSavedKeys((prev) => ({ ...prev, [service]: false })), 2000)
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
          {(['general', 'mcp'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm capitalize border-b-2 transition-colors ${
                tab === t
                  ? 'border-accent text-text font-medium'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              {t === 'mcp' ? 'MCP Servers' : t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {tab === 'general' ? (
            <>
              {/* Theme */}
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

          {/* Privacy Mode */}
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

          {/* Ollama */}
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

          {/* API Keys */}
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
          ) : (
            <McpConfigEditor />
          )}
        </div>
      </div>
    </div>
  )
}
