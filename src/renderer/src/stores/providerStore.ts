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

export const useProviderStore = create<ProviderStore>((set, get) => ({
  availableModels: [],
  selectedModel: null,
  providerStatus: {},

  setModel: (model) => set({ selectedModel: model }),

  refreshModels: async (provider) => {
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
  },

  setProviderStatus: (provider, status) => {
    set((s) => ({
      providerStatus: { ...s.providerStatus, [provider]: status },
    }))
  },
}))
