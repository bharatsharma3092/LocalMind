import type { LLMProvider, LLMRequest, LLMStreamChunk, ModelInfo } from '../types'
import { mapProviderError } from '../router'
import { getSecret } from '../../settings/secrets'
import { appStore } from '../../settings/app-store'

/**
 * Cloudflare Workers AI provider.
 * Uses Cloudflare's OpenAI-compatible endpoint:
 *   https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1/chat/completions
 * Auth: Bearer <API token>. Models are user-configured (manual list).
 */
export class CloudflareProvider implements LLMProvider {
  private getAccountId(): string {
    const id = (appStore.get('cloudflareAccountId' as any) as string | undefined)?.trim()
    if (!id) throw new Error('No Cloudflare Account ID configured. Add it in Settings → Models.')
    return id
  }

  private async getApiKey(): Promise<string> {
    const key = await getSecret('cloudflare-api-key')
    if (!key) throw new Error('No Cloudflare API token configured. Add one in Settings → Models.')
    return key
  }

  private baseUrl(accountId: string): string {
    return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai`
  }

  async *complete(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const accountId = this.getAccountId()
    const apiKey = await this.getApiKey()

    const body: any = {
      messages: request.messages.map((m) => {
        const msg: any = {
          role: m.role,
          content: typeof m.content === 'string' ? m.content : '',
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
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      }))
    }

    // Native Workers AI run endpoint: /accounts/{id}/ai/run/{model}
    // The model id (e.g. @cf/meta/llama-3-8b-instruct) is used literally in the path.
    const response = await fetch(`${this.baseUrl(accountId)}/run/${request.model}`, {
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
      throw new Error(mapProviderError(response.status, 'Cloudflare') + (errorText ? `: ${errorText}` : ''))
    }

    const emitToolCalls = function* (toolCalls: any[]): Generator<LLMStreamChunk> {
      for (const tc of toolCalls ?? []) {
        const fn = tc.function ?? tc
        yield {
          type: 'tool_call',
          toolCall: {
            id: tc.id ?? `cf-${Date.now()}`,
            name: fn.name ?? '',
            arguments: typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? tc.arguments ?? {}),
          },
        }
      }
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
          if (!trimmed || !trimmed.startsWith('data:')) continue
          const data = trimmed.replace(/^data:\s*/, '')
          if (data === '[DONE]') {
            yield { type: 'done', usage: { promptTokens: 0, completionTokens: 0 } }
            continue
          }
          try {
            const parsed = JSON.parse(data)
            // Native streaming emits { response: "<chunk>" }
            if (typeof parsed.response === 'string' && parsed.response) {
              yield { type: 'text', content: parsed.response }
            }
            if (Array.isArray(parsed.tool_calls)) {
              yield* emitToolCalls(parsed.tool_calls)
            }
            if (parsed.usage) {
              yield {
                type: 'done',
                usage: {
                  promptTokens: parsed.usage.prompt_tokens ?? 0,
                  completionTokens: parsed.usage.completion_tokens ?? 0,
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
      // Native non-streaming shape: { result: { response, tool_calls? }, success, errors }
      const result = data.result ?? data
      if (typeof result.response === 'string' && result.response) {
        yield { type: 'text', content: result.response }
      }
      if (Array.isArray(result.tool_calls)) {
        yield* emitToolCalls(result.tool_calls)
      }
      yield {
        type: 'done',
        usage: {
          promptTokens: result.usage?.prompt_tokens ?? 0,
          completionTokens: result.usage?.completion_tokens ?? 0,
        },
      }
    }
  }

  /** Cloudflare models are user-configured (manual list) and read from settings. */
  async listModels(): Promise<ModelInfo[]> {
    const models = (appStore.get('cloudflareModels' as any) as { id: string; name?: string; contextWindow?: number }[] | undefined) ?? []
    return models
      .filter((m) => m?.id?.trim())
      .map((m) => ({
        id: m.id,
        name: m.name?.trim() || m.id,
        provider: 'cloudflare' as const,
        contextWindow: m.contextWindow ?? 8192,
        supportsVision: false,
        supportsToolUse: true,
      }))
  }

  async validateConfig(): Promise<boolean> {
    try {
      this.getAccountId()
      await this.getApiKey()
      return true
    } catch {
      return false
    }
  }
}
