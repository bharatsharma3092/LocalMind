import { useState, useCallback, useMemo } from 'react'
import hljs from 'highlight.js'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChatStore } from '../../stores/chatStore'
import { useProviderStore } from '../../stores/providerStore'
import { useUIStore } from '../../stores/uiStore'
import type { Message } from '../../stores/chatStore'

interface Props {
  message: Message
  branchCount?: number
  branchIndex?: number
  onBranchNavigate?: (direction: 'prev' | 'next') => void
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const highlighted = useMemo(() => {
    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(code, { language }).value
      }
      return hljs.highlightAuto(code).value
    } catch {
      return hljs.highlightAuto(code).value
    }
  }, [code, language])

  return (
    <div className="rounded-xl overflow-hidden border border-[#2a2a2a] bg-[#0d0d0d] my-3">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#141414] border-b border-[#2a2a2a]">
        <span className="text-[12px] font-mono text-[#888]">{language || 'code'}</span>
        <div className="flex items-center gap-3">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-[11px] text-[#888] hover:text-[#ccc] transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">{copied ? 'check' : 'content_copy'}</span>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={() => {}}
            className="flex items-center gap-1.5 text-[11px] text-[#888] hover:text-[#ccc] transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
            Open
          </button>
        </div>
      </div>
      <div className="p-4 overflow-x-auto">
        <pre className="m-0 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words">
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        </pre>
      </div>
    </div>
  )
}

