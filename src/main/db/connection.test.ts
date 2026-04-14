import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { drizzle } from 'drizzle-orm/sql-js'
import { eq } from 'drizzle-orm'
import * as schema from './schema'

const { conversations, messages, workspaces, personas } = schema

describe('Database schema and CRUD', () => {
  let sqlite: Database
  let db: ReturnType<typeof drizzle>

  beforeAll(async () => {
    const SQL = await initSqlJs()
    sqlite = new SQL.Database()
    sqlite.run('PRAGMA foreign_keys = ON')

    sqlite.run(`CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      system_prompt TEXT,
      default_model TEXT,
      mcp_config TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`)
    sqlite.run(`CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT REFERENCES workspaces(id),
      title TEXT,
      model_id TEXT,
      provider TEXT,
      token_usage TEXT,
      starred INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`)
    sqlite.run(`CREATE TABLE IF NOT EXISTS messages (
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
      created_at INTEGER NOT NULL
    )`)
    sqlite.run(`CREATE TABLE IF NOT EXISTS personas (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      icon TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`)

    db = drizzle(sqlite, { schema })
  })

  it('inserts and reads a workspace', () => {
    const now = Date.now()
    db.insert(workspaces).values({
      id: 'ws-1',
      name: 'Test Workspace',
      systemPrompt: 'You are helpful.',
      defaultModel: 'llama3',
      mcpConfig: null,
      createdAt: now,
      updatedAt: now,
    }).run()

    const result = db.select().from(workspaces).where(eq(workspaces.id, 'ws-1')).get()
    expect(result).toBeDefined()
    expect(result!.name).toBe('Test Workspace')
    expect(result!.systemPrompt).toBe('You are helpful.')
  })

  it('inserts and reads a conversation', () => {
    const now = Date.now()
    db.insert(conversations).values({
      id: 'conv-1',
      workspaceId: 'ws-1',
      title: null,
      modelId: 'llama3',
      provider: 'ollama',
      tokenUsage: null,
      starred: false,
      createdAt: now,
      updatedAt: now,
    }).run()

    const result = db.select().from(conversations).where(eq(conversations.id, 'conv-1')).get()
    expect(result).toBeDefined()
    expect(result!.modelId).toBe('llama3')
    expect(result!.provider).toBe('ollama')
  })

  it('inserts and reads messages for a conversation', () => {
    const now = Date.now()
    db.insert(messages).values({
      id: 'msg-1',
      conversationId: 'conv-1',
      role: 'user',
      content: 'Hello!',
      toolCalls: null,
      toolResults: null,
      modelId: null,
      tokensUsed: null,
      parentMessageId: null,
      branchId: null,
      createdAt: now,
    }).run()

    db.insert(messages).values({
      id: 'msg-2',
      conversationId: 'conv-1',
      role: 'assistant',
      content: 'Hi there!',
      toolCalls: null,
      toolResults: null,
      modelId: 'llama3',
      tokensUsed: 15,
      parentMessageId: 'msg-1',
      branchId: null,
      createdAt: now,
    }).run()

    const result = db.select().from(messages).where(eq(messages.conversationId, 'conv-1')).all()
    expect(result.length).toBe(2)
    expect(result[0]!.role).toBe('user')
    expect(result[1]!.content).toBe('Hi there!')
    expect(result[1]!.tokensUsed).toBe(15)
  })

  it('updates a conversation title', () => {
    db.update(conversations).set({ title: 'My Chat' }).where(eq(conversations.id, 'conv-1')).run()
    const result = db.select().from(conversations).where(eq(conversations.id, 'conv-1')).get()
    expect(result!.title).toBe('My Chat')
  })

  it('deletes a conversation', () => {
    db.delete(messages).where(eq(messages.conversationId, 'conv-1')).run()
    db.delete(conversations).where(eq(conversations.id, 'conv-1')).run()
    const result = db.select().from(conversations).where(eq(conversations.id, 'conv-1')).get()
    expect(result).toBeUndefined()
  })

  it('inserts and reads a persona', () => {
    const now = Date.now()
    db.insert(personas).values({
      id: 'persona-1',
      name: 'Code Helper',
      systemPrompt: 'You are a coding assistant.',
      icon: '🤖',
      createdAt: now,
      updatedAt: now,
    }).run()

    const result = db.select().from(personas).where(eq(personas.id, 'persona-1')).get()
    expect(result).toBeDefined()
    expect(result!.name).toBe('Code Helper')
    expect(result!.icon).toBe('🤖')
  })

  it('enforces foreign key on messages -> conversations', () => {
    const now = Date.now()
    expect(() => {
      db.insert(messages).values({
        id: 'msg-orphan',
        conversationId: 'nonexistent-conv',
        role: 'user',
        content: 'orphan',
        createdAt: now,
      }).run()
    }).toThrow()
  })
})
