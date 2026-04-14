import { useState, useEffect } from 'react'

interface Persona {
  id: string
  name: string
  systemPrompt: string
  icon?: string
  createdAt: number
  updatedAt: number
}

interface Props {
  onSelect?: (persona: Persona) => void
  onClose: () => void
}

export function PersonaLibrary({ onSelect, onClose }: Props) {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', systemPrompt: '', icon: '' })

  const refresh = async () => {
    const res = await window.localmind.persona.list()
    if (res.success && res.data) setPersonas(res.data)
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleSave = async () => {
    if (!form.name.trim() || !form.systemPrompt.trim()) return
    if (editingId) {
      await window.localmind.persona.update(editingId, form)
    } else {
      await window.localmind.persona.create(form)
    }
    setShowForm(false)
    setEditingId(null)
    setForm({ name: '', systemPrompt: '', icon: '' })
    refresh()
  }

  const handleEdit = (persona: Persona) => {
    setEditingId(persona.id)
    setForm({ name: persona.name, systemPrompt: persona.systemPrompt, icon: persona.icon ?? '' })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    await window.localmind.persona.delete(id)
    refresh()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Personas</h2>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowForm(!showForm)
                setEditingId(null)
                setForm({ name: '', systemPrompt: '', icon: '' })
              }}
              className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs hover:bg-accent-hover"
            >
              {showForm ? 'Cancel' : '+ New'}
            </button>
            <button onClick={onClose} className="text-text-muted hover:text-text p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {showForm && (
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                placeholder="Icon"
                className="w-14 text-center bg-surface-offset border border-border rounded-lg px-2 py-2 text-sm text-text outline-none focus:border-accent"
              />
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Persona name"
                className="flex-1 bg-surface-offset border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
            </div>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              placeholder="System prompt..."
              rows={5}
              className="w-full bg-surface-offset border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent resize-none"
            />
            <button onClick={handleSave} className="btn-primary text-xs w-full">
              {editingId ? 'Update' : 'Create'}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2">
          {personas.length === 0 && (
            <p className="text-sm text-text-muted text-center py-8">
              No personas yet. Create one to customize AI behavior.
            </p>
          )}
          {personas.map((persona) => (
            <div
              key={persona.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-surface-offset cursor-pointer group"
              onClick={() => onSelect?.(persona)}
            >
              <span className="text-xl w-8 text-center flex-shrink-0">
                {persona.icon || '🤖'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{persona.name}</p>
                <p className="text-xs text-text-muted truncate">
                  {persona.systemPrompt.slice(0, 100)}
                  {persona.systemPrompt.length > 100 ? '...' : ''}
                </p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); handleEdit(persona) }}
                  className="p-1 rounded hover:bg-surface text-text-muted hover:text-text"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(persona.id) }}
                  className="p-1 rounded hover:bg-surface text-text-muted hover:text-danger"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
