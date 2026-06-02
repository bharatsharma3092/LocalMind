import type { LLMProvider, LLMRequest, LLMStreamChunk, ModelInfo } from '../types'
import { mapProviderError } from '../router'
import { getSecret } from '../../settings/secrets'
import { appStore } from '../../settings/app-store'
import type { CustomProviderConfig } from '@shared/types/localmind-api'

const log = {
  info:  (msg: string, data?: unknown) => console.log(`[Custom] ${msg}`, data !== undefined ? data : ''),
  warn:  (msg: string, data?: unknown) => console.warn(`[Custom] [WARN] ${msg}`, data !== undefined ? data : ''),
  error: (msg: string, data?: unknown) => console.error(`[Custom] [ERROR] ${msg}`, data !== undefined ? data : ''),
}

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

export class CustomProvider implements LLMProvider {
  private config: CustomProviderConfig | null = null
  private providerId: string | null = null

  constructor(config?: CustomProviderConfig) {
    if (config) {
      this.config = config
      this.providerId = config.id
    }
  }

  private getBaseUrl(): string {
    if (this.config) return this.config.baseUrl
    try {
      return appStore.get('customProviderUrl') ?? 'http://localhost:8080/v1'
    } catch {
      return 'http://localhost:8080/v1'
    }
  }

  private async getApiKey(): Promise<string | null> {
    if (this.providerId) {
      return await getSecret(`custom-provider-${this.providerId}-api-key`)
    }
    return await getSecret('custom-api-key')
  }

  private getApiFormat(): 'openai' | 'anthropic' {
    return this.config?.apiFormat ?? 'openai'
  }

