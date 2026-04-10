import { useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { useChatStore } from '../../stores/chatStore'
import type { Message } from '../../stores/chatStore'

interface Props {
  message: Message
}

export function MessageBubble({ message }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [copied, setCopied] = useState(false)
  const { updateStreamingMessage } = useChatStore()

  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [message.content])

  const handleSaveEdit = async () => {
    await window.localmind.db.updateMessage(message.id, editContent)
    await window.localmind.db.deleteMessagesAfter(message.conversationId, message.id)
    updateStreamingMessage(message.conversationId, message.id, '')
    setIsEditing(false)
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`group relative max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-accent text-white rounded-br-md'
            : 'bg-surface-offset text-text rounded-bl-md'
        }`}
      >
        {isEditing ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg p-2 text-sm text-text resize-none"
              rows={4}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setIsEditing(false)} className="btn-ghost text-xs">
                Cancel
              </button>
              <button onClick={handleSaveEdit} className="btn-primary text-xs">
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >
                {message.content || (message.isStreaming ? '...' : '')}
              </ReactMarkdown>
            </div>
            {message.isStreaming && (
              <span className="inline-block w-2 h-4 bg-accent animate-pulse ml-1" />
            )}
            {/* Action buttons */}
            <div className="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                onClick={handleCopy}
                className="bg-surface border border-border rounded px-2 py-1 text-xs text-text-muted hover:text-text"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
              {isUser && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="bg-surface border border-border rounded px-2 py-1 text-xs text-text-muted hover:text-text"
                >
                  Edit
                </button>
              )}
              {isAssistant && (
                <button
                  onClick={() => {/* regenerate */}}
                  className="bg-surface border border-border rounded px-2 py-1 text-xs text-text-muted hover:text-text"
                >
                  Regenerate
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
