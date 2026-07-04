import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { planMigration, dedupeKey, type MigrationSource } from './migration'

describe('dedupeKey', () => {
  it('normalizes whitespace and case', () => {
    expect(dedupeKey('  Hello   World ')).toBe('hello world')
    expect(dedupeKey('Hello World')).toBe(dedupeKey('hello   world'))
  })
})

describe('planMigration', () => {
  it('migrates long-term and short-term memories', () => {
    const source: MigrationSource = {
      longTerm: [{ content: 'I prefer camelCase' }, { content: 'Lives in Berlin', enabled: false }],
      shortTerm: [{ content: 'Asked about the build', sourceConversationId: 'c1' }],
    }
    const planned = planMigration(source, new Set())
    expect(planned).toHaveLength(3)
    expect(planned.find((p) => p.content === 'Lives in Berlin')?.enabled).toBe(false)
    expect(planned.find((p) => p.content === 'Asked about the build')?.sourceConversationId).toBe('c1')
  })

  it('skips items already present by dedupe key', () => {
    const source: MigrationSource = { longTerm: [{ content: 'Already here' }], shortTerm: [] }
    const existing = new Set([dedupeKey('already HERE')])
    expect(planMigration(source, existing)).toHaveLength(0)
  })

  it('ignores blank content', () => {
    const source: MigrationSource = { longTerm: [{ content: '   ' }], shortTerm: [{ content: '' }] }
    expect(planMigration(source, new Set())).toHaveLength(0)
  })

  // Property 5: migration idempotency — running N>=1 times yields the same set, no duplicates.
  it('Property 5: idempotent across repeated runs', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { maxLength: 30 }),
        fc.array(fc.string(), { maxLength: 30 }),
        fc.integer({ min: 1, max: 4 }),
        (longTermContents, shortTermContents, runs) => {
          const source: MigrationSource = {
            longTerm: longTermContents.map((content) => ({ content })),
            shortTerm: shortTermContents.map((content) => ({ content })),
          }

          // Simulate applying the migration `runs` times against a persistent store.
          const stored = new Map<string, string>() // key -> id
          for (let i = 0; i < runs; i++) {
            const existingKeys = new Set(stored.keys())
            const planned = planMigration(source, existingKeys)
            for (const rec of planned) {
              const key = dedupeKey(rec.content)
              // planner must never emit a key that already exists
              if (stored.has(key)) return false
              stored.set(key, rec.id)
            }
          }

          // Expected unique set = distinct non-blank dedupe keys across both sources.
          const expected = new Set<string>()
          for (const c of [...longTermContents, ...shortTermContents]) {
            if (c.trim()) expected.add(dedupeKey(c))
          }
          return stored.size === expected.size
        }
      )
    )
  })
})
