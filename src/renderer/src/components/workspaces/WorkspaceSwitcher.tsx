import { useState, useEffect, useRef } from 'react'

interface Workspace {
  id: string
  name: string
  systemPrompt?: string
  defaultModel?: string
  createdAt: number
}

interface Props {
  activeWorkspaceId?: string | null
  onSwitch: (id: string) => void
}

export function WorkspaceSwitcher({ activeWorkspaceId, onSwitch }: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const refresh = async () => {
    const res = await window.localmind.workspace.list()
    if (res.success && res.data) setWorkspaces(res.data)
  }

  useEffect(() => {
    refresh()
  }, [])

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
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm hover:bg-surface-offset transition-colors"
      >
        <span className="text-text-muted">📁</span>
        <span className="text-text-muted truncate max-w-32">
          {active?.name ?? 'Default'}
        </span>
        <svg className={`w-3 h-3 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 bg-surface border border-border rounded-xl shadow-2xl w-56 py-1 z-50">
          <button
            onClick={() => { onSwitch(''); setOpen(false) }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
              !activeWorkspaceId ? 'bg-accent/10 text-text' : 'text-text-muted hover:bg-surface-offset hover:text-text'
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
                ws.id === activeWorkspaceId ? 'bg-accent/10 text-text' : 'text-text-muted hover:bg-surface-offset hover:text-text'
              }`}
            >
              <span>📁</span>
              <span className="truncate">{ws.name}</span>
            </button>
          ))}
          <div className="border-t border-border mt-1 pt-1">
            <button
              onClick={async () => {
                const name = prompt('Workspace name:')
                if (name) {
                  await window.localmind.workspace.create({ name })
                  refresh()
                }
                setOpen(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-muted hover:bg-surface-offset hover:text-text transition-colors"
            >
              <span>+</span>
              <span>New Workspace</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
