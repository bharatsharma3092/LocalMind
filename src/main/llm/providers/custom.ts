import type { LLMProvider, LLMRequest, LLMStreamChunk, ModelInfo } from '../types'
import { mapProviderError } from '../router'
import { getSecret } from '../../settings/secrets'
import { appStore } from '../../settings/app-store'

export class CustomProvider implements LLMProvider {
  private getBaseUrl(): string {
    try {
      return appStore.get('customProviderUrl') ?? 'http://localhost:8080/v1'
    } catch {
      return 'http://localhost:8080/v1'
    }
  }

  private async getApiKey(): Promise<string | null> {
    return await getSecret('custom-api-key')
  }

  async *complete(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const baseUrl = this.getBaseUrl()
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

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: request.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      console.error(`[Custom] API error ${response.status}: ${errorBody}`)
      throw new Error(mapProviderError(response.status, 'Custom Provider') + (errorBody ? `: ${errorBody}` : ''))
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
      const baseUrl = this.getBaseUrl()
      const apiKey = await this.getApiKey()
      const headers: Record<string, string> = {}
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

      const response = await fetch(`${baseUrl}/models`, { headers })
      if (!response.ok) return []
      const data = await response.json()
      return (data.data ?? []).map((m: any) => ({
        id: m.id,
        name: m.id,
        provider: 'custom' as const,
        contextWindow: 4096,
        supportsVision: false,
        supportsToolUse: true,
      }))
    } catch {
      return []
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      const baseUrl = this.getBaseUrl()
      const response = await fetch(`${baseUrl}/models`)
      return response.ok
    } catch {
      return false
    }
  }
}
