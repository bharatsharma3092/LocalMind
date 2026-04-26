import { useEffect, useMemo, useRef, useState } from 'react'
import type { Persona } from '@shared/types/localmind-api'
import { usePersonaStore } from '../../stores/personaStore'
import { useChatStore } from '../../stores/chatStore'

interface Props {
  conversationId?: string | null
  onManagePersonas?: () => void
}

export function PersonaPicker({ conversationId, onManagePersonas }: Props) {
  const { personas, draftPersonaId, isLoaded, loadPersonas, setDraftPersona } = usePersonaStore()
  const { conversations, updateConversationPersona } = useChatStore()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isLoaded) {
      void loadPersonas()
    }
  }, [isLoaded, loadPersonas])

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === conversationId) ?? null,
    [conversationId, conversations],
  )

  const selectedPersonaId = activeConversation ? activeConversation.personaId : draftPersonaId
  const selectedPersona = personas.find((persona) => persona.id === selectedPersonaId) ?? null

  const applyPersona = async (persona: Persona | null) => {
    if (activeConversation) {
      await updateConversationPersona(activeConversation.id, persona?.id ?? null)
    } else {
      setDraftPersona(persona?.id ?? null)
    }
    setOpen(false)
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
          selectedPersona
            ? 'border-primary-container bg-primary-container/10 text-primary-container'
            : 'border-outline-variant bg-surface-container text-on-surface-variant hover:text-on-surface'
        }`}
        title="Select persona"
      >
        <span className="text-sm leading-none">{selectedPersona?.icon || '🪄'}</span>
        <span className="max-w-32 truncate">{selectedPersona?.name || 'Persona'}</span>
        <span className={`material-symbols-outlined text-[16px] transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-80 rounded-xl border border-outline-variant bg-surface-container-low p-2 shadow-xl">
          <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Persona
          </div>

          <button
            onClick={() => void applyPersona(null)}
            className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
              !selectedPersona ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span className="text-base">○</span>
            <div>
              <div className="text-sm font-medium">None</div>
              <div className="text-xs text-on-surface-variant">Use the model without a persona.</div>
            </div>
          </button>

          <div className="mt-1 max-h-72 overflow-y-auto">
            {personas.map((persona) => {
              const isSelected = persona.id === selectedPersonaId
              return (
                <button
                  key={persona.id}
                  onClick={() => void applyPersona(persona)}
                  className={`mt-1 flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                    isSelected ? 'bg-primary-container/10 text-on-surface' : 'text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  <span className="text-lg leading-none">{persona.icon || '🤖'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-on-surface">{persona.name}</div>
                    <div className="line-clamp-2 text-xs text-on-surface-variant">{persona.systemPrompt}</div>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-2 border-t border-outline-variant pt-2">
            <button
              onClick={() => {
                setOpen(false)
                onManagePersonas?.()
              }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
            >
              <span>Manage personas</span>
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
