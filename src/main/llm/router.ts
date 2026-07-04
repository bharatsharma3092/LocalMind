import type { LLMProvider, LLMRequest, LLMStreamChunk, ModelInfo, ProviderType } from './types'
import { OllamaProvider } from './providers/ollama'
import { OpenAIProvider } from './providers/openai'
import { OpenRouterProvider } from './providers/openrouter'
import { GoogleProvider } from './providers/google'
import { CloudflareProvider } from './providers/cloudflare'
import { CustomProvider, getCustomProvidersFromSettings } from './providers/custom'
import { appStore } from '../settings/app-store'

export function mapProviderError(status: number, provider: string): string {
  const map: Record<number, string> = {
    401: `Invalid API key for ${provider}. Check Settings → Providers.`,
    403: `Access denied by ${provider}. Check your plan or permissions.`,
    429: `Rate limit reached for ${provider}. Please wait before retrying.`,
    500: `${provider} server error. Try again in a moment.`,
    503: `${provider} is currently unavailable.`,
  }
  return map[status] ?? `Unexpected error from ${provider} (HTTP ${status})`
}

export class LLMRouter {
  private providers = new Map<string, LLMProvider>()

  constructor() {
    this.providers.set('ollama', new OllamaProvider())
    this.providers.set('openai', new OpenAIProvider())
    this.providers.set('openrouter', new OpenRouterProvider())
    this.providers.set('google', new GoogleProvider())
    this.providers.set('cloudflare', new CloudflareProvider())
    this.reloadCustomProviders()
  }

  reloadCustomProviders() {
    for (const key of [...this.providers.keys()]) {
      if (key.startsWith('custom:')) this.providers.delete(key)
    }
    const customProviders = getCustomProvidersFromSettings()
    for (const cp of customProviders) {
      this.providers.set(`custom:${cp.id}`, new CustomProvider(cp))
    }
    if (!this.providers.has('custom') && customProviders.length === 0) {
      this.providers.set('custom', new CustomProvider())
    }
    if (customProviders.length > 0 && !this.providers.has(`custom:${customProviders[0].id}`)) {
      this.providers.set('custom', new CustomProvider(customProviders[0]))
    }
  }

  async *complete(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const privacyMode = appStore.get('privacyMode')

    if (privacyMode && request.provider !== 'ollama') {
      throw new Error(
        'Privacy Mode is enabled. Only Ollama (local) provider is allowed. ' +
        'Disable Privacy Mode in Settings → Privacy to use cloud providers.'
      )
    }

    let providerKey = request.provider
    if (request.provider === 'custom' && request.customProviderId) {
      providerKey = `custom:${request.customProviderId}`
    }

    console.log(`[LLMRouter] Resolving provider`, {
      requestedProvider: request.provider,
      customProviderId: request.customProviderId,
      resolvedKey: providerKey,
      availableProviders: [...this.providers.keys()],
    })

    const provider = this.providers.get(providerKey) ?? this.providers.get('custom')
    if (!provider) throw new Error(`Provider "${request.provider}" is not configured`)

    console.log(`[LLMRouter] Using provider`, {
      providerKey,
      providerConstructor: provider.constructor.name,
    })

    yield* provider.complete(request)
  }

  async listModels(providerType: string): Promise<ModelInfo[]> {    if (providerType.startsWith('custom:')) {
      const provider = this.providers.get(providerType)
      if (!provider) throw new Error(`Provider "${providerType}" is not configured`)
      return provider.listModels()
    }

    if (providerType === 'custom') {
      this.reloadCustomProviders()
      const customProviders = getCustomProvidersFromSettings()
      const allModels: ModelInfo[] = []
      for (const cp of customProviders) {
        const provider = this.providers.get(`custom:${cp.id}`)
        if (provider) {
          const models = await provider.listModels()
          allModels.push(...models)
        }
      }
      if (allModels.length === 0) {
        const fallback = this.providers.get('custom')
        if (fallback) return fallback.listModels()
      }
      return allModels
    }

    const provider = this.providers.get(providerType)
    if (!provider) throw new Error(`Provider "${providerType}" is not configured`)
    return provider.listModels()
  }

  /** Full model catalog for a provider, for user model selection. */
  async listProviderCatalog(providerType: string): Promise<ModelInfo[]> {
    const provider = this.providers.get(providerType)
    if (!provider) throw new Error(`Provider "${providerType}" is not configured`)
    if (provider.listCatalog) return provider.listCatalog()
    return provider.listModels()
  }

  async validateProvider(providerType: string): Promise<boolean> {    const provider = this.providers.get(providerType)
    if (!provider) return false
    return provider.validateConfig()
  }

  getCustomProviderIds(): string[] {
    return [...this.providers.keys()].filter((k) => k.startsWith('custom:'))
  }
}

export const llmRouter = new LLMRouter()
