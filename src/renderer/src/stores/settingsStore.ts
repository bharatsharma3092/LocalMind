import { create } from 'zustand'

type Theme = 'light' | 'dark' | 'system'

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

interface SettingsStore {
  theme: Theme
  privacyMode: boolean
  sidebarWidth: number
  setTheme: (theme: Theme) => void
  setPrivacyMode: (enabled: boolean) => void
  loadSettings: () => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  theme: 'system',
  privacyMode: false,
  sidebarWidth: 260,
  setTheme: async (theme) => {
    if (!window.localmind?.settings?.set) return
    await window.localmind.settings.set('theme', theme)
    applyThemeToDOM(theme)
    set({ theme })
  },
  setPrivacyMode: async (enabled) => {
    if (!window.localmind?.settings?.set) return
    await window.localmind.settings.set('privacyMode', enabled)
    set({ privacyMode: enabled })
  },
  loadSettings: async () => {
    if (!window.localmind?.settings?.getAll) {
      console.warn('[settingsStore] window.localmind not available -- skipping loadSettings')
      return
    }
    try {
      const res = await window.localmind.settings.getAll()
      if (res.success && res.data) {
        const theme = (res.data.theme as Theme) ?? 'system'
        applyThemeToDOM(theme)
        set({
          theme,
          privacyMode: res.data.privacyMode ?? false,
          sidebarWidth: res.data.sidebarWidth ?? 260,
        })
      }
    } catch (err) {
      console.error('[settingsStore] loadSettings failed', err)
    }
  },
}))
