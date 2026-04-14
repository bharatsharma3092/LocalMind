import { useState, useEffect } from 'react'
import { useUIStore } from '../../stores/uiStore'

interface Artifact {
  id: string
  type: string
  content: string
  version: number
  createdAt: number
}

type TabId = 'preview' | 'code'

export function ArtifactPanel() {
  const { artifactPanelOpen, toggleArtifactPanel, activeArtifactId } = useUIStore()
  const [artifact, setArtifact] = useState<Artifact | null>(null)
  const [tab, setTab] = useState<TabId>('preview')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!artifactPanelOpen || !activeArtifactId) {
      setArtifact(null)
      return
    }
    setLoading(true)
    window.localmind.artifact.list('').then((res) => {
      if (res.success && res.data) {
        const found = res.data.find((a: Artifact) => a.id === activeArtifactId)
        setArtifact(found ?? null)
      }
      setLoading(false)
    })
  }, [artifactPanelOpen, activeArtifactId])

  if (!artifactPanelOpen) return null

  return (
    <div className="w-[450px] flex-shrink-0 border-l border-border bg-surface flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold truncate">
          {artifact ? `Artifact: ${artifact.type}` : 'Artifact'}
        </h3>
        <button
          onClick={toggleArtifactPanel}
          className="p-1.5 rounded-lg hover:bg-surface-offset text-text-muted hover:text-text transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex gap-1 px-4 pt-2">
        {(['preview', 'code'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs rounded-lg capitalize ${
              tab === t
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text hover:bg-surface-offset'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            Loading...
          </div>
        ) : artifact ? (
          tab === 'preview' ? (
            <ArtifactPreview type={artifact.type} content={artifact.content} />
          ) : (
            <pre className="text-xs whitespace-pre-wrap break-words font-mono bg-surface-offset border border-border rounded-xl p-4 overflow-auto max-h-full">
              {artifact.content}
            </pre>
          )
        ) : (
          <div className="flex items-center justify-center h-full text-text-muted text-sm">
            No artifact selected
          </div>
        )}
      </div>
    </div>
  )
}

function ArtifactPreview({ type, content }: { type: string; content: string }) {
  if (type === 'html') {
    return (
      <iframe
        srcDoc={content}
        className="w-full h-full border-0 rounded-lg bg-white"
        sandbox="allow-scripts"
        title="HTML Preview"
      />
    )
  }

  if (type === 'mermaid') {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        Mermaid diagrams require mermaid.js rendering (coming soon)
      </div>
    )
  }

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <pre className="whitespace-pre-wrap break-words text-sm">{content}</pre>
    </div>
  )
}
