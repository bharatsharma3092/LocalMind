import { db } from '../db/connection'
import { skills } from '../db/schema'
import { getAllSkills } from './loader'
import { runSkill } from './runner'
import type { ToolCall, LLMRequest } from '@shared/types/localmind-api'

/**
 * Shared bridge that exposes LocalMind skills to the agent tool loop.
 * Used by both the IPC layer and the AgentRuntime so skill discovery and
 * execution stay in one place.
 */

export interface SkillToolInfo {
  id: string
  name: string
  description?: string
  parameters?: any[]
  enabled?: boolean
}

export function isSkillToolName(name: string): boolean {
  return name.startsWith('skill__')
}

export async function getAllSkillsForTools(): Promise<SkillToolInfo[]> {
  const builtinSkills = getAllSkills()
  const dbSkills = await db.select().from(skills)
  const allSkills = [...builtinSkills]
  for (const dbs of dbSkills) {
    try {
      const manifest = JSON.parse(dbs.manifest)
      const existingIndex = allSkills.findIndex((s) => s.id === dbs.id)
      const value = {
        id: dbs.id,
        manifest,
        systemPrompt: manifest.systemPrompt ?? '',
        enabled: dbs.enabled ?? true,
        installedAt: dbs.installedAt,
      }
      if (existingIndex >= 0) allSkills[existingIndex] = { ...allSkills[existingIndex], ...value }
      else allSkills.push(value)
    } catch {}
  }
  return allSkills.map((skill) => ({
    id: skill.id,
    name: skill.manifest.name,
    description: skill.manifest.description,
    parameters: skill.manifest.parameters,
    enabled: skill.enabled,
  }))
}

export async function executeSkillToolCall(toolCall: ToolCall, request: LLMRequest): Promise<{ role: 'tool'; content: string; toolCallId: string }> {
  const enabledSkills = await getAllSkillsForTools()
  const skill = enabledSkills.find((item) => `skill__${item.id.replace(/[^a-zA-Z0-9_]/g, '_')}` === toolCall.name)
  if (!skill) {
    return {
      role: 'tool',
      content: JSON.stringify({ error: `Skill tool not found: ${toolCall.name}` }),
      toolCallId: toolCall.id,
    }
  }

  let args: Record<string, any> = {}
  try {
    args = JSON.parse(toolCall.arguments || '{}')
  } catch {
    args = {}
  }

  try {
    const chunks = []
    for await (const chunk of runSkill({
      skillId: skill.id,
      messages: [{ role: 'user', content: String(args.input ?? '') }],
      model: request.model,
      provider: request.provider,
      parameters: args.parameters,
    })) {
      chunks.push(chunk)
    }
    return { role: 'tool', content: JSON.stringify({ skillId: skill.id, result: chunks }), toolCallId: toolCall.id }
  } catch (err: any) {
    return { role: 'tool', content: JSON.stringify({ error: err.message ?? 'Skill execution failed' }), toolCallId: toolCall.id }
  }
}
