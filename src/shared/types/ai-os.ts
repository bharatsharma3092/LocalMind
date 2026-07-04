/**
 * Phase 1 (AI OS Foundation) shared type definitions.
 * Used by the main process, preload bridge, and renderer.
 */

// ─── Memory Layer ────────────────────────────────────────────────────────────

export type EmbeddingStatus = 'absent' | 'present' | 'stale'

export interface MemoryRecord {
  id: string
  kind: string
  content: string
  importanceScore: number
  sourceConversationId: string | null
  enabled: boolean
  embeddingModel: string | null
  embeddingStatus: EmbeddingStatus
  createdAt: number
  updatedAt: number
}

export type RecallMode = 'semantic' | 'lexical' | 'hybrid'

export interface RecallResult {
  record: MemoryRecord
  score: number
  mode: RecallMode
}

export interface RecallOptions {
  limit?: number // 1..50, default 5
  timeoutMs?: number // default 2000
}

export interface MemoryConfig {
  recallLimit: number
  recallTimeoutMs: number
  embeddingProvider: string | null
  embeddingModel: string | null
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

export type Trigger =
  | { type: 'cron'; expression: string }
  | { type: 'interval'; seconds: number }
  | { type: 'once'; timestamp: number }

export type RunStatus = 'succeeded' | 'failed'
export type RecentRunStatus = 'not-yet-run' | 'running' | 'succeeded' | 'failed'

export interface ScheduledTask {
  id: string
  type: string
  trigger: Trigger
  params: Record<string, unknown>
  enabled: boolean
  nextRunAt: number | null
  lastRunAt: number | null
  createdAt: number
  updatedAt: number
}

export interface ScheduledTaskWithStatus extends ScheduledTask {
  lastRunStatus: RecentRunStatus
}

export interface TaskRun {
  id: string
  taskId: string
  status: RunStatus
  startedAt: number
  endedAt: number
  result: string | null
  error: string | null
}

export interface SchedulerConfig {
  tickIntervalMs: number
  runRetentionDays: number
}

// ─── Local API Server ─────────────────────────────────────────────────────────

export interface ApiServerConfig {
  enabled: boolean
  host: string // default '127.0.0.1'
  port: number // 1024..65535
  allowedOrigins: string[]
  maxBodyBytes: number
  rateLimit: { windowMs: number; max: number }
}

export interface ApiServerRuntime {
  host: string
  port: number
}
