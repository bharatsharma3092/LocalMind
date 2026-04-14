import type { LLMProvider, LLMRequest, LLMStreamChunk, ModelInfo } from '../types'
import { mapProviderError } from '../router'
import { getSecret } from '../../settings/secrets'

export class OpenRouterProvider implements LLMProvider {
  private baseUrl = 'https://openrouter.ai/api/v1'

  private async getApiKey(): Promise<string> {
    const key = await getSecret('openrouter-api-key')
    if (!key) throw new Error('No OpenRouter API key configured. Add one in Settings → Providers.')
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
        'HTTP-Referer': 'https://localmind.dev',
      },
      body: JSON.stringify(body),
      signal: request.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      console.error(`[OpenRouter] API error ${response.status}: ${errorBody}`)
      throw new Error(mapProviderError(response.status, 'OpenRouter') + (errorBody ? `: ${errorBody}` : ''))
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
            if (delta?.content) yield { type: 'text', content: delta.content }
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
      const content = data.choices?.[0]?.message?.content
      if (content) yield { type: 'text', content }
      if (data.choices?.[0]?.message?.tool_calls) {
        for (const tc of data.choices[0].message.tool_calls) {
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
      const response = await fetch(`${this.baseUrl}/models`)
      if (!response.ok) return []
      const data = await response.json()
      return (data.data ?? []).slice(0, 50).map((m: any) => ({
        id: m.id,
        name: m.name ?? m.id,
        provider: 'openrouter' as const,
        contextWindow: m.context_length ?? 4096,
        costPer1MTokens: m.pricing
          ? {
              input: Math.round((m.pricing.prompt ?? 0) * 1_000_000),
              output: Math.round((m.pricing.completion ?? 0) * 1_000_000),
            }
          : undefined,
        supportsVision: (m.architecture?.modality ?? '').includes('image'),
        supportsToolUse: true,
      }))
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
