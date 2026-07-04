import { v4 as uuid } from 'uuid'
import type { MemoryRecord } from '@shared/types/ai-os'

/**
 * One-time migration of legacy App_Store memories into the Memory_Layer
 * (`memories` table). Designed to be idempotent and resumable: items already
 * present (matched by normalized content + source) are skipped, so running it
 * any number of times produces the same set with no duplicates.
 */

export interface LegacyLongTermMemory {
  content: string
  source?: string
  enabled?: boolean
}

export interface LegacyShortTermMemory {
  content: string
  sourceConversationId?: string
}

export interface MigrationSource {
  longTerm: LegacyLongTermMemory[]
  shortTerm: LegacyShortTermMemory[]
}

/** Normalized dedupe key: collapses whitespace and lowercases content. */
export function dedupeKey(content: string): string {
  return content.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Pure planner: given the legacy source and the set of dedupe keys already
 * present in the Memory_Layer, returns the new MemoryRecords to insert.
 * Deterministic and side-effect-free for property testing.
 */
export function planMigration(source: MigrationSource, existingKeys: Set<string>, now = Date.now()): MemoryRecord[] {
  const planned: MemoryRecord[] = []
  const seen = new Set(existingKeys)

  const consider = (content: string, kind: string, enabled: boolean, sourceConversationId: string | null) => {
    const cleaned = content?.trim()
    if (!cleaned) return
    const key = dedupeKey(cleaned)
    if (seen.has(key)) return
    seen.add(key)
    planned.push({
      id: uuid(),
      kind,
      content: cleaned,
      importanceScore: 0.5,
      sourceConversationId,
      enabled,
      embeddingModel: null,
      embeddingStatus: 'absent',
      createdAt: now,
      updatedAt: now,
    })
  }

  for (const m of source.longTerm ?? []) {
    consider(m.content, 'semantic', m.enabled ?? true, null)
  }
  for (const m of source.shortTerm ?? []) {
    consider(m.content, 'summary', true, m.sourceConversationId ?? null)
  }

  return planned
}
