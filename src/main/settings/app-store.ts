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
  shortTermMemories?: {
    id: string
    content: string
    sourceConversationId?: string
    createdAt: number
  }[]
  cloudflareAccountId?: string
  cloudflareModels?: {
    id: string
    name?: string
    contextWindow?: number
  }[]
  /** Agent browser backend: 'embedded' = LocalMind's Chromium window; 'cdp' = your real Chrome/Edge over DevTools Protocol. */
  browserMode?: 'embedded' | 'cdp'
  cdpHost?: string
  cdpPort?: number
  /** Optional path to chrome.exe / msedge.exe used to auto-launch a debuggable browser in CDP mode. */
  cdpBrowserPath?: string
  /** Ollama model used for local RAG embeddings (must be pulled, e.g. `ollama pull nomic-embed-text`). */
  ragEmbeddingModel?: string
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
  shortTermMemories: [],
  ragEmbeddingModel: 'nomic-embed-text',
  claudeCodeProxy: {
    enabled: false,
    port: 4000,
    apiKey: 'localmind-proxy-key',
  },
}

export const appStore = new ElectronStore<AppSettings>({ defaults })
