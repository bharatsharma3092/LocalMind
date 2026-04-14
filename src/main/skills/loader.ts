import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export interface SkillManifest {
  id: string
  name: string
  version: string
  description: string
  author?: string
  category: string
  icon?: string
  models?: {
    recommended?: string[]
    minContextWindow?: number
  }
  parameters?: {
    id: string
    type: 'text' | 'select' | 'boolean'
    label: string
    options?: string[]
    default?: string
  }[]
  mcpDependencies?: string[]
  systemPrompt?: string
  systemPromptFile?: string
}

export interface Skill {
  id: string
  manifest: SkillManifest
  systemPrompt: string
  enabled: boolean
  installedAt: number
}

const loadedSkills = new Map<string, Skill>()

export function loadBuiltinSkills(): Skill[] {
  const skillsDir = join(app.getAppPath(), 'resources', 'skills')

  if (!existsSync(skillsDir)) {
    return []
  }

  const skills: Skill[] = []

  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const manifestPath = join(skillsDir, entry.name, 'manifest.json')
      if (!existsSync(manifestPath)) continue

      try {
        const manifestRaw = readFileSync(manifestPath, 'utf-8')
        const manifest: SkillManifest = JSON.parse(manifestRaw)

        let systemPrompt = manifest.systemPrompt ?? ''
        if (manifest.systemPromptFile) {
          const promptPath = join(skillsDir, entry.name, manifest.systemPromptFile)
          if (existsSync(promptPath)) {
            systemPrompt = readFileSync(promptPath, 'utf-8')
          }
        }

        const skill: Skill = {
          id: manifest.id,
          manifest,
          systemPrompt,
          enabled: true,
          installedAt: Date.now(),
        }

        loadedSkills.set(skill.id, skill)
        skills.push(skill)
      } catch (err) {
        console.error(`[skills] Failed to load skill from ${entry.name}:`, err)
      }
    }
  } catch (err) {
    console.error('[skills] Failed to read skills directory:', err)
  }

  return skills
}

export function getSkill(skillId: string): Skill | undefined {
  return loadedSkills.get(skillId)
}

export function getAllSkills(): Skill[] {
  return Array.from(loadedSkills.values())
}

export function addSkill(skill: Skill): void {
  loadedSkills.set(skill.id, skill)
}

export function removeSkill(skillId: string): boolean {
  return loadedSkills.delete(skillId)
}
