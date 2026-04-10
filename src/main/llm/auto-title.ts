import { db } from '../db/connection'
import { conversations, messages } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { LLMRequest, ProviderType } from './types'
import { llmRouter } from './router'

const TITLE_PROMPT = 'Generate a short, descriptive title (max 6 words) for a conversation that starts with this message. Reply with ONLY the title, nothing else.'

export async function generateConversationTitle(convId: string): Promise<void> {
  const conv = await db.select().from(conversations).where(eq(conversations.id, convId)).get()
  if (!conv || conv.title) return

  const msgs = await db.select().from(messages).where(eq(messages.conversationId, convId)).limit(2)
  if (msgs.length === 0) return

  const userMessage = msgs.find((m) => m.role === 'user')
  if (!userMessage) return

  const titleRequest: LLMRequest = {
    messages: [
      { role: 'system', content: TITLE_PROMPT },
      { role: 'user', content: String(userMessage.content).slice(0, 500) },
    ],
    model: conv.modelId ?? 'qwen2.5:7b',
    provider: (conv.provider as ProviderType) ?? 'ollama',
    stream: false,
    maxTokens: 30,
    temperature: 0.3,
  }

  try {
    let title = ''
    for await (const chunk of llmRouter.complete(titleRequest)) {
      if (chunk.type === 'text' && chunk.content) title += chunk.content
    }
    title = title.trim().replace(/^["']|["']$/g, '').slice(0, 80)
    if (title) {
      await db.update(conversations).set({ title }).where(eq(conversations.id, convId))
    }
  } catch {
    // Non-critical: leave title as null if generation fails
  }
}
