import { useState } from 'react'

interface ToolCallData {
  serverId?: string
  toolName: string
  args?: Record<string, any>
  result?: any
  error?: string
  duration?: number
}

export function ToolCallCard({ toolCall }: { toolCall: ToolCallData }) {
  const [expanded, setExpanded] = useState(false)

  const statusColor = toolCall.error
    ? 'bg-danger'
    : toolCall.result
      ? 'bg-success'
      : 'bg-warning'

  const statusLabel = toolCall.error
    ? 'Error'
    : toolCall.result
      ? 'Completed'
      : 'Running'

  return (
    <div className="border border-border rounded-xl bg-surface-offset my-2 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors text-left"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
        <svg
          className={`w-4 h-4 text-text-muted transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-mono font-medium truncate">{toolCall.toolName}</span>
        {toolCall.serverId && (
          <span className="text-xs text-text-muted ml-auto flex-shrink-0">{toolCall.serverId}</span>
        )}
        <span className="text-xs px-2 py-0.5 rounded-full bg-surface text-text-muted flex-shrink-0">
          {statusLabel}
        </span>
        {toolCall.duration != null && (
          <span className="text-xs text-text-muted flex-shrink-0">{toolCall.duration}ms</span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          {toolCall.args && Object.keys(toolCall.args).length > 0 && (
            <div>
              <p className="text-xs text-text-muted mb-1">Arguments</p>
              <pre className="bg-surface border border-border rounded-lg p-2 text-xs overflow-x-auto max-h-40 overflow-y-auto">
                {JSON.stringify(toolCall.args, null, 2)}
              </pre>
            </div>
          )}
          {toolCall.result && (
            <div>
              <p className="text-xs text-text-muted mb-1">Result</p>
              <pre className="bg-surface border border-border rounded-lg p-2 text-xs overflow-x-auto max-h-40 overflow-y-auto">
                {typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}
          {toolCall.error && (
            <div>
              <p className="text-xs text-text-muted mb-1">Error</p>
              <p className="text-xs text-danger bg-surface border border-danger/20 rounded-lg p-2">
                {toolCall.error}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
