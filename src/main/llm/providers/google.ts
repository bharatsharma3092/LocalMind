import type { LLMProvider, LLMRequest, LLMStreamChunk, ModelInfo } from '../types'
import { mapProviderError } from '../router'
import { getSecret } from '../../settings/secrets'

const log = {
  info:  (msg: string, data?: unknown) => console.log(`[Google] ${msg}`, data !== undefined ? data : ''),
  warn:  (msg: string, data?: unknown) => console.warn(`[Google] [WARN] ${msg}`, data !== undefined ? data : ''),
  error: (msg: string, data?: unknown) => console.error(`[Google] [ERROR] ${msg}`, data !== undefined ? data : ''),
}

export class GoogleProvider implements LLMProvider {
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta'

  private async getApiKey(): Promise<string> {
    const key = await getSecret('google-api-key')
    if (!key) throw new Error('No Google API key configured. Add one in Settings → Providers.')
    log.info('API key retrieved', { keyLength: key.length })
    return key
  }

  async *complete(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const apiKey = await this.getApiKey()
    const streamSuffix = request.stream ? ':streamGenerateContent?alt=sse' : ':generateContent'

    log.info('Building request body', {
      model: request.model,
      stream: request.stream,
      messageCount: request.messages.length,
      toolCount: request.tools?.length ?? 0,
    })

    const rawContents = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (m.role === 'tool') {
          let parsedResponse: any
          try {
            parsedResponse = typeof m.content === 'string' ? JSON.parse(m.content) : m.content
            if (typeof parsedResponse !== 'object' || parsedResponse === null) {
              parsedResponse = { result: parsedResponse }
            }
          } catch {
            parsedResponse = { result: m.content }
          }
          return {
            role: 'function',
            parts: [{ functionResponse: { name: m.toolCallId ?? '', response: parsedResponse } }],
          }
        }
        const parts: any[] = []
        if (typeof m.content === 'string') {
          if (m.content) parts.push({ text: m.content })
        } else if (Array.isArray(m.content)) {
          for (const block of m.content) {
            if (block.type === 'text' && block.text) {
              parts.push({ text: block.text })
            } else if (block.type === 'image_url' && block.imageUrl?.url) {
              const match = block.imageUrl.url.match(/^data:(image\/[a-zA-Z0-9+-]+);base64,(.+)$/)
              if (match) {
                parts.push({ inlineData: { mimeType: match[1], data: match[2] } })
              }
            }
          }
        }
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

    const contents: any[] = []
    for (const msg of rawContents) {
      if (contents.length > 0 && contents[contents.length - 1].role === msg.role) {
        contents[contents.length - 1].parts.push(...msg.parts)
      } else {
        contents.push(msg)
      }
    }

    const systemMessage = request.messages.find((m) => m.role === 'system')

    const body: any = {
      contents,
      generationConfig: {
        ...(request.temperature != null && { temperature: request.temperature }),
        ...(request.maxTokens != null && { maxOutputTokens: request.maxTokens }),
      },
    }

    if (systemMessage) {
      let text = ''
      if (typeof systemMessage.content === 'string') {
        text = systemMessage.content
      } else if (Array.isArray(systemMessage.content)) {
        text = systemMessage.content.map(b => b.text || '').join('\n')
      }
      
      if (text) {
        if (request.model.toLowerCase().includes('gemma')) {
          if (contents.length > 0 && contents[0].role === 'user') {
            contents[0].parts.unshift({ text: `System Instruction:\n${text}\n\n` })
          } else {
            contents.unshift({ role: 'user', parts: [{ text: `System Instruction:\n${text}\n\n` }] })
          }
        } else {
          body.systemInstruction = {
            parts: [{ text }],
          }
        }
      }
    }

    if (request.tools && request.tools.length > 0) {
      const fixSchemaTypes = (schema: any): any => {
        if (!schema || typeof schema !== 'object') return schema;
        if (Array.isArray(schema)) return schema.map(fixSchemaTypes);
        const result: any = {};
        for (const [k, v] of Object.entries(schema)) {
          if (k === 'type' && typeof v === 'string') {
            result[k] = v.toUpperCase();
          } else {
            result[k] = fixSchemaTypes(v);
          }
        }
        return result;
      };

      body.tools = [{
        functionDeclarations: request.tools.map((t) => ({
          name: t.function.name,
          description: t.function.description ?? '',
          parameters: fixSchemaTypes(t.function.parameters ?? { type: 'object', properties: {} }),
        })),
      }]
    }

    const separator = streamSuffix.includes('?') ? '&' : '?'
    const fullUrl = `${this.baseUrl}/models/${request.model}${streamSuffix}${separator}key=${apiKey}`
    log.info('Sending fetch request', {
      model: request.model,
      stream: request.stream,
      contentsCount: contents.length,
      hasTools: !!(request.tools?.length),
      bodyKeys: Object.keys(body),
      urlPath: fullUrl.split('?')[0],
    })

    let response: Response
    try {
      response = await fetch(fullUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      throw new Error(mapProviderError(response.status, 'Google Gemini') + (errorBody ? `: ${errorBody}` : ''))
    }

    if (request.stream && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let chunkIndex = 0
      let textChunksYielded = 0
      let doneYielded = false

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
          log.info('Stream reader done', { chunkIndex, textChunksYielded, doneYielded })
          break
        }

        const rawText = decoder.decode(value, { stream: true })
        buffer += rawText
        chunkIndex++

        if (chunkIndex <= 3 || chunkIndex % 20 === 0) {
          log.info(`Raw chunk #${chunkIndex}`, {
            byteLength: value?.length ?? 0,
            decodedLength: rawText.length,
            decodedPreview: rawText.slice(0, 200),
            bufferLength: buffer.length,
          })
        }

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          let jsonStr = trimmed
          if (jsonStr.startsWith('data: ')) {
            jsonStr = jsonStr.slice(6)
          } else if (jsonStr.startsWith('data:')) {
            jsonStr = jsonStr.slice(5).trim()
          }

          if (!jsonStr || jsonStr === '[DONE]') {
            log.info('Received [DONE] marker')
            continue
          }

          let parsed: any
          try {
            parsed = JSON.parse(jsonStr)
          } catch (parseErr: any) {
            log.warn('JSON parse failed for line', {
              linePreview: trimmed.slice(0, 200),
              parseError: parseErr?.message,
            })
            continue
          }

          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) {
            textChunksYielded++
            if (textChunksYielded <= 3 || textChunksYielded % 20 === 0) {
              log.info(`Yielding text chunk #${textChunksYielded}`, {
                textPreview: text.slice(0, 80),
                textLength: text.length,
              })
            }
            yield { type: 'text', content: text }
          }

          const fc = parsed.candidates?.[0]?.content?.parts?.[0]?.functionCall
          if (fc) {
            log.info('Yielding function call chunk', { name: fc.name })
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
            log.error('Response blocked by safety', { blockReason: parsed.promptFeedback.blockReason })
            yield { type: 'text', content: `[Response blocked: ${parsed.promptFeedback.blockReason}]` }
          }

          if (parsed.usageMetadata) {
            const isFinalChunk = parsed.candidates?.[0]?.finishReason != null
            log.info('usageMetadata present', {
              isFinalChunk,
              finishReason: parsed.candidates?.[0]?.finishReason,
              promptTokens: parsed.usageMetadata.promptTokenCount,
              completionTokens: parsed.usageMetadata.candidatesTokenCount,
            })
            if (isFinalChunk && !doneYielded) {
              doneYielded = true
              log.info('Yielding done chunk (final)')
              yield {
                type: 'done',
                usage: {
                  promptTokens: parsed.usageMetadata.promptTokenCount ?? 0,
                  completionTokens: parsed.usageMetadata.candidatesTokenCount ?? 0,
                },
              }
            }
          }
        }
      }

      if (!doneYielded) {
        log.warn('Stream ended without done chunk — yielding done now', { chunkIndex, textChunksYielded })
        yield {
          type: 'done',
          usage: { promptTokens: 0, completionTokens: 0 },
        }
      }

      log.info('Stream complete', { totalReadChunks: chunkIndex, textChunksYielded, doneYielded })
    } else {
      log.info('Non-streaming response path')
      const data = await response.json()
      log.info('Non-streaming parsed', {
        hasCandidates: !!data.candidates?.length,
        finishReason: data.candidates?.[0]?.finishReason,
      })
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) {
        log.info('Yielding text', { textLength: text.length, preview: text.slice(0, 100) })
        yield { type: 'text', content: text }
      }
      const fc = data.candidates?.[0]?.content?.parts?.[0]?.functionCall
      if (fc) {
        log.info('Yielding function call', { name: fc.name })
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
