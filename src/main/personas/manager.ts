import { db } from '../db/connection'
import { personas } from '../db/schema'
import { desc, eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { persistDatabase } from '../db/connection'

export interface Persona {
  id: string
  name: string
  systemPrompt: string
  icon?: string
  createdAt: number
  updatedAt: number
}

export async function listPersonas(): Promise<Persona[]> {
  const rows = await db.select().from(personas).orderBy(desc(personas.updatedAt), desc(personas.createdAt))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    systemPrompt: r.systemPrompt,
    icon: r.icon ?? undefined,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }))
}

export async function getPersona(id: string): Promise<Persona | null> {
  const row = await db.select().from(personas).where(eq(personas.id, id)).get()
  if (!row) return null

  return {
    id: row.id,
    name: row.name,
    systemPrompt: row.systemPrompt,
    icon: row.icon ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function createPersona(data: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>): Promise<Persona> {
  const id = uuid()
  const now = Date.now()
  await db.insert(personas).values({
    id,
    name: data.name,
    systemPrompt: data.systemPrompt,
    icon: data.icon ?? null,
    createdAt: now,
    updatedAt: now,
  })
  persistDatabase()
  return { id, name: data.name, systemPrompt: data.systemPrompt, icon: data.icon, createdAt: now, updatedAt: now }
}

export async function updatePersona(id: string, data: Partial<Pick<Persona, 'name' | 'systemPrompt' | 'icon'>>): Promise<void> {
  const updates: any = { updatedAt: Date.now() }
  if (data.name !== undefined) updates.name = data.name
  if (data.systemPrompt !== undefined) updates.systemPrompt = data.systemPrompt
  if (data.icon !== undefined) updates.icon = data.icon
  await db.update(personas).set(updates).where(eq(personas.id, id))
  persistDatabase()
}

export async function deletePersona(id: string): Promise<void> {
  await db.delete(personas).where(eq(personas.id, id))
  persistDatabase()
}

export function applyTemplateVariables(systemPrompt: string, variables?: Record<string, string>): string {
  let prompt = systemPrompt

  prompt = prompt
    .replace(/\{\{date\}\}/g, new Date().toISOString().split('T')[0])
    .replace(/\{\{time\}\}/g, new Date().toLocaleTimeString())
    .replace(/\{\{os\}\}/g, process.platform)
    .replace(/\{\{year\}\}/g, String(new Date().getFullYear()))

  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
    }
  }

  return prompt
}
