import type { LLMProvider, LLMRequest, LLMStreamChunk, ModelInfo } from '../types'
import { mapProviderError } from '../router'
import { getSecret } from '../../settings/secrets'

export class OpenAIProvider implements LLMProvider {
  private baseUrl: string

  constructor(baseUrl: string = 'https://api.openai.com/v1') {
    this.baseUrl = baseUrl
  }

  private async getApiKey(): Promise<string> {
    const key = await getSecret('openai-api-key')
    if (!key) throw new Error('No OpenAI API key configured. Add one in Settings → Providers.')
    return key
  }

  async *complete(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const apiKey = await this.getApiKey()

    const body: any = {
      model: request.model,
      messages: request.messages.map((m) => {
        const msg: any = {
          role: m.role,
          content: typeof m.content === 'string' ? m.content : null,
        }
        if (m.toolCallId) msg.tool_call_id = m.toolCallId
        if (m.toolCalls) {
          msg.tool_calls = m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          }))
          if (msg.content === null) msg.content = null
        }
        return msg
      }),
      stream: request.stream,
    }

    if (request.temperature != null) body.temperature = request.temperature
    if (request.maxTokens != null) body.max_tokens = request.maxTokens
    if (request.tools) {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      }))
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(mapProviderError(response.status, 'OpenAI') + (errorText ? `: ${errorText}` : ''))
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
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            yield { type: 'done', usage: { promptTokens: 0, completionTokens: 0 } }
            continue
          }
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta
            if (delta?.content) {
              yield { type: 'text', content: delta.content }
            }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                yield {
                  type: 'tool_call',
                  toolCall: {
                    id: tc.id ?? '',
                    name: tc.function?.name ?? '',
                    arguments: tc.function?.arguments ?? '',
                  },
                }
              }
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } else {
      const data = await response.json()
      const choice = data.choices?.[0]
      if (choice?.message?.content) {
        yield { type: 'text', content: choice.message.content }
      }
      if (choice?.message?.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: tc.id ?? '',
              name: tc.function?.name ?? '',
              arguments: tc.function?.arguments ?? '',
            },
          }
        }
      }
      yield {
        type: 'done',
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
        },
      }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const apiKey = await this.getApiKey()
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!response.ok) return []
      const data = await response.json()
      const premiumModelRegex = /^(gpt-4o|gpt-4\.5|gpt-[5-9]|o[1-9])/i
      const snapshotRegex = /-\d{4}-\d{2}-\d{2}$/
      return (data.data ?? [])
        .filter((m: any) => {
          const id = m.id
          return premiumModelRegex.test(id) && !snapshotRegex.test(id)
        })
        .map((m: any) => ({
          id: m.id,
          name: m.id,
          provider: 'openai' as const,
          contextWindow: 128000,
          costPer1MTokens: { input: 10, output: 30 },
          supportsVision: true,
          supportsToolUse: true,
        }))
    } catch {
      return []
    }
  }

  /** Full catalog of chat-capable models (excludes embeddings/audio/image/moderation). */
  async listCatalog(): Promise<ModelInfo[]> {
    try {
      const apiKey = await this.getApiKey()
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!response.ok) return []
      const data = await response.json()
      const nonChatRegex = /(embedding|whisper|tts|audio|dall-e|moderation|image|realtime|transcribe)/i
      return (data.data ?? [])
        .filter((m: any) => typeof m.id === 'string' && /^(gpt|o[1-9]|chatgpt)/i.test(m.id) && !nonChatRegex.test(m.id))
        .map((m: any) => ({
          id: m.id,
          name: m.id,
          provider: 'openai' as const,
          contextWindow: 128000,
          supportsVision: true,
          supportsToolUse: true,
        }))
        .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id))
    } catch {
      return []
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      const apiKey = await this.getApiKey()
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      return response.ok
    } catch {
      return false
    }
  }
}
