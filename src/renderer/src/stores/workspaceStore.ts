import { create } from 'zustand'

interface Workspace {
  id: string
  name: string
  systemPrompt?: string
  defaultModel?: string
  createdAt: number
  updatedAt: number
}

interface WorkspaceStore {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  loadWorkspaces: () => Promise<void>
  setActiveWorkspace: (id: string | null) => Promise<void>
  createWorkspace: (data: { name: string; systemPrompt?: string; defaultModel?: string }) => Promise<void>
  updateWorkspace: (id: string, data: Partial<Workspace>) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,

  loadWorkspaces: async () => {
    const res = await window.localmind.workspace.list()
    if (res.success && res.data) {
      set({ workspaces: res.data })
    }
  },

  setActiveWorkspace: async (id) => {
    if (id) {
      await window.localmind.workspace.setActive(id)
    }
    set({ activeWorkspaceId: id })
  },

  createWorkspace: async (data) => {
    await window.localmind.workspace.create(data)
    await get().loadWorkspaces()
  },

  updateWorkspace: async (id, data) => {
    await window.localmind.workspace.update(id, data)
    await get().loadWorkspaces()
  },

  deleteWorkspace: async (id) => {
    await window.localmind.workspace.delete(id)
    if (get().activeWorkspaceId === id) {
      set({ activeWorkspaceId: null })
    }
    await get().loadWorkspaces()
  },
}))
