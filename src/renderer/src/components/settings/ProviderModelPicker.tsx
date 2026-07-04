import { useState, useMemo } from 'react'
import { useProviderStore } from '../../stores/providerStore'

interface CatalogModel {
  id: string
  name: string
  contextWindow?: number
}

interface Props {
  provider: 'openai' | 'openrouter' | 'google'
  label: string
}

/** Stable empty reference so the Zustand selector doesn't create a new array each render. */
const EMPTY_MODELS: { id: string; name: string; contextWindow?: number }[] = []

/**
 * Lets the user pull a provider's full model catalog and pick which models to
 * enable — mirroring the custom-provider model-selection flow. The selection is
 * persisted via the provider store (enabledModels) and limits what appears in
 * the model selector. With no selection, the provider falls back to its auto list.
 */
export function ProviderModelPicker({ provider, label }: Props) {
  const enabledModels = useProviderStore((s) => s.enabledModels[provider]) ?? EMPTY_MODELS
  const setEnabledModels = useProviderStore((s) => s.setEnabledModels)

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [catalog, setCatalog] = useState<CatalogModel[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(enabledModels.map((m) => m.id)))
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchCatalog = async () => {
    setLoading(true)
    setStatus('')
    try {
      const res = await window.localmind.llm.listProviderCatalog(provider)
      if (res.success && res.data) {
        setCatalog(res.data.map((m: any) => ({ id: m.id, name: m.name, contextWindow: m.contextWindow })))
        setSelected(new Set(enabledModels.map((m) => m.id)))
        setOpen(true)
        setStatus(res.data.length ? `${res.data.length} models available` : 'No models returned. Check the API key.')
      } else {
        setStatus(res.error ?? 'Failed to fetch models. Is the API key saved?')
      }
    } catch (err: any) {
      setStatus(err?.message ?? 'Failed to fetch models')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return catalog
    return catalog.filter((m) => `${m.id} ${m.name}`.toLowerCase().includes(q))
  }, [catalog, filter])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      const chosen = catalog.filter((m) => selected.has(m.id))
      await setEnabledModels(provider, chosen)
      setStatus(`Saved ${chosen.length} model${chosen.length === 1 ? '' : 's'}.`)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const clearSelection = async () => {
    await setEnabledModels(provider, [])
    setSelected(new Set())
    setStatus('Reset to auto model list.')
  }

  return (
    <div className="mt-2 rounded-lg border border-outline-variant bg-surface-container-low p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-on-surface">
            {enabledModels.length > 0
              ? `${enabledModels.length} model${enabledModels.length === 1 ? '' : 's'} enabled`
              : 'Auto (default model list)'}
          </p>
          <p className="text-[11px] text-on-surface-variant truncate">
            Pull the {label} catalog and choose which models to show.
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {enabledModels.length > 0 && (
            <button
              onClick={clearSelection}
              className="rounded-md border border-outline-variant px-2 py-1 text-[11px] text-on-surface-variant hover:text-on-surface"
              title="Show all models instead of a custom selection"
            >
              Reset
            </button>
          )}
          <button
            onClick={open ? () => setOpen(false) : fetchCatalog}
            disabled={loading}
            className="flex items-center gap-1 rounded-md bg-surface-container px-2.5 py-1 text-[11px] font-semibold text-on-surface border border-outline-variant hover:bg-surface-container-high disabled:opacity-40"
          >
            <span className={`material-symbols-outlined text-[14px] ${loading ? 'animate-spin' : ''}`}>
              {loading ? 'sync' : open ? 'expand_less' : 'download'}
            </span>
            {loading ? 'Fetching…' : open ? 'Hide' : 'Pull models'}
          </button>
        </div>
      </div>

      {status && !open && <p className="mt-1.5 text-[11px] text-on-surface-variant">{status}</p>}

      {open && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter models…"
              className="flex-1 rounded-md border border-outline-variant bg-surface-container px-2.5 py-1.5 text-[12px] text-on-surface outline-none focus:border-primary"
            />
            <span className="text-[11px] text-on-surface-variant whitespace-nowrap">{selected.size} selected</span>
          </div>

          <div className="max-h-64 overflow-y-auto scrollbar-thin rounded-md border border-outline-variant divide-y divide-outline-variant/40">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-on-surface-variant">No models match.</p>
            ) : (
              filtered.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-surface-container transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onChange={() => toggle(m.id)}
                    className="accent-[var(--color-primary)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-on-surface truncate">{m.name}</span>
                    {m.name !== m.id && <span className="block text-[10px] text-on-surface-variant font-mono truncate">{m.id}</span>}
                  </span>
                  {m.contextWindow ? (
                    <span className="text-[10px] text-on-surface-variant/70 shrink-0">
                      {Math.round(m.contextWindow / 1000)}k ctx
                    </span>
                  ) : null}
                </label>
              ))
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md bg-primary-container px-3 py-1.5 text-[12px] font-semibold text-on-primary-container hover:opacity-90 disabled:opacity-40"
            >
              {saving ? 'Saving…' : `Save ${selected.size} model${selected.size === 1 ? '' : 's'}`}
            </button>
            <button
              onClick={() => setSelected(new Set(filtered.map((m) => m.id)))}
              className="text-[11px] text-on-surface-variant hover:text-on-surface"
            >
              Select all shown
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-[11px] text-on-surface-variant hover:text-on-surface"
            >
              Clear
            </button>
            {status && <span className="ml-auto text-[11px] text-on-surface-variant">{status}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
