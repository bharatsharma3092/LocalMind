import ElectronStore from 'electron-store'

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  privacyMode: boolean
  activeWorkspaceId: string | null
  defaultModelProfile: string | null
  globalShortcut: string
  windowBounds: { width: number; height: number; x: number; y: number }
  windowMaximized: boolean
  sidebarWidth: number
  artifactPanelWidth: number
  onboardingComplete: boolean
  autoCompressThreshold: number
}

const defaults: AppSettings = {
  theme: 'system',
  privacyMode: false,
  activeWorkspaceId: null,
  defaultModelProfile: null,
  globalShortcut: 'CommandOrControl+Shift+Space',
  windowBounds: { width: 1280, height: 800, x: 0, y: 0 },
  windowMaximized: false,
  sidebarWidth: 260,
  artifactPanelWidth: 420,
  onboardingComplete: false,
  autoCompressThreshold: 0,
}

export const appStore = new ElectronStore<AppSettings>({ defaults })
