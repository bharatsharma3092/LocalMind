import type { LLMProvider, LLMRequest, LLMStreamChunk, ModelInfo } from '../types'
import { mapProviderError } from '../router'
import { getSecret } from '../../settings/secrets'

export class GoogleProvider implements LLMProvider {
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta'

  private async getApiKey(): Promise<string> {
    const key = await getSecret('google-api-key')
    if (!key) throw new Error('No Google API key configured. Add one in Settings → Providers.')
    return key
  }

  async *complete(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const apiKey = await this.getApiKey()
    const streamSuffix = request.stream ? ':streamGenerateContent' : ':generateContent'

    const contents = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'function',
            parts: [{ functionResponse: { name: m.toolCallId ?? '', response: { result: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) } } }],
          }
        }
        const parts: any[] = []
        const textContent = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        if (textContent) parts.push({ text: textContent })
        if (m.toolCalls) {
          for (const tc of m.toolCalls) {
            let args = {}
            try { args = JSON.parse(tc.arguments) } catch {}
            parts.push({ functionCall: { name: tc.name, args } })
          }
        }
        if (parts.length === 0) parts.push({ text: '' })
        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts,
        }
      })

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

if (request.tools && request.tools.length > 0) {
    body.tools = [{
      functionDeclarations: request.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description ?? '',
        parameters: t.function.parameters ?? { type: 'object', properties: {} },
      })),
    }]
  }

    const url = `${this.baseUrl}/models/${request.model}${streamSuffix}?key=${apiKey}`
    console.log(`[Google] Request: ${request.model}, stream=${request.stream}, messages=${contents.length}, tools=${request.tools?.length ?? 0}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: request.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      console.error(`[Google] API error ${response.status}: ${errorBody}`)
      throw new Error(mapProviderError(response.status, 'Google Gemini') + (errorBody ? `: ${errorBody}` : ''))
    }

    if (request.stream && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('[Google] Stream ended')
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          let jsonStr = trimmed
          if (jsonStr.startsWith('data: ')) jsonStr = jsonStr.slice(6)

          try {
            const parsed = JSON.parse(jsonStr)
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
            if (text) {
              console.log(`[Google] Text chunk: "${text.slice(0, 60)}"`)
              yield { type: 'text', content: text }
            }
            const fc = parsed.candidates?.[0]?.content?.parts?.[0]?.functionCall
            if (fc) {
              yield {
                type: 'tool_call',
                toolCall: {
                  id: `google-${Date.now()}`,
                  name: fc.name ?? '',
                  arguments: typeof fc.args === 'string' ? fc.args : JSON.stringify(fc.args ?? {}),
                },
              }
            }
            if (parsed.promptFeedback?.blockReason) {
              console.error(`[Google] Blocked: ${parsed.promptFeedback.blockReason}`)
              yield { type: 'text', content: `[Response blocked: ${parsed.promptFeedback.blockReason}]` }
            }
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
      const fc = data.candidates?.[0]?.content?.parts?.[0]?.functionCall
      if (fc) {
        yield {
          type: 'tool_call',
          toolCall: {
            id: `google-${Date.now()}`,
            name: fc.name ?? '',
            arguments: typeof fc.args === 'string' ? fc.args : JSON.stringify(fc.args ?? {}),
          },
        }
      }
      if (data.promptFeedback?.blockReason) {
        yield { type: 'text', content: `[Response blocked: ${data.promptFeedback.blockReason}]` }
      }
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
