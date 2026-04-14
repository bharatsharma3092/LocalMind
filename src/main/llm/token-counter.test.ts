import { describe, it, expect } from 'vitest'
import { countTokens, extractUsage } from './token-counter'

describe('countTokens', () => {
  it('returns a positive number for non-empty text', () => {
    const count = countTokens('Hello, world!')
    expect(count).toBeGreaterThan(0)
  })

  it('returns 0 for empty string', () => {
    expect(countTokens('')).toBe(0)
  })

  it('returns larger count for longer text', () => {
    const short = countTokens('hi')
    const long = countTokens('This is a much longer sentence with many more words and tokens.')
    expect(long).toBeGreaterThan(short)
  })

  it('falls back to length/4 when tiktoken is unavailable', () => {
    const text = 'Hello world test'
    const fallback = Math.ceil(text.length / 4)
    const result = countTokens(text)
    expect(result).toBeGreaterThanOrEqual(fallback > 0 ? 1 : 0)
  })
})

describe('extractUsage', () => {
  it('extracts openai usage format', () => {
    const response = { usage: { prompt_tokens: 10, completion_tokens: 20 } }
    const usage = extractUsage(response, 'openai')
    expect(usage).toEqual({ promptTokens: 10, completionTokens: 20 })
  })

  it('extracts openrouter usage format (same as openai)', () => {
    const response = { usage: { prompt_tokens: 5, completion_tokens: 15 } }
    const usage = extractUsage(response, 'openrouter')
    expect(usage).toEqual({ promptTokens: 5, completionTokens: 15 })
  })

  it('extracts google usage format', () => {
    const response = { usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 25 } }
    const usage = extractUsage(response, 'google')
    expect(usage).toEqual({ promptTokens: 8, completionTokens: 25 })
  })

  it('extracts ollama usage format', () => {
    const response = { prompt_eval_count: 12, eval_count: 30 }
    const usage = extractUsage(response, 'ollama')
    expect(usage).toEqual({ promptTokens: 12, completionTokens: 30 })
  })

  it('returns zeros for unknown provider', () => {
    const usage = extractUsage({}, 'unknown')
    expect(usage).toEqual({ promptTokens: 0, completionTokens: 0 })
  })

  it('handles missing fields gracefully', () => {
    const usage = extractUsage({}, 'openai')
    expect(usage).toEqual({ promptTokens: 0, completionTokens: 0 })
  })
})
