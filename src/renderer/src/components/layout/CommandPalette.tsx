import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AppPage } from '../sidebar/Sidebar'

interface CommandPaletteProps {
  onNavigate: (page: AppPage) => void
  onNewChat: () => void
}

interface Command {
  id: string
  label: string
  hint: string
  icon: string
  run: () => void
}

/**
 * Keyboard-first command palette (⌘K / Ctrl+K).
 * Navigation should be invisible — this is the primary way to move around.
 */
export function CommandPalette({ onNavigate, onNewChat }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = useMemo<Command[]>(
    () => [
      { id: 'new-chat', label: 'New chat', hint: 'Start a fresh conversation', icon: 'add', run: onNewChat },
      { id: 'home', label: 'Go to Home', hint: 'Chat workspace', icon: 'home', run: () => onNavigate('chat') },
      { id: 'agents', label: 'Open Agents', hint: 'Manage AI agents', icon: 'smart_toy', run: () => onNavigate('agents') },
      { id: 'skills', label: 'Open Skills', hint: 'Reusable capabilities', icon: 'auto_awesome', run: () => onNavigate('skills') },
      { id: 'mcp', label: 'Open Connections', hint: 'MCP servers', icon: 'hub', run: () => onNavigate('mcp') },
      { id: 'consensus', label: 'Open Consensus', hint: 'Compare models', icon: 'forum', run: () => onNavigate('consensus') },
      { id: 'settings', label: 'Open Settings', hint: 'Personalize LocalMind', icon: 'settings', run: () => onNavigate('settings') },
    ],
    [onNavigate, onNewChat]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => `${c.label} ${c.hint}`.toLowerCase().includes(q))
  }, [commands, query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    const onOpenEvent = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('localmind:open-command-palette', onOpenEvent)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('localmind:open-command-palette', onOpenEvent)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  if (!open) return null

  const execute = (cmd?: Command) => {
    if (!cmd) return
    cmd.run()
    setOpen(false)
  }

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      execute(filtered[active])
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center bg-black/50 pt-[12vh] px-4"
      style={{ position: 'fixed', inset: 0 }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-outline-variant bg-surface shadow-[var(--elevation-3)] overflow-hidden"
        style={{ width: '100%', maxWidth: '36rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 h-12 border-b border-outline-variant">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search commands and pages…"
            className="flex-1 bg-transparent outline-none text-[14px] text-on-surface placeholder:text-on-surface-variant/60"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant">esc</kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto scrollbar-thin py-1.5">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-on-surface-variant">No matching commands.</p>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => execute(cmd)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left ${
                  i === active ? 'bg-surface-container-high' : 'hover:bg-surface-container-low'
                }`}
              >
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">{cmd.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium text-on-surface">{cmd.label}</span>
                  <span className="block text-[11px] text-on-surface-variant truncate">{cmd.hint}</span>
                </span>
                {i === active && (
                  <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">↵</kbd>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
