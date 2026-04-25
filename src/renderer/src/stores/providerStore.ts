import { create } from 'zustand'

export interface ModelInfo {
  id: string
  name: string
  provider: string
  customProviderId?: string
  contextWindow: number
  costPer1MTokens?: { input: number; output: number }
  supportsVision: boolean
  supportsToolUse: boolean
}

export interface CustomProviderConfig {
  id: string
  name: string
  baseUrl: string
  models: { id: string; name: string }[]
}

export type ProviderStatus = 'unknown' | 'online' | 'offline' | 'error'

interface ProviderStore {
  availableModels: ModelInfo[]
  selectedModel: ModelInfo | null
  providerStatus: Record<string, ProviderStatus>
  providerErrors: Record<string, string>
  customProviders: CustomProviderConfig[]
  setModel: (model: ModelInfo) => void
  refreshModels: (provider: string) => Promise<void>
  refreshAllModels: () => Promise<void>
  setProviderStatus: (provider: string, status: ProviderStatus) => void
  loadCustomProviders: () => Promise<void>
  saveCustomProviders: (providers: CustomProviderConfig[]) => Promise<void>
}

export const useProviderStore = create<ProviderStore>((set, get) => ({
  availableModels: [],
  selectedModel: null,
  providerStatus: {},
  providerErrors: {},
  customProviders: [],

  setModel: (model) => set({ selectedModel: model }),

  loadCustomProviders: async () => {
    try {
      const res = await window.localmind.settings.get('customProviders')
      if (res.success && Array.isArray(res.data)) {
        set({ customProviders: res.data })
        return
      }
    } catch {}
    try {
      const urlRes = await window.localmind.settings.get('customProviderUrl')
      const modelsRes = await window.localmind.settings.get('customModels')
      const legacyUrl = urlRes.success ? urlRes.data : undefined
      const legacyModels = modelsRes.success && Array.isArray(modelsRes.data) ? modelsRes.data : []
      if (legacyUrl || legacyModels.length > 0) {
        const migrated: CustomProviderConfig[] = [{
          id: 'legacy',
          name: 'Custom Provider',
          baseUrl: legacyUrl ?? 'http://localhost:8080/v1',
          models: legacyModels,
        }]
        set({ customProviders: migrated })
        await window.localmind.settings.set('customProviders', migrated)
      }
    } catch {}
  },

  saveCustomProviders: async (providers) => {
    set({ customProviders: providers })
    await window.localmind.settings.set('customProviders', providers)
  },

  refreshModels: async (provider) => {
    if (!window.localmind?.llm?.listModels) {
      console.warn('[providerStore] window.localmind not available -- skipping refreshModels')
      return
    }
    try {
      const res = await window.localmind.llm.listModels(provider)
      if (res.success && res.data) {
        const models: ModelInfo[] = res.data
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
    const { customProviders } = get()

    const builtinProviders = ['ollama', 'openai', 'openrouter', 'google']
    await Promise.allSettled(
      builtinProviders.map((p) => get().refreshModels(p))
    )

    if (customProviders.length > 0) {
      const allCustomModels: ModelInfo[] = []
      for (const cp of customProviders) {
        const providerKey = `custom:${cp.id}`
        for (const m of cp.models) {
          allCustomModels.push({
            id: m.id,
            name: m.name ?? m.id,
            provider: 'custom',
            customProviderId: cp.id,
            contextWindow: 4096,
            supportsVision: false,
            supportsToolUse: true,
          })
        }
        set((s) => ({
          providerStatus: { ...s.providerStatus, [providerKey]: 'online' },
        }))
      }
      set((s) => ({
        availableModels: [
          ...s.availableModels.filter((m) => m.provider !== 'custom'),
          ...allCustomModels,
        ],
      }))
    } else {
      try {
        const res = await window.localmind.llm.listModels('custom')
        if (res.success && res.data) {
          set((s) => ({
            availableModels: [
              ...s.availableModels.filter((m) => m.provider !== 'custom'),
              ...res.data,
            ],
            providerStatus: { ...s.providerStatus, ['custom']: 'online' },
          }))
        }
      } catch {}
    }

    const state = get()
    if (!state.selectedModel && state.availableModels.length > 0) {
      set({ selectedModel: state.availableModels[0] })
    }
  },

  setProviderStatus: (provider, status) => {
    set((s) => ({
      providerStatus: { ...s.providerStatus, [provider]: status },
    }))
  },
}))
