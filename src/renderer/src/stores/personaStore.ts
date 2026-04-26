import { create } from 'zustand'
import type { Persona } from '@shared/types/localmind-api'

interface PersonaStore {
  personas: Persona[]
  draftPersonaId: string | null
  isLoaded: boolean
  loadPersonas: () => Promise<void>
  createPersona: (data: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Persona | null>
  updatePersona: (id: string, data: Partial<Pick<Persona, 'name' | 'systemPrompt' | 'icon'>>) => Promise<void>
  deletePersona: (id: string) => Promise<void>
  setDraftPersona: (personaId: string | null) => void
}

export const usePersonaStore = create<PersonaStore>((set, get) => ({
  personas: [],
  draftPersonaId: null,
  isLoaded: false,

  loadPersonas: async () => {
    const res = await window.localmind.persona.list()
    if (!res.success || !res.data) return

    set((state) => {
      const draftStillExists = !state.draftPersonaId || res.data!.some((persona) => persona.id === state.draftPersonaId)
      return {
        personas: res.data!,
        isLoaded: true,
        draftPersonaId: draftStillExists ? state.draftPersonaId : null,
      }
    })
  },

  createPersona: async (data) => {
    const res = await window.localmind.persona.create(data)
    if (!res.success || !res.data) return null

    set((state) => ({
      personas: [res.data!, ...state.personas.filter((persona) => persona.id !== res.data!.id)],
      isLoaded: true,
    }))

    return res.data
  },

  updatePersona: async (id, data) => {
    await window.localmind.persona.update(id, data)
    await get().loadPersonas()
  },

  deletePersona: async (id) => {
    await window.localmind.persona.delete(id)
    set((state) => ({
      personas: state.personas.filter((persona) => persona.id !== id),
      draftPersonaId: state.draftPersonaId === id ? null : state.draftPersonaId,
    }))
  },

  setDraftPersona: (draftPersonaId) => set({ draftPersonaId }),
}))
