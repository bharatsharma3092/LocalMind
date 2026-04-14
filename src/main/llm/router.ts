import type { LLMProvider, LLMRequest, LLMStreamChunk, ModelInfo, ProviderType } from './types'
import { OllamaProvider } from './providers/ollama'
import { OpenAIProvider } from './providers/openai'
import { OpenRouterProvider } from './providers/openrouter'
import { GoogleProvider } from './providers/google'
import { CustomProvider } from './providers/custom'
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
  private providers = new Map<ProviderType, LLMProvider>()

  constructor() {
    this.providers.set('ollama', new OllamaProvider())
    this.providers.set('openai', new OpenAIProvider())
    this.providers.set('openrouter', new OpenRouterProvider())
    this.providers.set('google', new GoogleProvider())
    this.providers.set('custom', new CustomProvider())
  }

  async *complete(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const privacyMode = appStore.get('privacyMode')

    if (privacyMode && request.provider !== 'ollama') {
      throw new Error(
        'Privacy Mode is enabled. Only Ollama (local) provider is allowed. ' +
        'Disable Privacy Mode in Settings → Privacy to use cloud providers.'
      )
    }

    const provider = this.providers.get(request.provider)
    if (!provider) throw new Error(`Provider "${request.provider}" is not configured`)

    yield* provider.complete(request)
  }

  async listModels(providerType: string): Promise<ModelInfo[]> {
    const provider = this.providers.get(providerType as ProviderType)
    if (!provider) throw new Error(`Provider "${providerType}" is not configured`)
    return provider.listModels()
  }

  async validateProvider(providerType: string): Promise<boolean> {
    const provider = this.providers.get(providerType as ProviderType)
    if (!provider) return false
    return provider.validateConfig()
  }
}

export const llmRouter = new LLMRouter()