function splitToolActivity(content: string) {
  const toolLinePattern = /^(?:[*_`>\s]*)?(?:Using\s+(?:local__|tool)|local__[\w_]*\s(?:is\s+)?(?:running|finished)\.?)/i
  const toolLines: string[] = []
  const discussionLines: string[] = []

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    const normalized = trimmed.replace(/^[*_`>\s]+|[*_`\s]+$/g, '')
    if (toolLinePattern.test(normalized)) {
      toolLines.push(normalized)
    } else {
      discussionLines.push(line)
    }
  }

  return {
    discussion: discussionLines.join('\n').trim(),
    toolLines,
  }
}

export function MessageBubble({ message, branchCount = 1, branchIndex = 0, onBranchNavigate }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [copied, setCopied] = useState(false)
  const { updateStreamingMessage } = useChatStore()
  const { selectedModel } = useProviderStore()
  const { setActiveArtifactId, toggleArtifactPanel } = useUIStore()

  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const renderedMessage = useMemo(() => {
    if (!isAssistant) {
      return { discussion: message.content, toolLines: [] as string[] }
    }
    return splitToolActivity(message.content)
  }, [isAssistant, message.content])

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

  const handleSaveAsArtifact = useCallback(async () => {
    const res = await window.localmind.artifact.save({
      conversationId: message.conversationId,
      messageId: message.id,
      type: 'text',
      content: message.content,
    })
    if (res.success && res.data) {
      if (res.data.id) {
        setActiveArtifactId(res.data.id)
        toggleArtifactPanel()
      }
    }
  }, [message, setActiveArtifactId, toggleArtifactPanel])

  const hasBranches = branchCount > 1

  // Simple inline code detection for rendering inline code blocks
  const renderContent = () => {
    if (isEditing) {
      return (
        <div className="flex flex-col gap-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full bg-surface-container border border-outline-variant rounded-lg p-2 text-[14px] text-on-surface resize-none"
            rows={4}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-[12px] text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors">
              Cancel
            </button>
            <button onClick={handleSaveEdit} className="px-3 py-1.5 text-[12px] bg-primary-container text-on-primary-container rounded-lg hover:bg-primary-container/90 transition-colors">
              Save
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        {renderedMessage.toolLines.length > 0 && (
          <details
            className="not-prose mb-3 rounded-lg border border-outline-variant/20 bg-surface-container-low/10 px-3 py-1.5 text-[11px] text-on-surface-variant/35"
          >
            <summary className="cursor-pointer select-none text-on-surface-variant/40">
              Tool activity ({renderedMessage.toolLines.length})
            </summary>
            <div className="mt-2 space-y-1 font-mono italic opacity-70">
              {renderedMessage.toolLines.map((line, index) => (
                <div key={`${line}-${index}`} className="truncate">
                  {line}
                </div>
              ))}
            </div>
          </details>
        )}
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || '')
              const codeString = String(children).replace(/\n$/, '')
              if (match) {
                return <CodeBlock language={match[1]} code={codeString} />
              }
              return (
                <code className="font-mono text-[14px] bg-surface-container px-1.5 py-0.5 rounded text-secondary-fixed" {...props}>
                  {children}
                </code>
              )
            },
          }}
        >
          {renderedMessage.discussion || (message.isStreaming ? 'Working...' : '')}
        </ReactMarkdown>
        {message.isStreaming && (
          <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1 rounded-sm" />
        )}
      </div>
    )
  }

  return (
    <div className="flex gap-4 max-w-4xl mx-auto">
      {/* Avatar */}
      {isUser ? (
        <div className="w-8 h-8 rounded-full flex-shrink-0 bg-surface-container border border-outline-variant overflow-hidden flex items-center justify-center">
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">person</span>
        </div>
      ) : (
        <div className="w-8 h-8 rounded-lg flex-shrink-0 bg-secondary-container/20 border border-secondary-container/30 flex items-center justify-center text-secondary-container">
          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            psychology
          </span>
        </div>
      )}

      <div className="flex-1 space-y-2 pt-1 min-w-0">
        {/* Meta */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[14px] text-on-surface">
            {isUser ? 'You' : 'LocalMind'}
          </span>
          {!isUser && (
            <span className="text-[12px] text-on-surface-variant flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary-container"></span>
              {selectedModel ? `${selectedModel.provider}: ${selectedModel.name}` : 'No model selected'}
            </span>
          )}
          <span className="text-[12px] text-on-surface-variant/70">
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Content */}
        {isUser ? (
          <div className="text-[16px] leading-relaxed text-on-surface bg-surface-container-low p-4 rounded-xl border border-surface-container-high inline-block max-w-[85%]">
            {renderContent()}
          </div>
        ) : (
          <div className="text-[16px] leading-relaxed text-on-surface">
            {renderContent()}
          </div>
        )}

        {/* Branches */}
        {hasBranches && !message.isStreaming && (
          <div className="flex items-center gap-1 mt-1 pt-1">
            <button
              onClick={() => onBranchNavigate?.('prev')}
              disabled={branchIndex <= 0}
              className="text-on-surface-variant hover:text-on-surface disabled:opacity-30 text-xs p-0.5"
            >
              <span className="material-symbols-outlined text-[16px]">chevron_left</span>
            </button>
            <span className="text-[12px] text-on-surface-variant">
              {branchIndex + 1}/{branchCount}
            </span>
            <button
              onClick={() => onBranchNavigate?.('next')}
              disabled={branchIndex >= branchCount - 1}
              className="text-on-surface-variant hover:text-on-surface disabled:opacity-30 text-xs p-0.5"
            >
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>
        )}

        {/* Actions */}
        {!isEditing && (
          <div className="flex items-center gap-2 pt-1 opacity-0 hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="w-8 h-8 rounded-lg border border-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-secondary hover:border-secondary/50 transition-colors"
              title="Copy"
            >
              <span className="material-symbols-outlined text-[16px]">{copied ? 'check' : 'content_copy'}</span>
            </button>
            {isUser && (
              <button
                onClick={() => setIsEditing(true)}
                className="w-8 h-8 rounded-lg border border-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                title="Edit"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
              </button>
            )}
            {isAssistant && (
              <>
                <button
                  onClick={handleSaveAsArtifact}
                  className="w-8 h-8 rounded-lg border border-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                  title="Save as artifact"
                >
                  <span className="material-symbols-outlined text-[16px]">save</span>
                </button>
                <button
                  onClick={() => {}}
                  className="w-8 h-8 rounded-lg border border-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                  title="Regenerate"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                </button>
                <button
                  className="w-8 h-8 rounded-lg border border-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-error hover:border-error/50 transition-colors"
                  title="Bad response"
                >
                  <span className="material-symbols-outlined text-[16px]">thumb_down</span>
                </button>
                <button
                  className="w-8 h-8 rounded-lg border border-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-secondary hover:border-secondary/50 transition-colors"
                  title="Good response"
                >
                  <span className="material-symbols-outlined text-[16px]">thumb_up</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
