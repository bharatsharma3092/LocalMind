import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  cosineSimilarity,
  lexicalScore,
  clampLimit,
  rankAndLimit,
  combineScore,
  MIN_RECALL_LIMIT,
  MAX_RECALL_LIMIT,
  DEFAULT_RECALL_LIMIT,
  type ScoredCandidate,
} from './recall'
import type { MemoryRecord } from '@shared/types/ai-os'

function makeRecord(over: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: Math.random().toString(36).slice(2),
    kind: 'semantic',
    content: 'hello world',
    importanceScore: 0.5,
    sourceConversationId: null,
    enabled: true,
    embeddingModel: null,
    embeddingStatus: 'absent',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
  })
  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
  })
  it('returns 0 for degenerate input', () => {
    expect(cosineSimilarity([], [])).toBe(0)
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0)
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
  })
})

describe('lexicalScore', () => {
  it('scores token overlap', () => {
    expect(lexicalScore('the quick brown fox', 'quick fox')).toBeGreaterThan(0)
  })
  it('is 0 with no overlap', () => {
    expect(lexicalScore('alpha beta', 'gamma delta')).toBe(0)
  })
  it('is 0 for empty query', () => {
    expect(lexicalScore('', 'anything here')).toBe(0)
  })
})

describe('clampLimit', () => {
  it('defaults when undefined', () => {
    expect(clampLimit(undefined)).toBe(DEFAULT_RECALL_LIMIT)
  })
  it('clamps to range', () => {
    expect(clampLimit(0)).toBe(MIN_RECALL_LIMIT)
    expect(clampLimit(1000)).toBe(MAX_RECALL_LIMIT)
  })
})

describe('rankAndLimit — Correctness Properties', () => {
  // Property 1: disabled records never appear
  it('Property 1: excludes disabled records', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            enabled: fc.boolean(),
            lexical: fc.double({ min: 0, max: 1, noNaN: true }),
            createdAt: fc.integer({ min: 0, max: 1_000_000 }),
          }),
          { maxLength: 60 }
        ),
        (rows) => {
          const candidates: ScoredCandidate[] = rows.map((r) => ({
            record: makeRecord({ enabled: r.enabled, createdAt: r.createdAt }),
            semantic: null,
            lexical: r.lexical,
          }))
          const results = rankAndLimit(candidates, 50)
          return results.every((res) => res.record.enabled === true)
        }
      )
    )
  })

  // Property 2: result size never exceeds clamp(limit)
  it('Property 2: respects clamped limit', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.01, max: 1, noNaN: true }), { maxLength: 80 }),
        fc.integer({ min: -5, max: 100 }),
        (scores, limit) => {
          const candidates: ScoredCandidate[] = scores.map((s) => ({
            record: makeRecord({ enabled: true }),
            semantic: null,
            lexical: s,
          }))
          const results = rankAndLimit(candidates, limit)
          return results.length <= clampLimit(limit)
        }
      )
    )
  })

  // Property 3: ordering by descending score, ties broken by recent createdAt
  it('Property 3: sorts by descending score then recency', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            lexical: fc.double({ min: 0.01, max: 1, noNaN: true }),
            createdAt: fc.integer({ min: 0, max: 1000 }),
          }),
          { maxLength: 60 }
        ),
        (rows) => {
          const candidates: ScoredCandidate[] = rows.map((r) => ({
            record: makeRecord({ enabled: true, createdAt: r.createdAt }),
            semantic: null,
            lexical: r.lexical,
          }))
          const results = rankAndLimit(candidates, 50)
          for (let i = 1; i < results.length; i++) {
            const prev = results[i - 1]
            const cur = results[i]
            if (prev.score < cur.score) return false
            if (prev.score === cur.score && prev.record.createdAt < cur.record.createdAt) return false
          }
          return true
        }
      )
    )
  })

  // Property 4: lexical-only path never throws and returns a valid list
  it('Property 4: lexical fallback totality', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 40 }), (scores) => {
        const candidates: ScoredCandidate[] = scores.map((s) => ({
          record: makeRecord({ enabled: true }),
          semantic: null,
          lexical: s,
        }))
        const results = rankAndLimit(candidates)
        return Array.isArray(results) && results.every((r) => r.mode === 'lexical')
      })
    )
  })

  it('returns empty list for all-zero scores (no false matches)', () => {
    const candidates: ScoredCandidate[] = [
      { record: makeRecord({ enabled: true }), semantic: null, lexical: 0 },
    ]
    expect(rankAndLimit(candidates)).toEqual([])
  })
})

describe('combineScore', () => {
  it('reports hybrid when both signals present', () => {
    expect(combineScore({ record: makeRecord(), semantic: 0.8, lexical: 0.5 }).mode).toBe('hybrid')
  })
  it('reports semantic when only embedding present', () => {
    expect(combineScore({ record: makeRecord(), semantic: 0.8, lexical: 0 }).mode).toBe('semantic')
  })
  it('reports lexical when no embedding', () => {
    expect(combineScore({ record: makeRecord(), semantic: null, lexical: 0.4 }).mode).toBe('lexical')
  })
})
