import { useRef, useEffect } from 'react'
import { MessageBubble } from './MessageBubble'
import { useChatStore } from '../../stores/chatStore'

interface Props {
  conversationId: string
}

export function MessageList({ conversationId }: Props) {
  const messagesRaw = useChatStore((s) => s.messages[conversationId])
  const messages = messagesRaw ?? []
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, messages[messages.length - 1]?.content])

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-32">
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full text-on-surface-variant text-sm">
          Send a message to start the conversation
        </div>
      )}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
