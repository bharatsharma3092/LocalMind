import { create } from 'zustand'

interface UIStore {
  sidebarOpen: boolean
  artifactPanelOpen: boolean
  artifactPanelWidth: number
  activeMcpPanel: boolean
  activeArtifactId: string | null
  toggleSidebar: () => void
  toggleArtifactPanel: () => void
  setArtifactPanelWidth: (w: number) => void
  setActiveArtifactId: (id: string | null) => void
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  artifactPanelOpen: false,
  artifactPanelWidth: 420,
  activeMcpPanel: false,
  activeArtifactId: null,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleArtifactPanel: () => set((s) => ({ artifactPanelOpen: !s.artifactPanelOpen })),
  setArtifactPanelWidth: (w) => set({ artifactPanelWidth: w }),
  setActiveArtifactId: (id) => set({ activeArtifactId: id, artifactPanelOpen: id !== null }),
}))
