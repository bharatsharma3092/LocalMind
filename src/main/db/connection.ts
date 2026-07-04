import initSqlJs, { type Database } from 'sql.js'
import { drizzle } from 'drizzle-orm/sql-js'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import * as schema from './schema'

let sqlite: Database
let dbPath: string

export let db: ReturnType<typeof drizzle>

export async function initDatabase(): Promise<void> {
  const wasmPath = join(app.getAppPath(), 'node_modules/sql.js/dist/sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => wasmPath })

  dbPath = join(app.getPath('userData'), 'localmind.db')

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath)
    sqlite = new SQL.Database(buffer)
  } else {
    sqlite = new SQL.Database()
  }

  // Enable foreign keys
  sqlite.run('PRAGMA foreign_keys = ON')

  db = drizzle(sqlite, { schema })
}

export function runMigrations(): void {
  // Create tables if they don't exist
  const tableCheck = sqlite.exec(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'"
  )

  if (tableCheck.length === 0) {
    // Create all tables from schema (Fresh install)
    const tables = [
      `CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        root_path TEXT,
        system_prompt TEXT,
        default_model TEXT,
        mcp_config TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT REFERENCES workspaces(id),
        persona_id TEXT,
        title TEXT,
        model_id TEXT,
        provider TEXT,
        token_usage TEXT,
        starred INTEGER DEFAULT 0,
        sandbox_mode INTEGER DEFAULT 0,
        queue_mode TEXT DEFAULT 'steer',
        summary TEXT,
        parent_conversation_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_calls TEXT,
        tool_results TEXT,
        model_id TEXT,
        tokens_used INTEGER,
        parent_message_id TEXT,
        branch_id TEXT,
        created_at INTEGER NOT NULL,
        tool_call_id TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT REFERENCES conversations(id),
        message_id TEXT REFERENCES messages(id),
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT REFERENCES workspaces(id),
        name TEXT NOT NULL,
        config TEXT NOT NULL,
        permissions TEXT,
        enabled INTEGER DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        manifest TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        installed_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        icon TEXT,
        category TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        built_in INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS personas (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        icon TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS provider_configs (
        id TEXT PRIMARY KEY NOT NULL,
        provider_type TEXT NOT NULL,
        config_json TEXT NOT NULL,
        enabled INTEGER DEFAULT 1
      )`,
      `CREATE TABLE IF NOT EXISTS model_profiles (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        provider TEXT NOT NULL,
        model_id TEXT NOT NULL,
        temperature REAL DEFAULT 0.7,
        max_tokens INTEGER DEFAULT 4096,
        is_default INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS pinned_files (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT REFERENCES conversations(id),
        filename TEXT NOT NULL,
        content_text TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS skill_pipelines (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        steps TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        importance_score REAL DEFAULT 0.5,
        source_conversation_id TEXT REFERENCES conversations(id),
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS commitments (
        id TEXT PRIMARY KEY NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        due_at INTEGER,
        completed_at INTEGER,
        source_conversation_id TEXT REFERENCES conversations(id),
        source_message_id TEXT REFERENCES messages(id),
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    ]

    for (const sql of tables) {
      sqlite.run(sql)
    }
  }

  // Idempotent column check for existing databases
  const workspaceColumns = sqlite
    .exec('PRAGMA table_info(workspaces)')[0]
    ?.values.map((row: unknown[]) => String(row[1])) ?? []

  if (!workspaceColumns.includes('root_path')) {
    sqlite.run('ALTER TABLE workspaces ADD COLUMN root_path TEXT')
  }

  const conversationColumns = sqlite
    .exec('PRAGMA table_info(conversations)')[0]
    ?.values.map((row: unknown[]) => String(row[1])) ?? []

  if (!conversationColumns.includes('persona_id')) {
    sqlite.run('ALTER TABLE conversations ADD COLUMN persona_id TEXT')
  }
  if (!conversationColumns.includes('sandbox_mode')) {
    sqlite.run('ALTER TABLE conversations ADD COLUMN sandbox_mode INTEGER DEFAULT 0')
  }
  if (!conversationColumns.includes('queue_mode')) {
    sqlite.run("ALTER TABLE conversations ADD COLUMN queue_mode TEXT DEFAULT 'steer'")
  }
  if (!conversationColumns.includes('summary')) {
    sqlite.run('ALTER TABLE conversations ADD COLUMN summary TEXT')
  }
  if (!conversationColumns.includes('parent_conversation_id')) {
    sqlite.run('ALTER TABLE conversations ADD COLUMN parent_conversation_id TEXT')
  }

  const messageColumns = sqlite
    .exec('PRAGMA table_info(messages)')[0]
    ?.values.map((row: unknown[]) => String(row[1])) ?? []

  if (!messageColumns.includes('tool_call_id')) {
    sqlite.run('ALTER TABLE messages ADD COLUMN tool_call_id TEXT')
  }

  // Create memories and commitments table if missing for existing databases
  sqlite.run(`CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    content TEXT NOT NULL,
    importance_score REAL DEFAULT 0.5,
    source_conversation_id TEXT REFERENCES conversations(id),
    enabled INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  sqlite.run(`CREATE TABLE IF NOT EXISTS commitments (
    id TEXT PRIMARY KEY NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    due_at INTEGER,
    completed_at INTEGER,
    source_conversation_id TEXT REFERENCES conversations(id),
    source_message_id TEXT REFERENCES messages(id),
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  sqlite.run(`CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    icon TEXT,
    category TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    built_in INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  // --- Phase 1 (AI OS) additive migrations ---

  // Memory embedding metadata columns (additive)
  const memoryColumns = sqlite
    .exec('PRAGMA table_info(memories)')[0]
    ?.values.map((row: unknown[]) => String(row[1])) ?? []

  if (!memoryColumns.includes('embedding_model')) {
    sqlite.run('ALTER TABLE memories ADD COLUMN embedding_model TEXT')
  }
  if (!memoryColumns.includes('embedding_status')) {
    sqlite.run("ALTER TABLE memories ADD COLUMN embedding_status TEXT DEFAULT 'absent'")
  }

  // Background task scheduler tables
  sqlite.run(`CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    trigger_json TEXT NOT NULL,
    params_json TEXT,
    enabled INTEGER DEFAULT 1,
    next_run_at INTEGER,
    last_run_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)

  sqlite.run(`CREATE TABLE IF NOT EXISTS task_runs (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL REFERENCES scheduled_tasks(id),
    status TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    result TEXT,
    error TEXT
  )`)

  // Save initial DB to disk
  persistDatabase()
}

export function persistDatabase(): void {
  if (sqlite && dbPath) {
    const data = sqlite.export()
    const buffer = Buffer.from(data)
    writeFileSync(dbPath, buffer)
  }
}

export function closeDatabase(): void {
  persistDatabase()
  sqlite?.close()
}
