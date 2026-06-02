import { useState, useMemo } from 'react'
import { useChatStore } from '../../stores/chatStore'

interface TraceHUDProps {
  conversationId: string | null
  onClose?: () => void
}

interface ToolTraceItem {
  id: string
  name: string
  arguments: string
  result?: string
  status: 'executing' | 'success' | 'error'
  timestamp: number
}

export function TraceHUD({ conversationId, onClose }: TraceHUDProps) {
  const { messages } = useChatStore()
  const [expandedItem, setExpandedItem] = useState<string | null>(null)

  const activeMessages = useMemo(() => {
    if (!conversationId) return []
    return messages[conversationId] ?? []
  }, [messages, conversationId])

  const traceItems = useMemo<ToolTraceItem[]>(() => {
    const items: ToolTraceItem[] = []

    for (let i = 0; i < activeMessages.length; i++) {
      const msg = activeMessages[i]

      // Extract tool calls from assistant messages
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          // Look for a corresponding tool result message in subsequent messages
          let matchingResult: string | undefined
          let status: 'executing' | 'success' | 'error' = 'executing'

          for (let j = i + 1; j < activeMessages.length; j++) {
            const potentialResult = activeMessages[j]
            if (potentialResult.role === 'tool' && (potentialResult as any).toolCallId === tc.id) {
              matchingResult = potentialResult.content
              const isErr = potentialResult.content.includes('"error"') || potentialResult.content.includes('error":"')
              status = isErr ? 'error' : 'success'
              break
            }
          }

          items.push({
            id: tc.id || `${tc.name}-${msg.createdAt}`,
            name: tc.name,
            arguments: tc.arguments,
            result: matchingResult,
            status,
            timestamp: msg.createdAt,
          })
        }
      }
    }

    return items
  }, [activeMessages])

  const getToolType = (name: string): { label: string; bg: string; text: string } => {
    if (name.startsWith('local__')) {
      return { label: 'Workspace', bg: 'bg-[#0f172a] border-blue-500/20', text: 'text-blue-400' }
    }
    if (name.startsWith('mcp__')) {
      return { label: 'MCP', bg: 'bg-[#1e1b4b] border-indigo-500/20', text: 'text-indigo-400' }
    }
    if (name.startsWith('web__') || name === 'web__search') {
      return { label: 'Search', bg: 'bg-[#064e3b] border-emerald-500/20', text: 'text-emerald-400' }
    }
    return { label: 'Custom', bg: 'bg-[#3f3f46] border-zinc-500/20', text: 'text-zinc-400' }
  }

  const formatToolName = (name: string): string => {
    return name
      .replace(/^local__/, '')
      .replace(/^mcp__[a-zA-Z0-9_-]+__/, '')
      .replace(/^web__/, '')
      .replace(/_/g, ' ')
  }

  const parseArgs = (argsStr: string): string => {
    try {
      const parsed = JSON.parse(argsStr)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return argsStr
    }
  }

  return (
    <div className="w-[320px] lg:w-[380px] h-full flex flex-col bg-[#0b0c10]/95 backdrop-blur-xl border-l border-[#1f2833]/60 shadow-2xl overflow-hidden transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f2833]/40 bg-[#1f2833]/15">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-accent animate-pulse">analytics</span>
          <h3 className="text-[14px] font-bold tracking-wider uppercase text-on-surface">Execution Trace HUD</h3>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#1f2833]/30 text-text-muted hover:text-on-surface transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6 scrollbar-thin">
        {traceItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-text-muted/60 space-y-3 py-10">
            <span className="material-symbols-outlined text-[40px] opacity-40">timeline</span>
            <p className="text-[13px] font-medium max-w-[200px]">No active tool execution traces recorded for this turn.</p>
          </div>
        ) : (
          <div className="relative border-l-2 border-[#1f2833]/40 pl-6 ml-3 space-y-6">
            {traceItems.map((item) => {
              const toolType = getToolType(item.name)
              const isExpanded = expandedItem === item.id

              return (
                <div key={item.id} className="relative group transition-all duration-200">
                  {/* Timeline Dot Indicator */}
                  <span className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 bg-[#0b0c10] flex items-center justify-center transition-all duration-300 ${
                    item.status === 'executing'
                      ? 'border-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)] animate-ping'
                      : item.status === 'error'
                      ? 'border-red-400 shadow-[0_0_10px_rgba(248,113,113,0.4)]'
                      : 'border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.4)]'
                  }`}>
                    {item.status === 'executing' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    )}
                  </span>

                  {/* Execution Trace Block */}
                  <div className={`p-4 rounded-xl border transition-all duration-200 ${
                    item.status === 'executing'
                      ? 'bg-blue-950/10 border-blue-500/20'
                      : item.status === 'error'
                      ? 'bg-red-950/10 border-red-500/20'
                      : 'bg-[#1f2833]/10 border-[#1f2833]/40 hover:border-[#1f2833]/80'
                  }`}>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className={`text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-full border ${toolType.bg} ${toolType.text}`}>
                            {toolType.label}
                          </span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                            item.status === 'executing'
                              ? 'bg-blue-400/10 text-blue-400'
                              : item.status === 'error'
                              ? 'bg-red-400/10 text-red-400'
                              : 'bg-emerald-400/10 text-emerald-400'
                          }`}>
                            {item.status}
                          </span>
                        </div>
                        <h4 className="text-[13px] font-bold text-on-surface truncate capitalize">
                          {formatToolName(item.name)}
                        </h4>
                      </div>
                      <button
                        onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                        className="text-text-muted hover:text-on-surface p-1 rounded transition-colors"
                        title={isExpanded ? "Collapse" : "Expand logs"}
                      >
                        <span className="material-symbols-outlined text-[16px] transition-transform duration-200">
                          {isExpanded ? 'unfold_less' : 'unfold_more'}
                        </span>
                      </button>
                    </div>

                    {/* Collapsible logs */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-[#1f2833]/30 space-y-3 text-[11px] leading-relaxed font-mono">
                        <div>
                          <span className="text-[10px] text-text-muted/65 uppercase tracking-wider block mb-1">Arguments</span>
                          <pre className="p-2.5 rounded-lg bg-black/60 border border-[#1f2833]/30 overflow-x-auto text-[#88ddff] max-h-40 scrollbar-thin">
                            {parseArgs(item.arguments)}
                          </pre>
                        </div>
                        {item.result && (
                          <div>
                            <span className="text-[10px] text-text-muted/65 uppercase tracking-wider block mb-1">Result</span>
                            <pre className="p-2.5 rounded-lg bg-black/60 border border-[#1f2833]/30 overflow-x-auto text-[#a3e635] max-h-56 scrollbar-thin whitespace-pre-wrap break-all">
                              {item.result}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-5 py-3 border-t border-[#1f2833]/30 bg-black/40 text-[10px] text-text-muted/70 flex items-center justify-between font-medium">
        <span>Round Status: Active</span>
        <span>{traceItems.length} tool cycle{traceItems.length === 1 ? '' : 's'}</span>
      </div>
    </div>
  )
}
