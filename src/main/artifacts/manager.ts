import { app } from 'electron'
import { join } from 'path'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { db } from '../db/connection'
import { artifacts } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { persistDatabase } from '../db/connection'

export interface ArtifactData {
  id: string
  conversationId: string
  messageId: string
  type: 'html' | 'markdown' | 'code' | 'svg' | 'mermaid' | 'json'
  content: string
  version: number
}

function getArtifactsDir(): string {
  const dir = join(app.getPath('userData'), 'artifacts')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export async function saveArtifact(data: Omit<ArtifactData, 'id' | 'version'>): Promise<ArtifactData> {
  const existing = await db.select().from(artifacts)
    .where(and(
      eq(artifacts.conversationId, data.conversationId),
      eq(artifacts.messageId, data.messageId),
      eq(artifacts.type, data.type),
    ))
    .orderBy(artifacts.version)

  const version = existing.length > 0 ? existing[existing.length - 1].version + 1 : 1
  const id = uuid()

  await db.insert(artifacts).values({
    id,
    conversationId: data.conversationId,
    messageId: data.messageId,
    type: data.type,
    content: data.content,
    version,
    createdAt: Date.now(),
  })
  persistDatabase()

  const artifactDir = join(getArtifactsDir(), id)
  if (!existsSync(artifactDir)) mkdirSync(artifactDir, { recursive: true })
  const ext = getExtensionForType(data.type)
  writeFileSync(join(artifactDir, `v${version}${ext}`), data.content, 'utf-8')

  return { id, conversationId: data.conversationId, messageId: data.messageId, type: data.type, content: data.content, version }
}

export async function listArtifacts(convId: string): Promise<ArtifactData[]> {
  const rows = await db.select().from(artifacts)
    .where(eq(artifacts.conversationId, convId))
    .orderBy(artifacts.createdAt)

  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversationId!,
    messageId: r.messageId!,
    type: r.type as ArtifactData['type'],
    content: r.content,
    version: r.version ?? 1,
  }))
}

export async function getArtifactVersions(artifactId: string): Promise<ArtifactData[]> {
  const row = await db.select().from(artifacts).where(eq(artifacts.id, artifactId)).get()
  if (!row) return []

  return await db.select().from(artifacts)
    .where(and(
      eq(artifacts.conversationId, row.conversationId!),
      eq(artifacts.messageId, row.messageId!),
      eq(artifacts.type, row.type),
    ))
    .orderBy(artifacts.version)
}

export async function exportArtifact(artifactId: string, format: string): Promise<string> {
  const row = await db.select().from(artifacts).where(eq(artifacts.id, artifactId)).get()
  if (!row) throw new Error('Artifact not found')

  if (format === 'raw' || format === row.type) {
    return row.content
  }

  if (format === 'json') {
    return JSON.stringify({ type: row.type, content: row.content, version: row.version }, null, 2)
  }

  return row.content
}

function getExtensionForType(type: string): string {
  switch (type) {
    case 'html': return '.html'
    case 'markdown': return '.md'
    case 'code': return '.txt'
    case 'svg': return '.svg'
    case 'mermaid': return '.mmd'
    case 'json': return '.json'
    default: return '.txt'
  }
}
