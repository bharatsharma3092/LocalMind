import { create } from 'zustand'

interface SettingsStore {
  theme: 'light' | 'dark' | 'system'
  privacyMode: boolean
  sidebarWidth: number
  setTheme: (theme: 'light' | 'dark' | 'system') => void
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
    set({ theme })
  },
  setPrivacyMode: async (enabled) => {
    if (!window.localmind?.settings?.set) return
    await window.localmind.settings.set('privacyMode', enabled)
    set({ privacyMode: enabled })
  },
  loadSettings: async () => {
    // Guard: only callable inside Electron where the IPC bridge exists
    if (!window.localmind?.settings?.getAll) {
      console.warn('[settingsStore] window.localmind not available -- skipping loadSettings')
      return
    }
    try {
      const res = await window.localmind.settings.getAll()
      if (res.success && res.data) {
        set({
          theme: res.data.theme ?? 'system',
          privacyMode: res.data.privacyMode ?? false,
          sidebarWidth: res.data.sidebarWidth ?? 260,
        })
      }
    } catch (err) {
      console.error('[settingsStore] loadSettings failed', err)
    }
  },
}))
