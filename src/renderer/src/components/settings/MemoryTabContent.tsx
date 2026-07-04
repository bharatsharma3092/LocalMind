import { useState, useEffect, useCallback } from 'react'

interface MemoryRecord {
  id: string
  kind: string
  content: string
  enabled: boolean
  embeddingStatus: 'absent' | 'present' | 'stale'
  embeddingModel: string | null
  sourceConversationId: string | null
  createdAt: number
}

interface MemoryStatus {
  total: number
  withEmbedding: number
  enabled: number
  semanticReady: boolean
}

interface Props {
  memoryEnabled: boolean
  onToggle: () => Promise<void>
}

const api = () => (window.localmind as any).memory

export function MemoryTabContent({ memoryEnabled, onToggle }: Props) {
  const [records, setRecords] = useState<MemoryRecord[]>([])
  const [status, setStatus] = useState<MemoryStatus | null>(null)
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const flash = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 3000)
  }

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [listRes, statusRes] = await Promise.all([api()?.list(), api()?.status()])
      if (listRes?.success) setRecords(listRes.data ?? [])
      if (statusRes?.success) setStatus(statusRes.data)
    } catch (err) {
      console.error('[MemoryTab] Load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const handleAdd = async () => {
    const content = draft.trim()
    if (!content) return
    setSaving(true)
    try {
      const res = await api()?.create({ content })
      if (res?.success) {
        setDraft('')
        await reload()
        flash('Memory saved')
      } else {
        flash(res?.error ?? 'Failed to save memory')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    const res = await api()?.setEnabled(id, !enabled)
    if (res?.success) setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)))
  }

  const handleDelete = async (id: string) => {
    const res = await api()?.delete(id)
    if (res?.success) {
      setRecords((prev) => prev.filter((r) => r.id !== id))
      setStatus((s) => s ? { ...s, total: s.total - 1, enabled: s.enabled - 1 } : s)
      flash('Memory deleted')
    }
  }

  const saveEdit = async (id: string) => {
    if (!editContent.trim()) return
    const res = await api()?.update(id, editContent)
    if (res?.success) {
      setRecords((prev) => prev.map((r) => (r.id === id ? res.data : r)))
      setEditingId(null)
      flash('Memory updated')
    } else {
      flash(res?.error ?? 'Update failed')
    }
  }

  const handleImportOkf = async () => {
    const okf = (window.localmind as any).okf
    if (!okf?.import) return
    flash('Choose a bundle folder…')
    const res = await okf.import()
    if (res?.success && res.data && !res.data.canceled) {
      await reload()
      flash(`Imported ${res.data.imported} concept(s) from OKF bundle`)
    } else if (res?.data?.canceled) {
      flash('')
    } else {
      flash(res?.error ?? 'Import failed')
    }
  }

  const handleExportOkf = async () => {
    const okf = (window.localmind as any).okf
    if (!okf?.export) return
    flash('Choose where to save…')
    const res = await okf.export()
    if (res?.success && res.data && !res.data.canceled) {
      flash(`Exported ${res.data.exported} memories to OKF bundle`)
    } else if (res?.data?.canceled) {
      flash('')
    } else {
      flash(res?.error ?? 'Export failed')
    }
  }

  const embeddingBadge = (r: MemoryRecord) => {
    if (r.embeddingStatus === 'present') {
      return (
        <span className="flex items-center gap-1 text-[10px] text-success" title="Semantic recall active">
          <span className="material-symbols-outlined text-[12px]">bubble_chart</span>Semantic
        </span>
      )
    }
    if (r.embeddingStatus === 'stale') {
      return (
        <span className="flex items-center gap-1 text-[10px] text-warning" title="Embedding will refresh soon">
          <span className="material-symbols-outlined text-[12px]">sync</span>Refreshing
        </span>
      )
    }
    return (
      <span className="flex items-center gap-1 text-[10px] text-on-surface-variant/60" title="Lexical recall only">
        <span className="material-symbols-outlined text-[12px]">text_fields</span>Lexical
      </span>
    )
  }

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider">Memory Layer</h3>
          <p className="mt-1 text-xs text-on-surface-variant">
            Memories are recalled every chat turn and used to personalize agent responses.
          </p>
        </div>
        <button
          onClick={onToggle}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
            memoryEnabled
              ? 'bg-primary-container text-on-primary-container'
              : 'bg-surface-container-low text-on-surface-variant border border-outline-variant'
          }`}
        >
          {memoryEnabled ? 'Memory On' : 'Memory Off'}
        </button>
      </div>

      {/* Status bar — always shown once loaded */}
      <div className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border px-4 py-3 text-[12px] ${
        loading ? 'border-outline-variant bg-surface-container-lowest' : 'border-outline-variant bg-surface-container-low'
      }`}>
        {loading ? (
          <span className="flex items-center gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
            Loading memory layer…
          </span>
        ) : status ? (
          <>
            <span className="flex items-center gap-1.5 text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px] text-primary">database</span>
              <strong className="text-on-surface">{status.total}</strong> stored
            </span>
            <span className="flex items-center gap-1.5 text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px] text-success">bubble_chart</span>
              <strong className="text-on-surface">{status.withEmbedding}</strong> with semantic embeddings
            </span>
            {status.semanticReady ? (
              <span className="flex items-center gap-1 font-semibold text-success">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                Semantic recall active
              </span>
            ) : (
              <span className="flex items-center gap-1 text-on-surface-variant/70">
                <span className="material-symbols-outlined text-[14px]">text_fields</span>
                Lexical only — run&nbsp;
                <code className="rounded bg-surface-container px-1">ollama pull nomic-embed-text</code>
                &nbsp;to enable semantic recall
              </span>
            )}
          </>
        ) : (
          <span className="text-on-surface-variant/70 text-xs">Memory layer initializing…</span>
        )}
      </div>

      {/* Add memory */}
      <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
        <h4 className="text-sm font-semibold text-on-surface">Add memory</h4>
        <p className="mt-0.5 text-xs text-on-surface-variant">Persist a preference, fact, or working style that the AI should always know.</p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd() }}
          placeholder="e.g. I prefer concise answers with exact file references."
          rows={3}
          className="mt-3 w-full resize-none rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleAdd}
            disabled={saving || !draft.trim()}
            className="rounded-lg bg-primary-container px-4 py-2 text-sm font-semibold text-on-primary-container hover:opacity-90 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Add to Memory'}
          </button>
          <span className="text-xs text-on-surface-variant/70">Cmd/Ctrl+Enter to save</span>
          {message && <span className="text-xs text-on-surface-variant ml-auto">{message}</span>}
        </div>
      </div>

      {/* OKF — Open Knowledge Format import/export */}
      <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary">hub</span>
              Open Knowledge Format (OKF)
            </h4>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              Portable, vendor-neutral knowledge bundles (markdown + frontmatter). Import a bundle to add it to memory, or export your memories as a shareable bundle.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={handleImportOkf}
            className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            Import OKF bundle
          </button>
          <button
            onClick={handleExportOkf}
            className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">upload</span>
            Export as OKF bundle
          </button>
        </div>
      </div>

      {/* Memory list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[12px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Stored memories
          </h4>
          {records.length > 0 && (
            <span className="text-[11px] text-on-surface-variant">{records.length} total</span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
            Loading…
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-8 text-center">
            <span className="material-symbols-outlined text-[32px] text-on-surface-variant/40">neurology</span>
            <p className="mt-2 text-sm font-medium text-on-surface-variant">No memories stored yet</p>
            <p className="mt-1 text-xs text-on-surface-variant/60">
              Add one above, or chat with the Personal Assistant — it automatically extracts preferences and stores them here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((r) => (
              <div
                key={r.id}
                className={`rounded-xl border px-4 py-3 transition-colors ${
                  r.enabled
                    ? 'border-outline-variant bg-surface-container-low'
                    : 'border-outline-variant/40 bg-surface-container-lowest opacity-55'
                }`}
              >
                {editingId === r.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      autoFocus
                      className="w-full resize-none rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(r.id)} className="rounded-lg bg-primary-container px-3 py-1.5 text-xs font-semibold text-on-primary-container hover:opacity-90">
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm leading-6 text-on-surface">{r.content}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-3">
                        {embeddingBadge(r)}
                        <span className="text-[10px] text-on-surface-variant/50">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </span>
                        {r.kind === 'summary' && (
                          <span className="text-[10px] text-on-surface-variant/50 italic">task memory</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingId(r.id); setEditContent(r.content) }}
                          className="rounded-md p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                          title="Edit"
                        >
                          <span className="material-symbols-outlined text-[15px]">edit</span>
                        </button>
                        <button
                          onClick={() => handleToggle(r.id, r.enabled)}
                          className="rounded-md px-2 py-0.5 text-[11px] font-medium border border-outline-variant text-on-surface-variant hover:text-on-surface transition-colors"
                          title={r.enabled ? 'Disable this memory' : 'Enable this memory'}
                        >
                          {r.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="rounded-md p-1 text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                          title="Delete"
                        >
                          <span className="material-symbols-outlined text-[15px]">delete</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
