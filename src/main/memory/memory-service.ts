import { v4 as uuid } from 'uuid'
import { eq } from 'drizzle-orm'
import { db, persistDatabase } from '../db/connection'
import { memories } from '../db/schema'
import { appStore } from '../settings/app-store'
import type { MemoryRecord, RecallOptions, RecallResult } from '@shared/types/ai-os'
import {
  lexicalScore,
  cosineSimilarity,
  normalizeSemantic,
  rankAndLimit,
  clampLimit,
  type ScoredCandidate,
} from './recall'
import { resolveEmbeddingProvider, type EmbeddingProvider } from './embedding-provider'
import { VectorStore } from './vector-store'
import { EmbeddingQueue, type EmbeddingJob } from './embedding-queue'
import { planMigration, dedupeKey, type MigrationSource } from './migration'

const MAX_CONTENT_LENGTH = 10_000
const DEFAULT_RECALL_TIMEOUT_MS = 2_000
const WRITE_TIMEOUT_MS = 5_000

export class MemoryNotFoundError extends Error {
  constructor(id: string) {
    super(`Memory record not found: ${id}`)
    this.name = 'MemoryNotFoundError'
  }
}

export class MemoryValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MemoryValidationError'
  }
}

function rowToRecord(row: typeof memories.$inferSelect): MemoryRecord {
  return {
    id: row.id,
    kind: row.kind,
    content: row.content,
    importanceScore: row.importanceScore ?? 0.5,
    sourceConversationId: row.sourceConversationId ?? null,
    enabled: row.enabled ?? true,
    embeddingModel: row.embeddingModel ?? null,
    embeddingStatus: (row.embeddingStatus as MemoryRecord['embeddingStatus']) ?? 'absent',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: NodeJS.Timeout
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

/**
 * Persistent cross-session memory layer. Extends the existing `memories` table
 * with embedding-backed semantic recall, keeping lexical recall as the fallback.
 */
export class MemoryService {
  private vectorStore = new VectorStore()
  private queue: EmbeddingQueue
  private provider: EmbeddingProvider | null = null
  private vectorReady = false

  constructor() {
    this.queue = new EmbeddingQueue((job) => this.processEmbedding(job))
  }

  async init(): Promise<void> {
    // Open the vector index (fault-isolated: failure leaves us lexical-only).
    try {
      await this.vectorStore.init()
      this.vectorReady = true
    } catch (err) {
      console.error('[MemoryService] Vector store unavailable, using lexical-only recall:', err)
      this.vectorReady = false
    }

    this.provider = await resolveEmbeddingProvider()

    await this.runMigrationOnce()

    // Backfill embeddings for records lacking them (Req 2.6).
    if (this.vectorReady && this.provider) {
      try {
        const pending = await db
          .select()
          .from(memories)
          .where(eq(memories.embeddingStatus, 'absent'))
          .all()
        for (const row of pending) {
          if (row.enabled) this.queue.enqueue({ id: row.id, content: row.content })
        }
      } catch (err) {
        console.error('[MemoryService] Embedding backfill scan failed:', err)
      }
    }
  }

  private async runMigrationOnce(): Promise<void> {
    try {
      // Check if migration already ran AND there are actually records in the DB.
      // If the flag is set but the table is empty, re-run so legacy memories are not lost.
      const alreadyMigrated = appStore.get('memoryLayerMigrated' as any)
      if (alreadyMigrated) {
        const existing = await db.select().from(memories).all()
        if (existing.length > 0) return  // migrated and has data — skip
        // Flag was set but table is empty (e.g. first run with new code) — re-migrate
        console.log('[MemoryService] Migration flag set but table empty — re-running migration.')
      }

      const longTerm = ((appStore.get('memories') as any[]) ?? []).map((m) => ({
        content: m?.content ?? '',
        source: m?.source,
        enabled: m?.enabled ?? true,
      }))
      const shortTerm = ((appStore.get('shortTermMemories' as any) as any[]) ?? []).map((m) => ({
        content: m?.content ?? '',
        sourceConversationId: m?.sourceConversationId,
      }))
      const source: MigrationSource = { longTerm, shortTerm }

      const existing = await db.select().from(memories).all()
      const existingKeys = new Set(existing.map((r) => dedupeKey(r.content)))
      const planned = planMigration(source, existingKeys)

      for (const rec of planned) {
        await db.insert(memories).values({
          id: rec.id,
          kind: rec.kind,
          content: rec.content,
          importanceScore: rec.importanceScore,
          sourceConversationId: rec.sourceConversationId,
          enabled: rec.enabled,
          embeddingModel: null,
          embeddingStatus: 'absent',
          createdAt: rec.createdAt,
          updatedAt: rec.updatedAt,
        })
      }
      if (planned.length > 0) persistDatabase()
      appStore.set('memoryLayerMigrated' as any, true)
      if (planned.length > 0) {
        console.log(`[MemoryService] Migrated ${planned.length} legacy memories into the Memory Layer.`)
      }
    } catch (err) {
      // Resumable: leave the flag unset so the next startup retries; dedupe prevents duplicates.
      console.error('[MemoryService] Memory migration failed (will retry next startup):', err)
    }
  }

  async list(): Promise<MemoryRecord[]> {
    const rows = await db.select().from(memories).all()
    return rows.map(rowToRecord)
  }

  async create(input: { content: string; kind?: string; sourceConversationId?: string }): Promise<MemoryRecord> {
    const content = input.content?.trim() ?? ''
    if (content.length < 1 || content.length > MAX_CONTENT_LENGTH) {
      throw new MemoryValidationError(`Memory content must be between 1 and ${MAX_CONTENT_LENGTH} characters.`)
    }
    const now = Date.now()
    const id = uuid()
    const record: MemoryRecord = {
      id,
      kind: input.kind ?? 'semantic',
      content,
      importanceScore: 0.5,
      sourceConversationId: input.sourceConversationId ?? null,
      enabled: true,
      embeddingModel: null,
      embeddingStatus: 'absent',
      createdAt: now,
      updatedAt: now,
    }

    await this.durableWrite(async () => {
      await db.insert(memories).values({
        id: record.id,
        kind: record.kind,
        content: record.content,
        importanceScore: record.importanceScore,
        sourceConversationId: record.sourceConversationId,
        enabled: record.enabled,
        embeddingModel: null,
        embeddingStatus: 'absent',
        createdAt: now,
        updatedAt: now,
      })
    }, async () => {
      // rollback: ensure no partial record remains
      await db.delete(memories).where(eq(memories.id, id))
    })

    this.queue.enqueue({ id, content })
    return record
  }

  async update(id: string, content: string): Promise<MemoryRecord> {
    const trimmed = content?.trim() ?? ''
    if (trimmed.length < 1 || trimmed.length > MAX_CONTENT_LENGTH) {
      throw new MemoryValidationError(`Memory content must be between 1 and ${MAX_CONTENT_LENGTH} characters.`)
    }
    const existing = await db.select().from(memories).where(eq(memories.id, id)).get()
    if (!existing) throw new MemoryNotFoundError(id)

    const now = Date.now()
    const status = this.provider ? 'stale' : 'absent'
    await this.durableWrite(async () => {
      await db
        .update(memories)
        .set({ content: trimmed, embeddingStatus: status, updatedAt: now })
        .where(eq(memories.id, id))
    })

    if (this.provider) this.queue.enqueue({ id, content: trimmed })
    const row = await db.select().from(memories).where(eq(memories.id, id)).get()
    return rowToRecord(row!)
  }

  async delete(id: string): Promise<void> {
    const existing = await db.select().from(memories).where(eq(memories.id, id)).get()
    if (!existing) throw new MemoryNotFoundError(id)
    await this.durableWrite(async () => {
      await db.delete(memories).where(eq(memories.id, id))
    })
    if (this.vectorReady) await this.vectorStore.remove(id)
  }

  async setEnabled(id: string, enabled: boolean): Promise<MemoryRecord> {
    const existing = await db.select().from(memories).where(eq(memories.id, id)).get()
    if (!existing) throw new MemoryNotFoundError(id)
    await this.durableWrite(async () => {
      await db.update(memories).set({ enabled, updatedAt: Date.now() }).where(eq(memories.id, id))
    })
    // When enabling a memory that has no embedding yet, queue one so it becomes
    // semantically recallable immediately (no restart required). The queue
    // processor resolves/skips the provider, so this is safe even if Ollama
    // started after the app did.
    if (enabled && this.vectorReady && existing.embeddingStatus !== 'present') {
      this.queue.enqueue({ id, content: existing.content })
    }
    const row = await db.select().from(memories).where(eq(memories.id, id)).get()
    return rowToRecord(row!)
  }

  async recall(query: string, opts?: RecallOptions): Promise<RecallResult[]> {
    const limit = clampLimit(opts?.limit)
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_RECALL_TIMEOUT_MS
    if (!query || query.trim().length === 0) return []

    const enabledRows = (await db.select().from(memories).where(eq(memories.enabled, true)).all()).map(rowToRecord)
    if (enabledRows.length === 0) return []

    // Lexical scores are always available and cheap.
    const lexicalByID = new Map<string, number>()
    for (const r of enabledRows) lexicalByID.set(r.id, lexicalScore(query, r.content))

    // Attempt semantic enrichment within the recall timeout; otherwise fall back to lexical.
    const semanticByID = await withTimeout(
      this.computeSemanticScores(query, enabledRows),
      timeoutMs,
      () => new Map<string, number>()
    )

    const candidates: ScoredCandidate[] = enabledRows.map((record) => ({
      record,
      semantic: semanticByID.has(record.id) ? normalizeSemantic(semanticByID.get(record.id)!) : null,
      lexical: lexicalByID.get(record.id) ?? 0,
    }))

    return rankAndLimit(candidates, limit)
  }

  private async computeSemanticScores(query: string, rows: MemoryRecord[]): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    if (!this.vectorReady || !this.provider) return out
    const hasEmbeddings = rows.some((r) => r.embeddingStatus === 'present')
    if (!hasEmbeddings) return out
    try {
      const queryVec = await this.provider.embed(query)
      const matches = await this.vectorStore.query(queryVec, Math.min(rows.length, 50))
      for (const m of matches) out.set(m.id, m.score)
    } catch (err) {
      console.error('[MemoryService] Semantic scoring failed, using lexical only:', err)
    }
    return out
  }

  async flush(): Promise<void> {
    try {
      await this.vectorStore.flush()
    } catch {
      /* best effort */
    }
  }

  /** Embedding job processor: embed content, store vector, mark present. */
  private async processEmbedding(job: EmbeddingJob): Promise<void> {
    if (!this.vectorReady) return
    if (!this.provider) {
      this.provider = await resolveEmbeddingProvider()
      if (!this.provider) return // no provider — stays embedding-absent, lexical-recallable
    }
    const row = await db.select().from(memories).where(eq(memories.id, job.id)).get()
    if (!row) return // deleted before processing
    const vector = await this.provider.embed(job.content)
    await this.vectorStore.upsert(job.id, vector, { model: this.provider.model })
    await db
      .update(memories)
      .set({ embeddingModel: this.provider.model, embeddingStatus: 'present', updatedAt: Date.now() })
      .where(eq(memories.id, job.id))
    persistDatabase()
  }

  /** Run a write and persist it; on failure run optional rollback and rethrow. No partial writes. */
  private async durableWrite(write: () => Promise<void>, rollback?: () => Promise<void>): Promise<void> {
    try {
      await withTimeout(
        (async () => {
          await write()
          persistDatabase()
        })(),
        WRITE_TIMEOUT_MS,
        () => {
          throw new Error('Memory write timed out')
        }
      )
    } catch (err) {
      if (rollback) {
        try {
          await rollback()
          persistDatabase()
        } catch {
          /* best effort rollback */
        }
      }
      throw err
    }
  }
}

export const memoryService = new MemoryService()
