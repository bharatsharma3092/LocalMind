import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mapProviderError } from './router'

describe('mapProviderError', () => {
  it('maps 401 to invalid API key message', () => {
    expect(mapProviderError(401, 'OpenAI')).toContain('Invalid API key')
    expect(mapProviderError(401, 'OpenAI')).toContain('OpenAI')
  })

  it('maps 403 to access denied message', () => {
    expect(mapProviderError(403, 'Google')).toContain('Access denied')
  })

  it('maps 429 to rate limit message', () => {
    expect(mapProviderError(429, 'OpenRouter')).toContain('Rate limit')
  })

  it('maps 500 to server error message', () => {
    expect(mapProviderError(500, 'Ollama')).toContain('server error')
  })

  it('maps 503 to unavailable message', () => {
    expect(mapProviderError(503, 'OpenRouter')).toContain('unavailable')
  })

  it('returns generic message for unknown status codes', () => {
    const msg = mapProviderError(418, 'TestProvider')
    expect(msg).toContain('Unexpected error')
    expect(msg).toContain('HTTP 418')
    expect(msg).toContain('TestProvider')
  })
})

describe('LLMRouter', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('blocks non-Ollama providers when privacy mode is on', async () => {
    vi.doMock('../settings/app-store', () => ({
      appStore: { get: (key: string) => key === 'privacyMode' },
    }))

    const { LLMRouter: Router } = await import('./router')
    const router = new Router()

    const request = {
      messages: [{ role: 'user' as const, content: 'hi' }],
      model: 'gpt-4',
      provider: 'openai' as const,
      stream: true,
    }

    await expect(async () => {
      for await (const _ of router.complete(request)) {
        // should not yield anything
      }
    }).rejects.toThrow('Privacy Mode is enabled')
  })

  it('allows Ollama when privacy mode is on', async () => {
    vi.doMock('../settings/app-store', () => ({
      appStore: { get: (key: string) => key === 'privacyMode' },
    }))
    vi.doMock('./providers/ollama', () => ({
      OllamaProvider: class {
        async *complete() {
          yield { type: 'text', content: 'hello' }
          yield { type: 'done', usage: { promptTokens: 1, completionTokens: 1 } }
        }
        async listModels() { return [] }
        async validateConfig() { return true }
      },
    }))
    vi.doMock('./providers/openai', () => ({ OpenAIProvider: class {} }))
    vi.doMock('./providers/openrouter', () => ({ OpenRouterProvider: class {} }))
    vi.doMock('./providers/google', () => ({ GoogleProvider: class {} }))
    vi.doMock('./providers/custom', () => ({ CustomProvider: class {}, getCustomProvidersFromSettings: () => [] }))

    const { LLMRouter: Router } = await import('./router')
    const router = new Router()

    const request = {
      messages: [{ role: 'user' as const, content: 'hi' }],
      model: 'llama3',
      provider: 'ollama' as const,
      stream: true,
    }

    const chunks: any[] = []
    for await (const chunk of router.complete(request)) {
      chunks.push(chunk)
    }
    expect(chunks.length).toBeGreaterThan(0)
  })

  it('falls back to the default custom provider for unknown providers', async () => {
    vi.doMock('../settings/app-store', () => ({
      appStore: { get: () => false },
    }))
    vi.doMock('./providers/ollama', () => ({ OllamaProvider: class {} }))
    vi.doMock('./providers/openai', () => ({ OpenAIProvider: class {} }))
    vi.doMock('./providers/openrouter', () => ({ OpenRouterProvider: class {} }))
    vi.doMock('./providers/google', () => ({ GoogleProvider: class {} }))
    vi.doMock('./providers/custom', () => ({
      CustomProvider: class {
        async *complete() {
          yield { type: 'text', content: 'custom fallback' }
        }
      },
      getCustomProvidersFromSettings: () => [],
    }))

    const { LLMRouter: Router } = await import('./router')
    const router = new Router()

    const request = {
      messages: [{ role: 'user' as const, content: 'hi' }],
      model: 'x',
      provider: 'nonexistent' as any,
      stream: true,
    }

    const chunks: any[] = []
    for await (const chunk of router.complete(request)) {
      chunks.push(chunk)
    }
    expect(chunks[0]?.content).toBe('custom fallback')
  })

  it('delegates listModels to correct provider', async () => {
    const fakeModels = [{ id: 'test-model', name: 'Test', provider: 'ollama', contextWindow: 4096, supportsVision: false, supportsToolUse: false }]
    vi.doMock('../settings/app-store', () => ({
      appStore: { get: () => false },
    }))
    vi.doMock('./providers/ollama', () => ({
      OllamaProvider: class {
        async listModels() { return fakeModels }
        async validateConfig() { return true }
      },
    }))
    vi.doMock('./providers/openai', () => ({ OpenAIProvider: class {} }))
    vi.doMock('./providers/openrouter', () => ({ OpenRouterProvider: class {} }))
    vi.doMock('./providers/google', () => ({ GoogleProvider: class {} }))
    vi.doMock('./providers/custom', () => ({ CustomProvider: class {}, getCustomProvidersFromSettings: () => [] }))

    const { LLMRouter: Router } = await import('./router')
    const router = new Router()
    const models = await router.listModels('ollama')
    expect(models).toEqual(fakeModels)
  })
})
