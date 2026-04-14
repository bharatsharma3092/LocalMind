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

export type ProviderStatus = 'unknown' | 'online' | 'offline' | 'error'

interface ProviderStore {
  availableModels: ModelInfo[]
  selectedModel: ModelInfo | null
  providerStatus: Record<string, ProviderStatus>
  providerErrors: Record<string, string>
  setModel: (model: ModelInfo) => void
  refreshModels: (provider: string) => Promise<void>
  refreshAllModels: () => Promise<void>
  setProviderStatus: (provider: string, status: ProviderStatus) => void
}

export const useProviderStore = create<ProviderStore>((set, get) => ({
  availableModels: [],
  selectedModel: null,
  providerStatus: {},
  providerErrors: {},

  setModel: (model) => set({ selectedModel: model }),

  refreshModels: async (provider) => {
    if (!window.localmind?.llm?.listModels) {
      console.warn('[providerStore] window.localmind not available -- skipping refreshModels')
      return
    }
    try {
      const res = await window.localmind.llm.listModels(provider)
      if (res.success && res.data) {
        const models = res.data
        set((s) => ({
          availableModels: [
            ...s.availableModels.filter((m) => m.provider !== provider),
            ...models,
          ],
          providerStatus: { ...s.providerStatus, [provider]: 'online' },
          providerErrors: { ...s.providerErrors, [provider]: '' },
          selectedModel: s.selectedModel
            ? s.selectedModel
            : models.length > 0
              ? models[0]
              : null,
        }))
      } else {
        const errorMsg = res.error ?? `Failed to fetch models from ${provider}`
        set((s) => ({
          providerStatus: { ...s.providerStatus, [provider]: 'offline' },
          providerErrors: { ...s.providerErrors, [provider]: errorMsg },
        }))
      }
    } catch (err: any) {
      const errorMsg = err?.message ?? `Cannot connect to ${provider}`
      const isConnectionError = errorMsg.includes('ECONNREFUSED') || errorMsg.includes('fetch failed') || errorMsg.includes('ENOTFOUND')
      set((s) => ({
        providerStatus: {
          ...s.providerStatus,
          [provider]: isConnectionError ? 'offline' : 'error',
        },
        providerErrors: { ...s.providerErrors, [provider]: errorMsg },
      }))
    }
  },

  refreshAllModels: async () => {
    const providers = ['ollama', 'openai', 'openrouter', 'google', 'custom']
    await Promise.allSettled(
      providers.map((p) => get().refreshModels(p))
    )
  },

  setProviderStatus: (provider, status) => {
    set((s) => ({
      providerStatus: { ...s.providerStatus, [provider]: status },
    }))
  },
}))