  private buildAnthropicHeaders(apiKey: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    }
    if (apiKey) {
      headers['x-api-key'] = apiKey
    }
    return headers
  }

  private toAnthropicMessages(messages: LLMRequest['messages']): { system?: string; messages: any[] } {
    const systemParts: string[] = []
    const converted: any[] = []

    for (const message of messages) {
      const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)

      if (message.role === 'system') {
        if (content.trim()) systemParts.push(content)
        continue
      }

      if (message.role === 'tool') {
        converted.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: message.toolCallId ?? '',
              content,
            },
          ],
        })
        continue
      }

      if (message.role === 'assistant' && message.toolCalls?.length) {
        const blocks: any[] = []
        if (content.trim()) blocks.push({ type: 'text', text: content })
        for (const toolCall of message.toolCalls) {
          let input: any = {}
          try {
            input = toolCall.arguments ? JSON.parse(toolCall.arguments) : {}
          } catch {
            input = { input: toolCall.arguments }
          }
          blocks.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.name,
            input,
          })
        }
        converted.push({ role: 'assistant', content: blocks })
        continue
      }

      converted.push({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content,
      })
    }

    return {
      system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
      messages: converted,
    }
  }

  private buildAnthropicBody(request: LLMRequest): any {
    const converted = this.toAnthropicMessages(request.messages)
    const body: any = {
      model: request.model,
      messages: converted.messages,
      max_tokens: request.maxTokens ?? 4096,
      stream: request.stream,
    }

    if (converted.system) body.system = converted.system
    if (request.temperature != null) body.temperature = request.temperature
    if (request.tools?.length) {
      body.tools = request.tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      }))
    }

    return body
  }

  private async *completeAnthropic(request: LLMRequest, baseUrl: string, apiKey: string | null): AsyncIterable<LLMStreamChunk> {
    const body = this.buildAnthropicBody(request)
    const fullUrl = `${baseUrl}/messages`

    log.info('Sending Anthropic-compatible request', {
      fullUrl,
      model: request.model,
      stream: request.stream,
      providerId: this.providerId,
    })

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: this.buildAnthropicHeaders(apiKey),
      body: JSON.stringify(body),
      signal: request.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      throw new Error(mapProviderError(response.status, this.config?.name ?? 'Anthropic-compatible Provider') + (errorBody ? `: ${errorBody}` : ''))
    }

    if (request.stream && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const toolBlocks = new Map<number, { id: string; name: string; input: string }>()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const eventText of events) {
          const dataLine = eventText
            .split('\n')
            .map((line) => line.trim())
            .find((line) => line.startsWith('data: '))
          if (!dataLine) continue

          const data = dataLine.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
              toolBlocks.set(parsed.index, {
                id: parsed.content_block.id ?? '',
                name: parsed.content_block.name ?? '',
                input: '',
              })
            }
            if (parsed.type === 'content_block_delta') {
              if (parsed.delta?.type === 'text_delta' && parsed.delta.text) {
                yield { type: 'text', content: parsed.delta.text }
              }
              if (parsed.delta?.type === 'input_json_delta') {
                const block = toolBlocks.get(parsed.index)
                if (block) block.input += parsed.delta.partial_json ?? ''
              }
            }
            if (parsed.type === 'content_block_stop') {
              const block = toolBlocks.get(parsed.index)
              if (block) {
                yield {
                  type: 'tool_call',
                  toolCall: {
                    id: block.id,
                    name: block.name,
                    arguments: block.input || '{}',
                  },
                }
                toolBlocks.delete(parsed.index)
              }
            }
            if (parsed.type === 'message_delta' && parsed.usage) {
              // Usage arrives before message_stop; done is emitted below.
            }
            if (parsed.type === 'message_stop') {
              yield { type: 'done', usage: { promptTokens: 0, completionTokens: 0 } }
            }
          } catch (parseErr: any) {
            log.warn('JSON parse failed for Anthropic SSE event', {
              dataPreview: data.slice(0, 200),
              parseError: parseErr?.message,
            })
          }
        }
      }
    } else {
      const data = await response.json()
      for (const block of data.content ?? []) {
        if (block.type === 'text' && block.text) {
          yield { type: 'text', content: block.text }
        }
        if (block.type === 'tool_use') {
          yield {
            type: 'tool_call',
            toolCall: {
              id: block.id ?? '',
              name: block.name ?? '',
              arguments: JSON.stringify(block.input ?? {}),
            },
          }
        }
      }
      yield {
        type: 'done',
        usage: {
          promptTokens: data.usage?.input_tokens ?? 0,
          completionTokens: data.usage?.output_tokens ?? 0,
        },
      }
    }
  }

  async *complete(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const baseUrl = this.getBaseUrl()
    const apiKey = await this.getApiKey()

    if (this.getApiFormat() === 'anthropic') {
      yield* this.completeAnthropic(request, baseUrl, apiKey)
      return
    }

    log.info('Building request', {
      model: request.model,
      stream: request.stream,
      baseUrl,
      hasApiKey: !!apiKey,
      messageCount: request.messages.length,
      providerId: this.providerId,
    })

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

    const fullUrl = `${baseUrl}/chat/completions`
    log.info('Sending fetch request', { fullUrl, bodyKeys: Object.keys(body) })

    let response: Response
    try {
      response = await fetch(fullUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: request.signal,
      })
    } catch (err: any) {
      log.error('fetch() threw an exception', {
        error: err?.message,
        name: err?.name,
        cause: String(err?.cause),
      })
      throw err
    }

    log.info('Response received', {
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type'),
      hasBody: !!response.body,
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      log.error('API returned non-OK status', {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorBody.slice(0, 500),
      })
      throw new Error(mapProviderError(response.status, this.config?.name ?? 'Custom Provider') + (errorBody ? `: ${errorBody}` : ''))
    }

    if (request.stream && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let readChunkIndex = 0
      let textChunksYielded = 0

      log.info('Starting stream read loop')

      while (true) {
        let readResult: ReadableStreamDefaultReadResult<Uint8Array>
        try {
          readResult = await reader.read()
        } catch (err: any) {
          log.error('reader.read() threw', { error: err?.message })
          break
        }

        const { done, value } = readResult
        if (done) {
          log.info('Stream reader done', { readChunkIndex, textChunksYielded })
          break
        }

        const rawText = decoder.decode(value, { stream: true })
        buffer += rawText
        readChunkIndex++

        if (readChunkIndex <= 3 || readChunkIndex % 20 === 0) {
          log.info(`Raw chunk #${readChunkIndex}`, {
            byteLength: value?.length ?? 0,
            decodedPreview: rawText.slice(0, 200),
          })
        }

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            log.info('Received [DONE] marker — yielding done')
            yield { type: 'done', usage: { promptTokens: 0, completionTokens: 0 } }
            continue
          }
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta
            if (delta?.content) {
              textChunksYielded++
              if (textChunksYielded <= 3 || textChunksYielded % 20 === 0) {
                log.info(`Yielding text chunk #${textChunksYielded}`, {
                  contentPreview: delta.content.slice(0, 80),
                })
              }
              yield { type: 'text', content: delta.content }
            }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                log.info('Yielding tool_call chunk', { name: tc.function?.name })
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
          } catch (parseErr: any) {
            log.warn('JSON parse failed for SSE data line', {
              linePreview: data.slice(0, 200),
              parseError: parseErr?.message,
            })
          }
        }
      }

      log.info('Stream complete', { readChunkIndex, textChunksYielded })
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
    if (this.config && this.config.models.length > 0) {
      return this.config.models.map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        provider: 'custom' as const,
        customProviderId: this.config!.id,
        contextWindow: extractContextWindow(m.id, m.contextWindow),
        supportsVision: false,
        supportsToolUse: true,
      }))
    }
    try {
      const baseUrl = this.getBaseUrl()
      const apiKey = await this.getApiKey()
      const headers: Record<string, string> = this.getApiFormat() === 'anthropic'
        ? this.buildAnthropicHeaders(apiKey)
        : {}
      if (this.getApiFormat() !== 'anthropic' && apiKey) headers['Authorization'] = `Bearer ${apiKey}`

      const response = await fetch(`${baseUrl}/models`, { headers })
      if (!response.ok) return []
      const data = await response.json()
      return (data.data ?? []).map((m: any) => {
        const rawCtx = m.context_length ?? 
                       m.context_window ?? 
                       m.max_model_len ?? 
                       m.max_position_embeddings ?? 
                       m.metadata?.context_length ?? 
                       m.metadata?.context_window ?? 
                       m.metadata?.max_model_len;
        const contextWindow = extractContextWindow(m.id, rawCtx);
        return {
          id: m.id,
          name: m.id,
          provider: 'custom' as const,
          customProviderId: this.providerId ?? undefined,
          contextWindow,
          supportsVision: false,
          supportsToolUse: true,
        }
      })
    } catch {
      return []
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      const baseUrl = this.getBaseUrl()
      const apiKey = await this.getApiKey()
      const headers = this.getApiFormat() === 'anthropic'
        ? this.buildAnthropicHeaders(apiKey)
        : apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined
      const response = await fetch(`${baseUrl}/models`, { headers })
      return response.ok
    } catch {
      return false
    }
  }
}

export function getCustomProvidersFromSettings(): CustomProviderConfig[] {
  try {
    const providers = appStore.get('customProviders')
    if (Array.isArray(providers)) return providers
  } catch {}
  try {
    const legacyUrl = appStore.get('customProviderUrl')
    const legacyModels = appStore.get('customModels')
    if (legacyUrl || (Array.isArray(legacyModels) && legacyModels.length > 0)) {
      return [{
        id: 'legacy',
        name: 'Custom Provider',
        baseUrl: legacyUrl ?? 'http://localhost:8080/v1',
        apiFormat: 'openai',
        models: Array.isArray(legacyModels) ? legacyModels : [],
      }]
    }
  } catch {}
  return []
}
