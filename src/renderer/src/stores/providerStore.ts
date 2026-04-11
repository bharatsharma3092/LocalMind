import { create } from 'zustand'

export interface ModelInfo {
  id: string
  name: string
  provider: string
  contextWindow: number
  costPer1MTokens?: { input: number; output: number }
  supportsVision: boolean
  supportsToolUse: boolean
}

interface ProviderStore {
  availableModels: ModelInfo[]
  selectedModel: ModelInfo | null
  providerStatus: Record<string, boolean>
  setModel: (model: ModelInfo) => void
  refreshModels: (provider: string) => Promise<void>
  setProviderStatus: (provider: string, status: boolean) => void
}

export const useProviderStore = create<ProviderStore>((set) => ({
  availableModels: [],
  selectedModel: null,
  providerStatus: {},

  setModel: (model) => set({ selectedModel: model }),

  refreshModels: async (provider) => {
    // Guard: window.localmind is only available inside Electron (injected by
    // preload via contextBridge). If the app is loaded in a plain browser tab
    // (e.g. the Vite dev server at localhost:5173) the bridge doesn't exist.
    // Without this guard the call throws, the ErrorBoundary catches it, and
    // the entire app renders blank.
    if (!window.localmind?.llm?.listModels) {
      console.warn('[providerStore] window.localmind not available -- skipping refreshModels')
      return
    }
    try {
      const res = await window.localmind.llm.listModels(provider)
      if (res.success && res.data) {
        set((s) => ({
          availableModels: [
            ...s.availableModels.filter((m) => m.provider !== provider),
            ...res.data!,
          ],
          providerStatus: { ...s.providerStatus, [provider]: true },
        }))
      } else {
        set((s) => ({
          providerStatus: { ...s.providerStatus, [provider]: false },
        }))
      }
    } catch (err) {
      console.error('[providerStore] refreshModels failed', err)
      set((s) => ({
        providerStatus: { ...s.providerStatus, [provider]: false },
      }))
    }
  },

  setProviderStatus: (provider, status) => {
    set((s) => ({
      providerStatus: { ...s.providerStatus, [provider]: status },
    }))
  },
}))
