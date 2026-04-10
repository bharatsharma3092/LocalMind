import { create } from 'zustand'

interface WorkspaceStore {
  workspaces: any[]
  activeWorkspaceId: string | null
  setActiveWorkspace: (id: string | null) => void
  loadWorkspaces: () => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaces: [],
  activeWorkspaceId: null,
  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
  loadWorkspaces: async () => {
    const res = await window.localmind.workspace.list()
    if (res.success && res.data) {
      set({ workspaces: res.data })
    }
  },
}))
