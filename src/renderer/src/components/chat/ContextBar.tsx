import { useMemo } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useProviderStore } from '../../stores/providerStore'

interface Props {
  conversationId: string
}

export function ContextBar({ conversationId }: Props) {
  const messages = useChatStore((s) => s.messages[conversationId] ?? [])
  const { selectedModel } = useProviderStore()

  const tokenCount = useMemo(() => {
    // Rough estimate: ~4 chars per token
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0)
    return Math.ceil(totalChars / 4)
  }, [messages])

  const maxTokens = selectedModel?.contextWindow ?? 4096
  const usagePercent = Math.min((tokenCount / maxTokens) * 100, 100)

  const barColor = usagePercent < 50 ? 'bg-green-500' : usagePercent < 80 ? 'bg-amber-500' : 'bg-red-500'
  const textColor = usagePercent < 50 ? 'text-green-500' : usagePercent < 80 ? 'text-amber-500' : 'text-red-500'

  if (messages.length === 0) return null

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border text-xs text-text-muted">
      <div className="flex-1 h-1.5 bg-surface-offset rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-300 rounded-full`}
          style={{ width: `${usagePercent}%` }}
        />
      </div>
      <span className={textColor}>
        {tokenCount.toLocaleString()} / {maxTokens.toLocaleString()} tokens
      </span>
    </div>
  )
}
