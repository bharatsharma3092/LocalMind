import { useEffect, useMemo, useState } from 'react'
import type { Persona } from '@shared/types/localmind-api'
import { usePersonaStore } from '../../stores/personaStore'

interface Props {
  onSelect?: (persona: Persona) => void
  onClose?: () => void
  embedded?: boolean
  selectedPersonaId?: string | null
}

export function PersonaLibrary({ onSelect, onClose, embedded = false, selectedPersonaId = null }: Props) {
  const {
    personas,
    isLoaded,
    loadPersonas,
    createPersona,
    updatePersona,
    deletePersona,
  } = usePersonaStore()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', systemPrompt: '', icon: '' })

  useEffect(() => {
    if (!isLoaded) {
      void loadPersonas()
    }
  }, [isLoaded, loadPersonas])

  const selectedPersona = useMemo(
    () => personas.find((persona) => persona.id === selectedPersonaId) ?? null,
    [personas, selectedPersonaId],
  )

  const resetForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm({ name: '', systemPrompt: '', icon: '' })
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.systemPrompt.trim()) return

    if (editingId) {
      await updatePersona(editingId, form)
    } else {
      await createPersona(form)
    }

    resetForm()
  }

  const handleEdit = (persona: Persona) => {
    setEditingId(persona.id)
    setForm({ name: persona.name, systemPrompt: persona.systemPrompt, icon: persona.icon ?? '' })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    await deletePersona(id)
  }

  return (
    <div className={`${embedded ? 'h-full' : 'h-[560px] w-[720px] max-w-full'} bg-background text-on-surface flex flex-col`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
        <div>
          <h2 className="text-lg font-semibold">Persona Library</h2>
          <p className="text-sm text-on-surface-variant">
            Create reusable system prompts and apply them to conversations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
            className="px-3 py-2 rounded-lg bg-primary-container text-white text-sm font-semibold hover:bg-accent-hover transition-colors"
          >
            New Persona
          </button>
          {!embedded && onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>
      </div>

      {selectedPersona && (
        <div className="px-5 py-3 border-b border-outline-variant bg-surface-container-low">
          <div className="flex items-center gap-2 text-sm text-on-surface">
            <span className="text-base">{selectedPersona.icon || '🤖'}</span>
            <span className="font-medium">Active in chat:</span>
            <span>{selectedPersona.name}</span>
          </div>
        </div>
      )}

      {showForm && (
        <div className="mx-5 mt-5 rounded-xl border border-outline-variant bg-surface-container-low p-4 space-y-3">
          <div className="grid grid-cols-[88px_1fr] items-center gap-3">
            <label className="text-sm text-on-surface-variant">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Creative Director"
              className="w-full rounded-lg border border-outline-variant bg-background px-3 py-2 text-sm outline-none focus:border-secondary"
            />
          </div>
          <div className="grid grid-cols-[88px_1fr] items-center gap-3">
            <label className="text-sm text-on-surface-variant">Icon</label>
            <input
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              placeholder="🎨"
              className="w-full rounded-lg border border-outline-variant bg-background px-3 py-2 text-sm outline-none focus:border-secondary"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-on-surface-variant">System prompt</label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              placeholder="You are a concise product designer who explains tradeoffs clearly..."
              rows={8}
              className="w-full rounded-lg border border-outline-variant bg-background px-3 py-2 text-sm outline-none focus:border-secondary resize-y"
            />
            <p className="text-xs text-on-surface-variant">
              Template variables: <code>{'{{date}}'}</code>, <code>{'{{time}}'}</code>, <code>{'{{year}}'}</code>, <code>{'{{os}}'}</code>, <code>{'{{model}}'}</code>, <code>{'{{provider}}'}</code>
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="px-3 py-2 rounded-lg bg-primary-container text-white text-sm font-semibold hover:bg-accent-hover transition-colors">
              {editingId ? 'Update Persona' : 'Create Persona'}
            </button>
            <button
              onClick={resetForm}
              className="px-3 py-2 rounded-lg border border-outline-variant text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5">
        {personas.length === 0 && !showForm && (
          <div className="h-full flex items-center justify-center text-center text-on-surface-variant">
            <div>
              <p className="text-sm">No personas yet.</p>
              <p className="text-xs mt-1">Create one to tailor how LocalMind responds.</p>
            </div>
          </div>
        )}

        <div className="grid gap-3">
          {personas.map((persona) => {
            const isSelected = persona.id === selectedPersonaId

            return (
              <div
                key={persona.id}
                className={`rounded-xl border p-4 transition-colors ${
                  isSelected
                    ? 'border-primary-container bg-primary-container/10'
                    : 'border-outline-variant bg-surface-container-low hover:bg-surface-container'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => onSelect?.(persona)}
                    className="flex flex-1 items-start gap-3 text-left"
                  >
                    <span className="text-2xl leading-none">{persona.icon || '🤖'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-on-surface truncate">{persona.name}</p>
                        {isSelected && (
                          <span className="rounded-full bg-primary-container px-2 py-0.5 text-[11px] font-semibold text-white">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-on-surface-variant whitespace-pre-wrap break-words line-clamp-4">
                        {persona.systemPrompt}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(persona)}
                      className="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-background transition-colors"
                      title="Edit persona"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button
                      onClick={() => handleDelete(persona.id)}
                      className="p-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-background transition-colors"
                      title="Delete persona"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
