import { useState, useEffect, useCallback } from 'react'

interface RagDocument {
  id: string
  filename: string
  chunkCount: number
  createdAt: number
}

interface Props {
  onClose: () => void
}

export function RagPanel({ onClose }: Props) {
  const [documents, setDocuments] = useState<RagDocument[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<string[]>([])
  const [indexing, setIndexing] = useState(false)
  const [indexingProgress, setIndexingProgress] = useState(0)
  const [status, setStatus] = useState<any>(null)

  const refresh = useCallback(async () => {
    const [docsRes, statusRes] = await Promise.all([
      window.localmind.rag.listDocuments(),
      window.localmind.rag.status(),
    ])
    if (docsRes.success && docsRes.data) setDocuments(docsRes.data)
    if (statusRes.success && statusRes.data) setStatus(statusRes.data)
  }, [])

  useEffect(() => {
    refresh()
    const unsub = window.localmind.rag.onProgress((pct) => {
      setIndexingProgress(pct)
    })
    return unsub
  }, [refresh])

  const handleIndex = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      setIndexing(true)
      setIndexingProgress(0)
      try {
        await window.localmind.rag.index(window.localmind.file.getPathForFile(file))
        refresh()
      } catch {}
      setIndexing(false)
    }
    input.click()
  }

  const handleQuery = async () => {
    if (!query.trim()) return
    const res = await window.localmind.rag.query(query, 5)
    if (res.success && res.data) setResults(res.data)
  }

  const handleRemove = async (id: string) => {
    await window.localmind.rag.removeDocument(id)
    refresh()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">RAG Knowledge Base</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-text-muted uppercase">Documents</h3>
              <button
                onClick={handleIndex}
                disabled={indexing}
                className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs hover:bg-accent-hover disabled:opacity-50"
              >
                {indexing ? `Indexing ${indexingProgress}%...` : '+ Add Document'}
              </button>
            </div>

            {documents.length === 0 ? (
              <p className="text-sm text-text-muted py-2">No documents indexed yet</p>
            ) : (
              <div className="space-y-1">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-offset group">
                    <div>
                      <p className="text-sm">{doc.filename}</p>
                      <p className="text-xs text-text-muted">{doc.chunkCount} chunks</p>
                    </div>
                    <button
                      onClick={() => handleRemove(doc.id)}
                      className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger text-xs px-2 py-1 transition-opacity"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-text-muted uppercase mb-2">Query</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                placeholder="Search your documents..."
                className="flex-1 bg-surface-offset border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
              <button onClick={handleQuery} className="btn-primary text-xs">Search</button>
            </div>

            {results.length > 0 && (
              <div className="mt-3 space-y-2">
                {results.map((r, i) => (
                  <div key={i} className="bg-surface-offset border border-border rounded-lg p-3 text-sm text-text">
                    {r}
                  </div>
                ))}
              </div>
            )}
          </section>

          {status && (
            <div className="text-xs text-text-muted">
              Index size: {status.documentCount ?? 0} docs &middot; {status.chunkCount ?? 0} chunks
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
