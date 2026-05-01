import { useEffect, useRef, useState } from 'react'
import type { Agent } from '@shared/types/localmind-api'

interface Props {
  selectedAgentId: string | null
  onSelect: (agent: Agent | null) => void
}

export function AgentPicker({ selectedAgentId, onSelect }: Props) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!window.localmind?.agent?.list) return
    window.localmind.agent.list().then((res) => {
      if (res.success && res.data) {
        setAgents(res.data.filter((agent) => agent.enabled))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`px-2.5 py-1.5 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition-colors border ${
          selectedAgent
            ? 'bg-tertiary-container/15 text-tertiary border-tertiary-container/30'
            : 'bg-surface-container-high border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
        }`}
        title="Choose an agent"
      >
        <span className="material-symbols-outlined text-[16px]">
          {selectedAgent?.icon ?? 'smart_toy'}
        </span>
        {selectedAgent?.name ?? 'Agent'}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-72 bg-surface-container border border-outline-variant rounded-xl shadow-xl p-2 z-50">
          <button
            type="button"
            onClick={() => {
              onSelect(null)
              setOpen(false)
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[18px]">radio_button_unchecked</span>
            No agent
          </button>
          <div className="my-1 h-px bg-outline-variant/70" />
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => {
                onSelect(agent)
                setOpen(false)
              }}
              className={`w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                selectedAgentId === agent.id
                  ? 'bg-tertiary-container/15 text-on-surface'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[18px] mt-0.5">
                {agent.icon ?? 'smart_toy'}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold truncate">{agent.name}</span>
                <span className="block text-xs text-on-surface-variant line-clamp-2">
                  {agent.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
