import { db } from '../db/connection'
import { workspaces } from '../db/schema'
import { eq } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import { persistDatabase } from '../db/connection'
import { bootstrapWorkspace } from './bootstrapper'

export interface Workspace {
  id: string
  name: string
  rootPath?: string
  systemPrompt?: string
  defaultModel?: string
  mcpConfig?: string
  createdAt: number
  updatedAt: number
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const rows = await db.select().from(workspaces)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    rootPath: r.rootPath ?? undefined,
    systemPrompt: r.systemPrompt ?? undefined,
    defaultModel: r.defaultModel ?? undefined,
    mcpConfig: r.mcpConfig ?? undefined,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }))
}

export async function createWorkspace(data: Partial<Pick<Workspace, 'name' | 'rootPath' | 'systemPrompt' | 'defaultModel' | 'mcpConfig'>>): Promise<Workspace> {
  const id = uuid()
  const now = Date.now()
  await db.insert(workspaces).values({
    id,
    name: data.name ?? 'New Workspace',
    rootPath: data.rootPath ?? null,
    systemPrompt: data.systemPrompt ?? null,
    defaultModel: data.defaultModel ?? null,
    mcpConfig: data.mcpConfig ?? null,
    createdAt: now,
    updatedAt: now,
  })
  persistDatabase()
  
  // Trigger bootstrapping on creation!
  if (data.rootPath) {
    try {
      await bootstrapWorkspace(data.rootPath)
    } catch (err) {
      console.error('[WorkspaceManager] Failed to bootstrap:', err)
    }
  }

  return { 
    id, 
    name: data.name ?? 'New Workspace', 
    rootPath: data.rootPath,
    systemPrompt: data.systemPrompt, 
    defaultModel: data.defaultModel, 
    mcpConfig: data.mcpConfig, 
    createdAt: now, 
    updatedAt: now 
  }
}

export async function updateWorkspace(id: string, data: Partial<Pick<Workspace, 'name' | 'rootPath' | 'systemPrompt' | 'defaultModel' | 'mcpConfig'>>): Promise<void> {
  const updates: any = { updatedAt: Date.now() }
  if (data.name !== undefined) updates.name = data.name
  if (data.rootPath !== undefined) updates.rootPath = data.rootPath
  if (data.systemPrompt !== undefined) updates.systemPrompt = data.systemPrompt
  if (data.defaultModel !== undefined) updates.defaultModel = data.defaultModel
  if (data.mcpConfig !== undefined) updates.mcpConfig = data.mcpConfig
  await db.update(workspaces).set(updates).where(eq(workspaces.id, id))
  persistDatabase()

  // Trigger bootstrapping on update if path changed!
  if (data.rootPath) {
    try {
      await bootstrapWorkspace(data.rootPath)
    } catch (err) {
      console.error('[WorkspaceManager] Failed to bootstrap:', err)
    }
  }
}

export async function deleteWorkspace(id: string): Promise<void> {
  await db.delete(workspaces).where(eq(workspaces.id, id))
  persistDatabase()
}

export async function setActiveWorkspace(id: string): Promise<void> {
  const { appStore } = await import('../settings/app-store')
  appStore.set('activeWorkspaceId', id)
}
