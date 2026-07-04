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
  apiFormat?: 'openai' | 'anthropic'
  models: { id: string; name: string; contextWindow?: number }[]
}

export type ProviderStatus = 'unknown' | 'online' | 'offline' | 'error'

export function extractContextWindow(modelId: string, parsedValue?: number): number {
  if (parsedValue && parsedValue > 0 && parsedValue !== 4096) {
    return parsedValue;
  }
  const id = modelId.toLowerCase();
  
  if (id.includes('gemini-1.5-pro') || id.includes('gemini-2.0-pro') || id.includes('gemini-2.5-pro')) {
    return 2000000;
  }
  if (id.includes('gemini-1.5-flash') || id.includes('gemini-2.0-flash') || id.includes('gemini-2.5-flash')) {
    return 1000000;
  }
  if (id.includes('gemini')) {
    return 1000000;
  }
  
  if (id.includes('claude-3-5') || id.includes('claude-3.5') || id.includes('claude-3')) {
    return 200000;
  }
  
  if (id.includes('gpt-4o') || id.includes('gpt-4-turbo')) {
    return 128000;
  }
  if (id.includes('o1') || id.includes('o3-mini')) {
    return 200000;
  }
  if (id.includes('gpt-4')) {
    return 8192;
  }
  
  if (id.includes('llama-3.1') || id.includes('llama-3.2') || id.includes('llama-3')) {
    return 128000;
  }
  
  if (id.includes('mixtral') || id.includes('mistral')) {
    return 32768;
  }
  
  return 128000;
}

interface ProviderStore {
  availableModels: ModelInfo[]
  selectedModel: ModelInfo | null
  providerStatus: Record<string, ProviderStatus>
  providerErrors: Record<string, string>
  customProviders: CustomProviderConfig[]
  /** User-selected models per built-in provider (openai/openrouter/google). Empty = auto list. */
  enabledModels: Record<string, { id: string; name: string; contextWindow?: number }[]>
  setModel: (model: ModelInfo) => void
  refreshModels: (provider: string) => Promise<void>
  refreshAllModels: () => Promise<void>
  setProviderStatus: (provider: string, status: ProviderStatus) => void
  loadCustomProviders: () => Promise<void>
  saveCustomProviders: (providers: CustomProviderConfig[]) => Promise<void>
  loadEnabledModels: () => Promise<void>
  setEnabledModels: (provider: string, models: { id: string; name: string; contextWindow?: number }[]) => Promise<void>
}

export const useProviderStore = create<ProviderStore>((set, get) => ({
  availableModels: [],
  selectedModel: null,
  providerStatus: {},
  providerErrors: {},
  customProviders: [],
  enabledModels: {},

  setModel: (model) => {
    set({ selectedModel: model })
    try {
      window.localmind?.settings?.set('selectedModelInfo', model)
    } catch {}
  },

  loadEnabledModels: async () => {
    try {
      const res = await window.localmind.settings.get('enabledModels')
      if (res.success && res.data && typeof res.data === 'object') {
        set({ enabledModels: res.data })
      }
    } catch {}
  },

  setEnabledModels: async (provider, models) => {
    const next = { ...get().enabledModels, [provider]: models }
    set({ enabledModels: next })
    await window.localmind.settings.set('enabledModels', next)
    await get().refreshModels(provider)
  },

  loadCustomProviders: async () => {
    try {
      const savedRes = await window.localmind.settings.get('selectedModelInfo')
      if (savedRes.success && savedRes.data) {
        set({ selectedModel: savedRes.data })
      }
    } catch {}

    await get().loadEnabledModels()

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
          apiFormat: 'openai',
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

    // If the user has explicitly selected models for this built-in provider,
    // use exactly that selection instead of the auto/curated list.
    const selection = get().enabledModels[provider]
    if (selection && selection.length > 0) {
      const models: ModelInfo[] = selection.map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        provider,
        contextWindow: extractContextWindow(m.id, m.contextWindow),
        supportsVision: false,
        supportsToolUse: true,
      }))
      set((s) => ({
        availableModels: [...s.availableModels.filter((m) => m.provider !== provider), ...models],
        providerStatus: { ...s.providerStatus, [provider]: 'online' },
        providerErrors: { ...s.providerErrors, [provider]: '' },
        selectedModel: s.selectedModel ?? models[0] ?? null,
      }))
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

    const builtinProviders = ['ollama', 'openai', 'openrouter', 'google', 'cloudflare']
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
            contextWindow: extractContextWindow(m.id, m.contextWindow),
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
    if (state.selectedModel) {
      const matchingModel = state.availableModels.find(
        (m) =>
          m.id === state.selectedModel?.id &&
          m.provider === state.selectedModel?.provider &&
          (m.customProviderId ?? '') === (state.selectedModel?.customProviderId ?? '')
      )
      if (matchingModel) {
        set({ selectedModel: matchingModel })
        try {
          window.localmind?.settings?.set('selectedModelInfo', matchingModel)
        } catch {}
      } else if (state.availableModels.length > 0) {
        set({ selectedModel: state.availableModels[0] })
      }
    } else if (state.availableModels.length > 0) {
      set({ selectedModel: state.availableModels[0] })
    }
  },

  setProviderStatus: (provider, status) => {
    set((s) => ({
      providerStatus: { ...s.providerStatus, [provider]: status },
    }))
  },
}))
