import { join } from 'path'
import { app } from 'electron'
import { LocalIndex } from 'vectra'

/**
 * File-backed local vector index for memory embeddings (vectra).
 * Stored under userData/memory-vectors/ and never transmitted off-device.
 * Keyed by the memory record id so vectors are retrievable/removable by id.
 */
export class VectorStore {
  private index: LocalIndex
  private ready = false

  constructor(indexPath?: string) {
    const dir = indexPath ?? join(app.getPath('userData'), 'memory-vectors')
    this.index = new LocalIndex(dir)
  }

  async init(): Promise<void> {
    if (!(await this.index.isIndexCreated())) {
      await this.index.createIndex()
    }
    this.ready = true
  }

  isReady(): boolean {
    return this.ready
  }

  /** Insert or replace the embedding for a memory id. */
  async upsert(
    id: string,
    vector: number[],
    metadata: Record<string, string | number | boolean> = {}
  ): Promise<void> {
    if (!this.ready) await this.init()
    await this.index.upsertItem({ id, vector, metadata })
  }

  /** Remove the embedding for a memory id (no-op if absent). */
  async remove(id: string): Promise<void> {
    if (!this.ready) await this.init()
    try {
      await this.index.deleteItem(id)
    } catch {
      // item may not exist — treat as no-op
    }
  }

  /** Return the top-k nearest memory ids with scores for a query vector. */
  async query(vector: number[], topK: number): Promise<Array<{ id: string; score: number }>> {
    if (!this.ready) await this.init()
    const results = await this.index.queryItems(vector, topK)
    return results.map((r) => ({ id: String(r.item.id), score: r.score }))
  }

  /** Whether the index currently holds any vectors. */
  async hasVectors(): Promise<boolean> {
    if (!this.ready) await this.init()
    try {
      const items = await this.index.listItems()
      return items.length > 0
    } catch {
      return false
    }
  }

  /** vectra persists on each write; flush is a no-op kept for interface symmetry. */
  async flush(): Promise<void> {
    /* vectra auto-persists */
  }
}
