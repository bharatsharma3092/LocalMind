import { useMemo } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useProviderStore } from '../../stores/providerStore'

interface Props {
  conversationId: string
}

export function ContextBar({ conversationId }: Props) {
  const messagesRaw = useChatStore((s) => s.messages[conversationId])
  const messages = messagesRaw ?? []
  const { selectedModel } = useProviderStore()

  const tokenCount = useMemo(() => {
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0)
    return Math.ceil(totalChars / 4)
  }, [messages])

  const maxTokens = selectedModel?.contextWindow ?? 4096
  const usagePercent = Math.min((tokenCount / maxTokens) * 100, 100)

  const barColor = usagePercent < 50 ? 'bg-green-500' : usagePercent < 80 ? 'bg-amber-500' : 'bg-red-500'
  const textColor = usagePercent < 50 ? 'text-green-500' : usagePercent < 80 ? 'text-amber-500' : 'text-red-500'

  const attachedFiles = useMemo(() => {
    const fileMessages = messages.filter((m) => m.role === 'user' && m.content.startsWith('[File:'))
    return fileMessages.map((m) => {
      const match = m.content.match(/^\[File: ([^\]]+)\]/)
      return match ? match[1] : null
    }).filter(Boolean) as string[]
  }, [messages])

  if (messages.length === 0) return null

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border text-xs text-text-muted">
      {attachedFiles.length > 0 && (
        <div className="flex items-center gap-1">
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="truncate max-w-32">{attachedFiles.join(', ')}</span>
          <span className="text-text-muted">&middot;</span>
        </div>
      )}
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
