import { create } from 'zustand'

interface UIStore {
  sidebarOpen: boolean
  artifactPanelOpen: boolean
  artifactPanelWidth: number
  activeMcpPanel: boolean
  toggleSidebar: () => void
  toggleArtifactPanel: () => void
  setArtifactPanelWidth: (w: number) => void
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  artifactPanelOpen: false,
  artifactPanelWidth: 420,
  activeMcpPanel: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleArtifactPanel: () => set((s) => ({ artifactPanelOpen: !s.artifactPanelOpen })),
  setArtifactPanelWidth: (w) => set({ artifactPanelWidth: w }),
}))
