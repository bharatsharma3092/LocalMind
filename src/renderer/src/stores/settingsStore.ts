import { create } from 'zustand'

type Theme = 'light' | 'dark' | 'system'
type ColorTheme = 'default' | 'amber' | 'orange' | 'rose' | 'crimson' | 'coral' | 'sunset' | 'gold' | 'copper'
type WebSearchProvider = 'tavily' | 'serper' | 'exa' | 'duckduckgo'

function applyThemeToDOM(theme: Theme) {
  const root = document.documentElement
  root.removeAttribute('data-theme')
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark')
  } else if (theme === 'light') {
    root.setAttribute('data-theme', 'light')
  } else {
    root.setAttribute('data-theme', 'system')
  }
}

function applyColorToDOM(color: ColorTheme) {
  const root = document.documentElement
  root.removeAttribute('data-color')
  if (color !== 'default') {
    root.setAttribute('data-color', color)
  }
}

interface SettingsStore {
  theme: Theme
  colorTheme: ColorTheme
  privacyMode: boolean
  sidebarWidth: number
  webSearchEnabled: boolean
  webSearchProvider: WebSearchProvider
  setTheme: (theme: Theme) => void
  setColorTheme: (color: ColorTheme) => void
  setPrivacyMode: (enabled: boolean) => void
  setWebSearchEnabled: (enabled: boolean) => void
  setWebSearchProvider: (provider: WebSearchProvider) => void
  loadSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  theme: 'system',
  colorTheme: 'default',
  privacyMode: false,
  sidebarWidth: 260,
  webSearchEnabled: false,
  webSearchProvider: 'tavily',
  setTheme: async (theme) => {
    if (!window.localmind?.settings?.set) return
    await window.localmind.settings.set('theme', theme)
    applyThemeToDOM(theme)
    set({ theme })
  },
  setColorTheme: async (color) => {
    if (!window.localmind?.settings?.set) return
    await window.localmind.settings.set('colorTheme', color)
    applyColorToDOM(color)
    set({ colorTheme: color })
  },
  setPrivacyMode: async (enabled) => {
    if (!window.localmind?.settings?.set) return
    await window.localmind.settings.set('privacyMode', enabled)
    set({ privacyMode: enabled })
  },
  setWebSearchEnabled: async (enabled) => {
    if (!window.localmind?.websearch?.setEnabled) return
    await window.localmind.websearch.setEnabled(enabled)
    set({ webSearchEnabled: enabled })
  },
  setWebSearchProvider: async (provider) => {
    if (!window.localmind?.websearch?.setProvider) return
    await window.localmind.websearch.setProvider(provider)
    set({ webSearchProvider: provider })
  },
  loadSettings: async () => {
    if (!window.localmind?.settings?.getAll) {
      console.warn('[settingsStore] window.localmind not available -- skipping loadSettings')
      return
    }
    try {
      const [settingsRes, enabledRes, providerRes] = await Promise.all([
        window.localmind.settings.getAll(),
        window.localmind.websearch.getEnabled(),
        window.localmind.websearch.getProvider(),
      ])
      if (settingsRes.success && settingsRes.data) {
        const theme = (settingsRes.data.theme as Theme) ?? 'system'
        const colorTheme = (settingsRes.data.colorTheme as ColorTheme) ?? 'default'
        applyThemeToDOM(theme)
        applyColorToDOM(colorTheme)
        set({
          theme,
          colorTheme,
          privacyMode: settingsRes.data.privacyMode ?? false,
          sidebarWidth: settingsRes.data.sidebarWidth ?? 260,
          webSearchEnabled: enabledRes.success ? (enabledRes.data as boolean) : false,
          webSearchProvider: (providerRes.success ? providerRes.data : 'tavily') as WebSearchProvider,
        })
      }
    } catch (err) {
      console.error('[settingsStore] loadSettings failed', err)
    }
  },
}))
