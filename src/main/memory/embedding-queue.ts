/**
 * Fire-and-forget embedding job queue.
 * Runs off the chat/recall path so interactive streaming is never blocked.
 * Processes jobs serially with bounded retries.
 */

export interface EmbeddingJob {
  id: string
  content: string
}

const MAX_ATTEMPTS = 3

export class EmbeddingQueue {
  private queue: EmbeddingJob[] = []
  private pending = new Set<string>()
  private running = false

  /**
   * @param processor Embeds the job and persists the vector. Throwing triggers a retry.
   */
  constructor(private readonly processor: (job: EmbeddingJob) => Promise<void>) {}

  /** Enqueue a job. Deduplicates by id; a re-enqueued id will be processed once with latest content. */
  enqueue(job: EmbeddingJob): void {
    // Replace any queued job for the same id with the latest content.
    this.queue = this.queue.filter((j) => j.id !== job.id)
    this.queue.push(job)
    this.pending.add(job.id)
    void this.drain()
  }

  get size(): number {
    return this.queue.length
  }

  isPending(id: string): boolean {
    return this.pending.has(id)
  }

  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!
        await this.runWithRetry(job)
        this.pending.delete(job.id)
      }
    } finally {
      this.running = false
    }
  }

  private async runWithRetry(job: EmbeddingJob): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await this.processor(job)
        return
      } catch (err) {
        if (attempt === MAX_ATTEMPTS) {
          console.error(`[EmbeddingQueue] Job ${job.id} failed after ${MAX_ATTEMPTS} attempts:`, err)
          return // give up; record stays embedding-absent and lexical-recallable
        }
        // brief backoff between attempts
        await new Promise((r) => setTimeout(r, 250 * attempt))
      }
    }
  }
}
