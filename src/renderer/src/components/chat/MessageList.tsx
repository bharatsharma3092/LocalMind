import { useRef, useEffect } from 'react'
import { MessageBubble } from './MessageBubble'
import { useChatStore } from '../../stores/chatStore'

interface Props {
  conversationId: string
}

export function MessageList({ conversationId }: Props) {
  const messages = useChatStore((s) => s.messages[conversationId] ?? [])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, messages[messages.length - 1]?.content])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full text-text-muted text-sm">
          Send a message to start the conversation
        </div>
      )}
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
