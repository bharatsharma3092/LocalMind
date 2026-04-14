import type { LLMProvider, LLMRequest, LLMStreamChunk, ModelInfo } from '../types'

export class OllamaProvider implements LLMProvider {
  private baseUrl: string

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl
  }

  async *complete(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const messages = request.messages.map((m) => {
      const msg: any = {
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }
      if (m.toolCallId) msg.tool_call_id = m.toolCallId
      if (m.toolCalls) {
        msg.tool_calls = m.toolCalls.map((tc) => {
          let args: any = tc.arguments
          try { args = JSON.parse(tc.arguments) } catch {}
          return {
            function: { name: tc.name, arguments: args },
          }
        })
        if (msg.content === null || msg.content === '') msg.content = ''
      }
      return msg
    })

    const body: any = {
      model: request.model,
      messages,
      stream: request.stream,
    }

    if (request.temperature != null) body.options = { temperature: request.temperature }
    if (request.maxTokens != null) {
      body.options = { ...body.options, num_predict: request.maxTokens }
    }

    if (request.tools) {
      (body as any).tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      }))
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: request.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      console.error(`[Ollama] API error ${response.status}: ${errorBody}`)
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}${errorBody ? `: ${errorBody}` : ''}`)
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
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line)
            if (data.message?.content) {
              yield { type: 'text', content: data.message.content }
            }
            if (data.message?.tool_calls) {
              for (const tc of data.message.tool_calls) {
                yield {
                  type: 'tool_call',
                  toolCall: {
                    id: tc.id ?? `ollama-${Date.now()}`,
                    name: tc.function?.name ?? '',
                    arguments: typeof tc.function?.arguments === 'string'
                      ? tc.function.arguments
                      : JSON.stringify(tc.function?.arguments ?? {}),
                  },
                }
              }
            }
            if (data.done) {
              yield {
                type: 'done',
                usage: {
                  promptTokens: data.prompt_eval_count ?? 0,
                  completionTokens: data.eval_count ?? 0,
                },
              }
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      }
    } else {
      const data = await response.json()
      if (data.message?.content) {
        yield { type: 'text', content: data.message.content }
      }
      if (data.message?.tool_calls) {
        for (const tc of data.message.tool_calls) {
          yield {
            type: 'tool_call',
            toolCall: {
              id: tc.id ?? `ollama-${Date.now()}`,
              name: tc.function?.name ?? '',
              arguments: typeof tc.function?.arguments === 'string'
                ? tc.function.arguments
                : JSON.stringify(tc.function?.arguments ?? {}),
            },
          }
        }
      }
      yield {
        type: 'done',
        usage: {
          promptTokens: data.prompt_eval_count ?? 0,
          completionTokens: data.eval_count ?? 0,
        },
      }
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`)
      if (!response.ok) return []
      const data = await response.json()
      return (data.models ?? []).map((m: any) => ({
        id: m.name,
        name: m.name,
        provider: 'ollama' as const,
        contextWindow: 4096,
        supportsVision: m.name.includes('vision') || m.name.includes('llava'),
        supportsToolUse: true,
      }))
    } catch {
      return []
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`)
      return response.ok
    } catch {
      return false
    }
  }
}
