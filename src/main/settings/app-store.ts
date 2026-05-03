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
  launchOnStartup: boolean
  systemTray: boolean
  checkUpdates: boolean
  defaultModel: string | null
  contextLength: number
  userProfile?: {
    displayName: string
    email: string
    authProvider: 'local' | 'google' | 'github' | 'microsoft' | null
  }
  memoryEnabled?: boolean
  memories?: {
    id: string
    content: string
    source: string
    enabled: boolean
    createdAt: number
  }[]
  claudeCodeProxy?: {
    enabled: boolean
    port: number
    apiKey: string
    opusModel?: any
    sonnetModel?: any
    haikuModel?: any
  }
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
  launchOnStartup: false,
  systemTray: false,
  checkUpdates: true,
  defaultModel: null,
  contextLength: 8192,
  userProfile: {
    displayName: '',
    email: '',
    authProvider: null,
  },
  memoryEnabled: true,
  memories: [],
  claudeCodeProxy: {
    enabled: false,
    port: 4000,
    apiKey: 'localmind-proxy-key',
  },
}

export const appStore = new ElectronStore<AppSettings>({ defaults })
