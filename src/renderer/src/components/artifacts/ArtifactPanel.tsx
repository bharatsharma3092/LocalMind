import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '../../stores/uiStore'

interface Artifact {
  id: string
  type: string
  content: string
  version: number
  createdAt: number
}

interface ArtifactVersion {
  id: string
  version: number
  content: string
  createdAt: number
}

type ViewMode = 'list' | 'preview' | 'code'
type PanelTab = 'artifacts' | 'versions'

export function ArtifactPanel() {
  const { artifactPanelOpen, toggleArtifactPanel, activeArtifactId, setActiveArtifactId } = useUIStore()
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [versions, setVersions] = useState<ArtifactVersion[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [loading, setLoading] = useState(false)

  const refreshArtifacts = useCallback(async () => {
    const res = await window.localmind.artifact.list('')
    if (res.success && res.data) {
      setArtifacts(res.data)
    }
  }, [])

  useEffect(() => {
    if (!artifactPanelOpen) return
    refreshArtifacts()
  }, [artifactPanelOpen, refreshArtifacts])

  useEffect(() => {
    if (!artifactPanelOpen || !activeArtifactId) {
      setSelectedArtifact(null)
      setViewMode('list')
      return
    }
    const found = artifacts.find((a) => a.id === activeArtifactId)
    if (found) {
      setSelectedArtifact(found)
      setViewMode('preview')
    }
  }, [artifactPanelOpen, activeArtifactId, artifacts])

  const handleSelectArtifact = (artifact: Artifact) => {
    setSelectedArtifact(artifact)
    setActiveArtifactId(artifact.id)
    setViewMode('preview')
    setShowVersions(false)
  }

  const handleExport = async (id: string, format: string = 'txt') => {
    await window.localmind.artifact.export(id, format)
  }

  const handleShowVersions = async (artifact: Artifact) => {
    setSelectedArtifact(artifact)
    setShowVersions(true)
    const res = await window.localmind.artifact.getVersions(artifact.id)
    if (res.success && res.data) {
      setVersions(res.data)
    }
  }

  if (!artifactPanelOpen) return null

  return (
    <div className="w-[420px] flex-shrink-0 border-l-2 border-border bg-surface flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border">
        <h3 className="text-sm font-semibold truncate">
          {selectedArtifact && viewMode !== 'list'
            ? selectedArtifact.type
            : 'Artifacts'}
        </h3>
        <div className="flex items-center gap-1">
          {viewMode !== 'list' && (
            <button
              onClick={() => { setViewMode('list'); setSelectedArtifact(null); setActiveArtifactId(null); setShowVersions(false) }}
              className="p-1.5 rounded-lg hover:bg-surface-offset text-text-muted hover:text-text transition-colors"
              title="Back to list"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {selectedArtifact && viewMode !== 'list' && (
            <>
              <button
                onClick={() => handleShowVersions(selectedArtifact)}
                className={`p-1.5 rounded-lg transition-colors ${showVersions ? 'bg-accent/10 text-accent' : 'hover:bg-surface-offset text-text-muted hover:text-text'}`}
                title="Version history"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <button
                onClick={() => handleExport(selectedArtifact.id)}
                className="p-1.5 rounded-lg hover:bg-surface-offset text-text-muted hover:text-text transition-colors"
                title="Export"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
            </>
          )}
          <button
            onClick={toggleArtifactPanel}
            className="p-1.5 rounded-lg hover:bg-surface-offset text-text-muted hover:text-text transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {selectedArtifact && viewMode !== 'list' && (
        <div className="flex gap-1 px-4 pt-2">
          {(['preview', 'code'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setViewMode(t); setShowVersions(false) }}
              className={`px-3 py-1.5 text-xs rounded-lg capitalize ${
                viewMode === t && !showVersions
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:text-text hover:bg-surface-offset'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        {viewMode === 'list' ? (
          <div className="space-y-2">
            {artifacts.length === 0 ? (
              <div className="flex items-center justify-center h-full text-text-muted text-sm">
                No artifacts yet
              </div>
            ) : (
              artifacts.map((artifact) => (
                <button
                  key={artifact.id}
                  onClick={() => handleSelectArtifact(artifact)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-offset transition-colors text-left group"
                >
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs text-accent font-medium uppercase">{artifact.type.slice(0, 2)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{artifact.type} artifact</p>
                    <p className="text-xs text-text-muted">
                      v{artifact.version} &middot; {new Date(artifact.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))
            )}
          </div>
        ) : showVersions ? (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-text-muted uppercase mb-2">Version History</h4>
            {versions.length === 0 ? (
              <p className="text-sm text-text-muted">No version history available</p>
            ) : (
              versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setSelectedArtifact({ ...selectedArtifact!, content: v.content, version: v.version })
                    setShowVersions(false)
                    setViewMode('preview')
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-offset transition-colors text-left"
                >
                  <span className="text-sm">Version {v.version}</span>
                  <span className="text-xs text-text-muted">{new Date(v.createdAt).toLocaleDateString()}</span>
                </button>
              ))
            )}
          </div>
        ) : selectedArtifact ? (
          viewMode === 'preview' ? (
            <ArtifactPreview type={selectedArtifact.type} content={selectedArtifact.content} />
          ) : (
            <pre className="text-xs whitespace-pre-wrap break-words font-mono bg-surface-offset border border-border rounded-xl p-4 overflow-auto max-h-full">
              {selectedArtifact.content}
            </pre>
          )
        ) : null}
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
