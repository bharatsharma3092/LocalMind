import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { db } from '../db/connection'
import { conversations, messages, workspaces, personas, skills as skillsTable, mcpServers } from '../db/schema'
import { desc } from 'drizzle-orm'

export async function exportAllData(): Promise<string> {
  const exportData: any = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    workspaces: await db.select().from(workspaces),
    conversations: await db.select().from(conversations).orderBy(desc(conversations.updatedAt)),
    messages: await db.select().from(messages),
    personas: await db.select().from(personas),
    skills: await db.select().from(skillsTable),
    mcpServers: await db.select().from(mcpServers),
  }

  const exportDir = join(app.getPath('userData'), 'exports')
  if (!existsSync(exportDir)) mkdirSync(exportDir, { recursive: true })

  const filename = `localmind-export-${Date.now()}.json`
  const filepath = join(exportDir, filename)
  writeFileSync(filepath, JSON.stringify(exportData, null, 2), 'utf-8')

  return filepath
}

export async function importAllData(zipPath: string): Promise<{ imported: boolean; error?: string }> {
  try {
    const raw = readFileSync(zipPath, 'utf-8')
    const data = JSON.parse(raw)

    if (!data.version) {
      return { imported: false, error: 'Invalid export file: missing version' }
    }

    if (data.workspaces) {
      for (const ws of data.workspaces) {
        try { await db.insert(workspaces).values(ws) } catch {}
      }
    }

    if (data.conversations) {
      for (const conv of data.conversations) {
        try { await db.insert(conversations).values(conv) } catch {}
      }
    }

    if (data.messages) {
      for (const msg of data.messages) {
        try { await db.insert(messages).values(msg) } catch {}
      }
    }

    if (data.personas) {
      for (const p of data.personas) {
        try { await db.insert(personas).values(p) } catch {}
      }
    }

    return { imported: true }
  } catch (err: any) {
    return { imported: false, error: err.message }
  }
}

export async function exportConversation(convId: string, format: 'md' | 'pdf' | 'json'): Promise<string> {
  const msgs = await db.select().from(messages)
    .where(require('drizzle-orm').eq(messages.conversationId, convId))
    .orderBy(messages.createdAt)

  const conv = await db.select().from(conversations)
    .where(require('drizzle-orm').eq(conversations.id, convId))
    .get()

  const title = conv?.title ?? 'Conversation'
  const exportDir = join(app.getPath('userData'), 'exports')
  if (!existsSync(exportDir)) mkdirSync(exportDir, { recursive: true })

  let content: string
  let ext: string

  if (format === 'json') {
    content = JSON.stringify({ title, messages: msgs }, null, 2)
    ext = '.json'
  } else {
    const lines = [`# ${title}`, '']
    for (const msg of msgs) {
      const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1)
      lines.push(`## ${role}`, '', msg.content, '')
    }
    content = lines.join('\n')
    ext = '.md'
  }

  const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}${ext}`
  const filepath = join(exportDir, filename)
  writeFileSync(filepath, content, 'utf-8')

  return filepath
}
