import { useState, useEffect, useRef } from 'react'
import { useWorkspaceStore } from '../../stores/workspaceStore'

interface Props {
  activeWorkspaceId?: string | null
  onSwitch: (id: string) => void
}

export function WorkspaceSwitcher({ activeWorkspaceId, onSwitch }: Props) {
  const { workspaces, loadWorkspaces, createWorkspace } = useWorkspaceStore()
  const [open, setOpen] = useState(false)
  const [showCreateInput, setShowCreateInput] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      setShowCreateInput(false)
      setNewWorkspaceName('')
    }
  }, [open])

  useEffect(() => {
    loadWorkspaces()
  }, [loadWorkspaces])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const active = workspaces.find((w) => w.id === activeWorkspaceId)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm hover:bg-surface-offset transition-colors w-full text-left justify-between"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-text-muted flex-shrink-0">📁</span>
          <span className="text-text-muted truncate max-w-32 font-medium">
            {active?.name ?? 'Default'}
          </span>
        </div>
        <svg className={`w-3 h-3 text-text-muted flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 left-0 bg-surface border border-border rounded-xl shadow-2xl w-56 py-1 z-50">
          <button
            onClick={() => { onSwitch(''); setOpen(false) }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
              !activeWorkspaceId ? 'bg-accent/10 text-text font-bold' : 'text-text-muted hover:bg-surface-offset hover:text-text'
            }`}
          >
            <span>📁</span>
            <span>Default</span>
          </button>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => { onSwitch(ws.id); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                ws.id === activeWorkspaceId ? 'bg-accent/10 text-text font-bold' : 'text-text-muted hover:bg-surface-offset hover:text-text'
              }`}
            >
              <span>📁</span>
              <span className="truncate">{ws.name}</span>
            </button>
          ))}
          <div className="border-t border-border mt-1 pt-1">
            {showCreateInput ? (
              <div className="px-3 py-2 flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Workspace name..."
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  className="w-full bg-surface-offset border border-border rounded-lg px-2 py-1 text-xs text-text outline-none focus:border-accent"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowCreateInput(false)
                      setNewWorkspaceName('')
                    }
                  }}
                />
                <div className="flex gap-1.5 justify-end">
                  <button
                    onClick={() => {
                      setShowCreateInput(false)
                      setNewWorkspaceName('')
                    }}
                    className="px-2 py-1 rounded text-[10px] bg-surface-offset text-text-muted hover:text-text hover:bg-border transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!newWorkspaceName.trim()) return
                      const name = newWorkspaceName.trim()
                      // Ask user to select a folder
                      const selectFolderRes = await window.localmind.file.selectFolder()
                      const rootPath = selectFolderRes.success && selectFolderRes.data ? selectFolderRes.data : undefined
                      
                      await createWorkspace({ name, rootPath })
                      setShowCreateInput(false)
                      setNewWorkspaceName('')
                      setOpen(false)
                    }}
                    disabled={!newWorkspaceName.trim()}
                    className="px-2 py-1.5 rounded text-[10px] bg-accent text-white hover:bg-accent/80 transition-colors font-medium disabled:opacity-50"
                  >
                    Create
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setShowCreateInput(true)
                  setNewWorkspaceName('')
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-muted hover:bg-surface-offset hover:text-text transition-colors"
              >
                <span>+</span>
                <span>New Workspace</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
