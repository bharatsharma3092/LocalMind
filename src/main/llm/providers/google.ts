import type { LLMProvider, LLMRequest, LLMStreamChunk, ModelInfo } from '../types'
import { mapProviderError } from '../router'

export class GoogleProvider implements LLMProvider {
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta'

  private async getApiKey(): Promise<string> {
    const { getSecret } = require('../../settings/secrets')
    const key = await getSecret('google-api-key')
    if (!key) throw new Error('No Google API key configured. Add one in Settings → Providers.')
    return key
  }

  async *complete(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const apiKey = await this.getApiKey()
    const streamSuffix = request.stream ? ':streamGenerateContent' : ':generateContent'

    const contents = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
      }))

    const systemMessage = request.messages.find((m) => m.role === 'system')

    const body: any = {
      contents,
      generationConfig: {
        ...(request.temperature != null && { temperature: request.temperature }),
        ...(request.maxTokens != null && { maxOutputTokens: request.maxTokens }),
      },
    }

    if (systemMessage) {
      body.systemInstruction = {
        parts: [{ text: typeof systemMessage.content === 'string' ? systemMessage.content : '' }],
      }
    }

    const url = `${this.baseUrl}/models/${request.model}${streamSuffix}?key=${apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: request.signal,
    })

    if (!response.ok) {
      throw new Error(mapProviderError(response.status, 'Google Gemini'))
    }

    if (request.stream && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          // Gemini streams JSON objects prefixed with "data: " or just plain JSON
          let jsonStr = trimmed
          if (jsonStr.startsWith('data: ')) jsonStr = jsonStr.slice(6)

          try {
            const parsed = JSON.parse(jsonStr)
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
            if (text) yield { type: 'text', content: text }
            if (parsed.usageMetadata) {
              yield {
                type: 'done',
                usage: {
                  promptTokens: parsed.usageMetadata.promptTokenCount ?? 0,
                  completionTokens: parsed.usageMetadata.candidatesTokenCount ?? 0,
                },
              }
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } else {
      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) yield { type: 'text', content: text }
      yield {
        type: 'done',
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        },
      }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const apiKey = await this.getApiKey()
      const response = await fetch(`${this.baseUrl}/models?key=${apiKey}`)
      if (!response.ok) return []
      const data = await response.json()
      return (data.models ?? []).map((m: any) => ({
        id: m.name.replace('models/', ''),
        name: m.displayName ?? m.name,
        provider: 'google' as const,
        contextWindow: m.inputTokenLimit ?? 32768,
        supportsVision: (m.supportedGenerationMethods ?? []).includes('generateContent'),
        supportsToolUse: true,
      }))
    } catch {
      return []
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      const apiKey = await this.getApiKey()
      const response = await fetch(`${this.baseUrl}/models?key=${apiKey}`)
      return response.ok
    } catch {
      return false
    }
  }
}
