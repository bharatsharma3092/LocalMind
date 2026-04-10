import type { TokenUsage } from './types'

let encoder: any = null

function getEncoder(): any {
  if (!encoder) {
    try {
      const { get_encoding } = require('tiktoken')
      encoder = get_encoding('cl100k_base')
    } catch {
      encoder = null
    }
  }
  return encoder
}

export function countTokens(text: string, _modelId?: string): number {
  try {
    const enc = getEncoder()
    if (enc) return enc.encode(text).length
  } catch {
    // fallback
  }
  return Math.ceil(text.length / 4)
}

export function extractUsage(response: any, provider: string): TokenUsage {
  switch (provider) {
    case 'openai':
    case 'openrouter':
      return {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
      }
    case 'google':
      return {
        promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      }
    case 'ollama':
      return {
        promptTokens: response.prompt_eval_count ?? 0,
        completionTokens: response.eval_count ?? 0,
      }
    default:
      return { promptTokens: 0, completionTokens: 0 }
  }
}
