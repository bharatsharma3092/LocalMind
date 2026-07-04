import { useState, useEffect } from 'react'
import { useProviderStore } from '../../stores/providerStore'

interface CfModel {
  id: string
  name?: string
  contextWindow?: number
}

/**
 * Cloudflare Workers AI configuration: Account ID + API token, plus a manually
 * maintained list of models (add multiple). Uses Cloudflare's OpenAI-compatible
 * endpoint under the hood. Saved models appear in the model selector.
 */
export function CloudflareConfig() {
  const refreshModels = useProviderStore((s) => s.refreshModels)

  const [accountId, setAccountId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [models, setModels] = useState<CfModel[]>([])
  const [newModelId, setNewModelId] = useState('')
  const [newModelName, setNewModelName] = useState('')
  const [newModelCtx, setNewModelCtx] = useState('8192')
  const [savedAccount, setSavedAccount] = useState(false)
  const [savedKey, setSavedKey] = useState(false)

  useEffect(() => {
    window.localmind.settings.get('cloudflareAccountId').then((r) => {
      if (r.success && r.data) setAccountId(r.data)
    })
    window.localmind.secrets.get('cloudflare-api-key').then((r) => {
      if (r.success && r.data) setApiKey(r.data)
    })
    window.localmind.settings.get('cloudflareModels').then((r) => {
      if (r.success && Array.isArray(r.data)) setModels(r.data)
    })
  }, [])

  const saveAccountId = async () => {
    await window.localmind.settings.set('cloudflareAccountId', accountId.trim())
    setSavedAccount(true)
    setTimeout(() => setSavedAccount(false), 2000)
    await refreshModels('cloudflare')
  }

  const saveApiKey = async () => {
    await window.localmind.secrets.set('cloudflare-api-key', apiKey.trim())
    setSavedKey(true)
    setTimeout(() => setSavedKey(false), 2000)
  }

  const persistModels = async (next: CfModel[]) => {
    setModels(next)
    await window.localmind.settings.set('cloudflareModels', next)
    await refreshModels('cloudflare')
  }

  const addModel = async () => {
    const id = newModelId.trim()
    if (!id) return
    if (models.some((m) => m.id === id)) {
      setNewModelId('')
      return
    }
    const ctx = parseInt(newModelCtx.trim(), 10) || 8192
    await persistModels([...models, { id, name: newModelName.trim() || undefined, contextWindow: ctx }])
    setNewModelId('')
    setNewModelName('')
    setNewModelCtx('8192')
  }

  const removeModel = async (id: string) => {
    await persistModels(models.filter((m) => m.id !== id))
  }

  return (
    <section>
      <h3 className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px] text-primary">cloud</span>
        Cloudflare Workers AI
      </h3>

      <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4 space-y-4">
        {/* Account ID */}
        <div>
          <label className="text-xs text-on-surface-variant">Account ID</label>
          <div className="flex gap-2 mt-1">
            <input
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="your Cloudflare account id"
              className="flex-1 bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-primary font-mono"
            />
            <button
              onClick={saveAccountId}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                savedAccount ? 'bg-emerald-500 text-white' : 'bg-primary-container text-on-primary-container hover:opacity-90'
              }`}
            >
              {savedAccount ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        {/* API token */}
        <div>
          <label className="text-xs text-on-surface-variant">API Token</label>
          <div className="flex gap-2 mt-1">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Cloudflare API token (Workers AI permission)"
              className="flex-1 bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
            />
            <button
              onClick={saveApiKey}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                savedKey ? 'bg-emerald-500 text-white' : 'bg-primary-container text-on-primary-container hover:opacity-90'
              }`}
            >
              {savedKey ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        {/* Models */}
        <div>
          <label className="text-xs text-on-surface-variant">Models</label>
          <p className="text-[11px] text-on-surface-variant/70 mt-0.5">
            Add Cloudflare model IDs, e.g. <code className="font-mono">@cf/meta/llama-3.1-8b-instruct</code>. Add as many as you want.
          </p>

          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={newModelId}
              onChange={(e) => setNewModelId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addModel()}
              placeholder="model id (@cf/...)"
              className="flex-1 min-w-[180px] bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-primary font-mono"
            />
            <input
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addModel()}
              placeholder="display name (optional)"
              className="w-40 bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
            />
            <input
              value={newModelCtx}
              onChange={(e) => setNewModelCtx(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="ctx"
              className="w-20 bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
              title="Context window (tokens)"
            />
            <button
              onClick={addModel}
              disabled={!newModelId.trim()}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-primary-container text-on-primary-container hover:opacity-90 disabled:opacity-40"
            >
              Add
            </button>
          </div>

          <div className="mt-3 space-y-1.5">
            {models.length === 0 ? (
              <p className="text-[12px] text-on-surface-variant/70">No models added yet.</p>
            ) : (
              models.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant bg-surface-container px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] text-on-surface truncate">{m.name || m.id}</div>
                    {m.name && <div className="text-[11px] text-on-surface-variant font-mono truncate">{m.id}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-on-surface-variant/70">{(m.contextWindow ?? 8192).toLocaleString()} ctx</span>
                    <button
                      onClick={() => removeModel(m.id)}
                      className="rounded-md p-1 text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                      title="Remove"
                    >
                      <span className="material-symbols-outlined text-[15px]">delete</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
