import type { LLMRequest, LLMMessage, LLMStreamChunk } from '../llm/types'
import { llmRouter } from '../llm/router'
import { getSkill, type Skill } from './loader'

export interface SkillRunParams {
  skillId: string
  messages: LLMMessage[]
  model: string
  provider: string
  parameters?: Record<string, string>
  tools?: any[]
}

export async function* runSkill(params: SkillRunParams): AsyncIterable<LLMStreamChunk> {
  const skill = getSkill(params.skillId)
  if (!skill) throw new Error(`Skill "${params.skillId}" not found`)

  const systemPrompt = buildSystemPrompt(skill, params.parameters)

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...params.messages,
  ]

  const request: LLMRequest = {
    messages: llmMessages,
    model: params.model,
    provider: params.provider as any,
    stream: true,
    tools: params.tools,
  }

  yield* llmRouter.complete(request)
}

function buildSystemPrompt(skill: Skill, params?: Record<string, string>): string {
  let prompt = skill.systemPrompt

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
    }
  }

  prompt = prompt
    .replace(/\{\{date\}\}/g, new Date().toISOString().split('T')[0])
    .replace(/\{\{os\}\}/g, process.platform)
    .replace(/\{\{time\}\}/g, new Date().toLocaleTimeString())

  return prompt
}
