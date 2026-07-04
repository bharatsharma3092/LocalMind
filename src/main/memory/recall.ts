import type { MemoryRecord, RecallMode, RecallResult } from '@shared/types/ai-os'

/**
 * Pure ranking functions for the Memory Layer.
 * Kept free of Electron/DB imports so they can be unit/property-tested directly.
 */

export const DEFAULT_RECALL_LIMIT = 5
export const MIN_RECALL_LIMIT = 1
export const MAX_RECALL_LIMIT = 50

/** Cosine similarity between two equal-length numeric vectors. Returns 0 for degenerate input. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  if (magA === 0 || magB === 0) return 0
  const sim = dot / (Math.sqrt(magA) * Math.sqrt(magB))
  // Clamp floating point drift into [-1, 1]
  return Math.max(-1, Math.min(1, sim))
}

/** Tokenize text the same way the legacy lexical recall did (token-overlap). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.\-!?;:()]+/)
    .filter((t) => t.length > 2)
}

/**
 * Lexical token-overlap score in [0, 1]: fraction of memory tokens overlapping query tokens.
 * Ported from the original AgentRuntime.queryLexicalMemory implementation.
 */
export function lexicalScore(query: string, content: string): number {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return 0
  const memTokens = content.toLowerCase().split(/[\s,.\-!?;:()]+/)
  if (memTokens.length === 0) return 0
  const querySet = new Set(queryTokens)
  let overlap = 0
  for (const token of memTokens) {
    if (querySet.has(token)) overlap++
  }
  return overlap / Math.max(1, memTokens.length)
}

/** Normalize a cosine similarity from [-1, 1] into [0, 1] so it combines cleanly with lexical scores. */
export function normalizeSemantic(sim: number): number {
  return (sim + 1) / 2
}

export interface ScoredCandidate {
  record: MemoryRecord
  semantic: number | null // normalized [0,1] when available
  lexical: number // [0,1]
}

/**
 * Combine semantic + lexical signals into a single score and pick the reported mode.
 * - both present → hybrid (weighted blend favoring semantic)
 * - only semantic → semantic
 * - only lexical → lexical
 */
export function combineScore(c: ScoredCandidate): { score: number; mode: RecallMode } {
  const hasSemantic = c.semantic !== null
  if (hasSemantic) {
    const semantic = c.semantic as number
    if (c.lexical > 0) {
      return { score: 0.7 * semantic + 0.3 * c.lexical, mode: 'hybrid' }
    }
    return { score: semantic, mode: 'semantic' }
  }
  return { score: c.lexical, mode: 'lexical' }
}

/** Clamp a requested limit into the valid range, defaulting when undefined. */
export function clampLimit(limit?: number): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_RECALL_LIMIT
  return Math.max(MIN_RECALL_LIMIT, Math.min(MAX_RECALL_LIMIT, Math.floor(limit)))
}

/**
 * Rank scored candidates and return the top results.
 * - Excludes disabled records (Property 1).
 * - Excludes zero-score (non-matching) candidates so empty queries yield an empty list.
 * - Sorts by descending score; ties broken by most-recent createdAt first (Property 3).
 * - Truncates to clamp(limit) (Property 2).
 */
export function rankAndLimit(candidates: ScoredCandidate[], limit?: number): RecallResult[] {
  const max = clampLimit(limit)
  const results: RecallResult[] = []
  for (const c of candidates) {
    if (!c.record.enabled) continue
    const { score, mode } = combineScore(c)
    if (score <= 0) continue
    results.push({ record: c.record, score, mode })
  }
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.record.createdAt - a.record.createdAt
  })
  return results.slice(0, max)
}
