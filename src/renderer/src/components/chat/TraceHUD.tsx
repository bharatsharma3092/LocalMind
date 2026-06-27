import { useState, useMemo } from 'react'
import { useChatStore } from '../../stores/chatStore'

interface TraceHUDProps {
  conversationId: string | null
  onClose?: () => void
  embedded?: boolean
}

type TraceStatus = 'running' | 'success' | 'error'

interface ToolTraceItem {
  id: string
  name: string
  arguments: string
  result?: string
  status: TraceStatus
  timestamp: number
}

interface ActionDescriptor {
  icon: string
  title: string
  detail: string
  group: 'Workspace' | 'Browser' | 'Command' | 'Search' | 'MCP' | 'Skill' | 'Tool'
}

/** Safely parse a JSON-ish string, returning null on failure. */
function tryParse(value?: string): any {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/** Turn a raw tool name + arguments into a clear, human-readable action. */
function describeAction(name: string, argsStr: string): ActionDescriptor {
  const args = tryParse(argsStr) ?? {}

  // MCP tools: mcp__<server>__<tool>
  if (name.startsWith('mcp__')) {
    const parts = name.split('__')
    const server = parts[1] ?? 'server'
    const tool = parts.slice(2).join(' ').replace(/_/g, ' ') || 'tool'
    return { icon: 'extension', title: tool.replace(/^\w/, (c) => c.toUpperCase()), detail: `via ${server}`, group: 'MCP' }
  }

  if (name.startsWith('skill__')) {
    const skill = name.replace(/^skill__/, '').replace(/_/g, ' ')
    return { icon: 'auto_awesome', title: 'Run skill', detail: skill, group: 'Skill' }
  }

  switch (name) {
    case 'local__open_url':
      return { icon: 'open_in_browser', title: 'Open browser', detail: String(args.url ?? ''), group: 'Browser' }
    case 'local__launch_app':
      return { icon: 'rocket_launch', title: 'Launch app', detail: [args.command, ...(Array.isArray(args.args) ? args.args : [])].filter(Boolean).join(' '), group: 'Browser' }
    case 'local__read_file':
      return { icon: 'description', title: 'Read file', detail: String(args.path ?? ''), group: 'Workspace' }
    case 'local__write_file':
      return { icon: 'note_add', title: 'Write file', detail: String(args.path ?? ''), group: 'Workspace' }
    case 'local__edit_file':
      return { icon: 'edit', title: 'Edit file', detail: String(args.path ?? ''), group: 'Workspace' }
    case 'local__patch_file':
      return { icon: 'difference', title: 'Patch file', detail: String(args.path ?? ''), group: 'Workspace' }
    case 'local__delete_path':
      return { icon: 'delete', title: 'Delete', detail: String(args.path ?? ''), group: 'Workspace' }
    case 'local__list_files':
      return { icon: 'folder_open', title: 'List files', detail: String(args.path ?? 'workspace root'), group: 'Workspace' }
    case 'local__glob':
      return { icon: 'pattern', title: 'Find files', detail: String(args.pattern ?? ''), group: 'Workspace' }
    case 'local__repo_map':
      return { icon: 'account_tree', title: 'Map repository', detail: 'scanning project structure', group: 'Workspace' }
    case 'local__search_files':
    case 'local__grep':
      return { icon: 'manage_search', title: 'Search code', detail: String(args.query ?? ''), group: 'Search' }
    case 'local__write_spreadsheet':
    case 'local__append_spreadsheet':
      return { icon: 'table', title: name.includes('append') ? 'Append spreadsheet' : 'Write spreadsheet', detail: String(args.path ?? ''), group: 'Workspace' }
    case 'local__write_document':
    case 'local__append_document':
      return { icon: 'article', title: name.includes('append') ? 'Append document' : 'Write document', detail: String(args.path ?? ''), group: 'Workspace' }
    case 'local__git_status':
      return { icon: 'commit', title: 'Git status', detail: 'checking working tree', group: 'Command' }
    case 'local__git_diff':
      return { icon: 'difference', title: 'Git diff', detail: String(args.path ?? 'all changes'), group: 'Command' }
    case 'local__run_npm_script':
      return { icon: 'terminal', title: 'Run npm script', detail: String(args.script ?? ''), group: 'Command' }
    case 'local__run_command':
      return { icon: 'terminal', title: 'Run command', detail: [args.command, ...(Array.isArray(args.args) ? args.args : [])].filter(Boolean).join(' '), group: 'Command' }
    case 'web__search':
      return { icon: 'travel_explore', title: 'Search the web', detail: String(args.query ?? ''), group: 'Search' }
    default:
      return { icon: 'bolt', title: name.replace(/^local__/, '').replace(/_/g, ' '), detail: '', group: 'Tool' }
  }
}

/** Produce a short, plain-language outcome line from a tool result. */
function summarizeResult(result: string | undefined, status: TraceStatus): string {
  if (status === 'running') return 'Working on it…'
  if (!result) return status === 'success' ? 'Completed.' : 'No result returned.'

  const parsed = tryParse(result)
  if (parsed && typeof parsed === 'object') {
    if (parsed.error) return String(parsed.error)
    if (parsed.success && parsed.opened) return `Opened ${parsed.opened}`
    if (parsed.success && parsed.launched) return `Launched ${parsed.launched}`
    if (typeof parsed.stdout === 'string' && parsed.stdout.trim()) return parsed.stdout.trim().split('\n')[0].slice(0, 140)
    if (Array.isArray(parsed.files)) return `${parsed.files.length} file(s) found`
    if (Array.isArray(parsed.results)) return `${parsed.results.length} result(s)`
    if (parsed.success) return 'Completed successfully.'
  }

  const firstLine = result.trim().split('\n')[0]
  return firstLine.slice(0, 140) + (firstLine.length > 140 ? '…' : '')
}

const STATUS_META: Record<TraceStatus, { label: string; icon: string; pill: string; dot: string }> = {
  running: {
    label: 'Running',
    icon: 'progress_activity',
    pill: 'bg-secondary-container/30 text-secondary',
    dot: 'bg-secondary animate-pulse',
  },
  success: {
    label: 'Done',
    icon: 'check_circle',
    pill: 'bg-success/15 text-success',
    dot: 'bg-success',
  },
  error: {
    label: 'Failed',
    icon: 'error',
    pill: 'bg-error/15 text-error',
    dot: 'bg-error',
  },
}

function prettyJson(value?: string): string {
  const parsed = tryParse(value)
  return parsed ? JSON.stringify(parsed, null, 2) : (value ?? '')
}

export function TraceHUD({ conversationId, onClose, embedded = false }: TraceHUDProps) {
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
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          let matchingResult: string | undefined
          let status: TraceStatus = 'running'

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

  const summary = useMemo(() => {
    const total = traceItems.length
    const done = traceItems.filter((t) => t.status === 'success').length
    const failed = traceItems.filter((t) => t.status === 'error').length
    const running = traceItems.filter((t) => t.status === 'running').length
    return { total, done, failed, running }
  }, [traceItems])

  return (
    <div className={`${embedded ? 'w-full' : 'w-[340px] lg:w-[400px] border-l border-outline-variant'} h-full flex flex-col bg-surface overflow-hidden`}>
      {/* Header */}
      {!embedded && (
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-outline-variant bg-surface-container">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[20px] text-primary">bolt</span>
          <div>
            <h3 className="text-[13px] font-bold text-on-surface leading-tight">Agent Activity</h3>
            <p className="text-[11px] text-on-surface-variant leading-tight">
              {summary.total === 0 ? 'No actions yet' : `${summary.total} action${summary.total === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors"
            title="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
      </div>
      )}

      {/* Status strip */}
      {summary.total > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-outline-variant bg-surface-container-low text-[11px] font-semibold">
          {summary.running > 0 && (
            <span className="flex items-center gap-1 text-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" /> {summary.running} running
            </span>
          )}
          <span className="flex items-center gap-1 text-success">
            <span className="w-1.5 h-1.5 rounded-full bg-success" /> {summary.done} done
          </span>
          {summary.failed > 0 && (
            <span className="flex items-center gap-1 text-error">
              <span className="w-1.5 h-1.5 rounded-full bg-error" /> {summary.failed} failed
            </span>
          )}
        </div>
      )}

      {/* Action list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
        {traceItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-on-surface-variant/70 space-y-3 py-10">
            <span className="material-symbols-outlined text-[40px] opacity-40">timeline</span>
            <p className="text-[12px] font-medium max-w-[220px]">
              When the agent uses tools, each action and its status will appear here. Click an action to see details.
            </p>
          </div>
        ) : (
          traceItems.map((item, index) => {
            const action = describeAction(item.name, item.arguments)
            const statusMeta = STATUS_META[item.status]
            const isExpanded = expandedItem === item.id
            const outcome = summarizeResult(item.result, item.status)

            return (
              <div
                key={item.id}
                className={`rounded-xl border transition-colors ${
                  item.status === 'error'
                    ? 'border-error/40 bg-error/5'
                    : item.status === 'running'
                    ? 'border-secondary/40 bg-secondary-container/10'
                    : 'border-outline-variant bg-surface-container-low'
                }`}
              >
                {/* Clickable summary row */}
                <button
                  onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                  className="w-full flex items-start gap-3 p-3 text-left"
                >
                  {/* Step number + action icon */}
                  <div className="flex flex-col items-center gap-1 pt-0.5">
                    <span className="text-[10px] font-bold text-on-surface-variant/60 tabular-nums">{index + 1}</span>
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center bg-surface-container-high text-on-surface`}>
                      <span className="material-symbols-outlined text-[18px]">{action.icon}</span>
                    </span>
                  </div>

                  {/* Title + detail + status */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-[13px] font-bold text-on-surface truncate capitalize">{action.title}</h4>
                      <span className={`shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${statusMeta.pill}`}>
                        <span className={`material-symbols-outlined text-[12px] ${item.status === 'running' ? 'animate-spin' : ''}`}>
                          {statusMeta.icon}
                        </span>
                        {statusMeta.label}
                      </span>
                    </div>
                    {action.detail && (
                      <p className="text-[11px] text-on-surface-variant font-mono truncate mt-0.5" title={action.detail}>
                        {action.detail}
                      </p>
                    )}
                    <p className={`text-[11px] mt-1 line-clamp-2 ${item.status === 'error' ? 'text-error' : 'text-on-surface-variant/90'}`}>
                      {outcome}
                    </p>
                  </div>

                  {/* Expand chevron */}
                  <span className={`material-symbols-outlined text-[18px] text-on-surface-variant/60 transition-transform duration-200 mt-0.5 ${isExpanded ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-3 text-[11px]">
                    <div>
                      <span className="text-[10px] text-on-surface-variant/70 uppercase tracking-wider font-bold block mb-1">
                        Action
                      </span>
                      <code className="text-[11px] text-on-surface-variant break-all">{item.name}</code>
                    </div>
                    <div>
                      <span className="text-[10px] text-on-surface-variant/70 uppercase tracking-wider font-bold block mb-1">
                        Inputs
                      </span>
                      <pre className="p-2.5 rounded-lg bg-surface-container-highest/60 border border-outline-variant overflow-x-auto max-h-40 scrollbar-thin font-mono text-on-surface">
                        {prettyJson(item.arguments) || '—'}
                      </pre>
                    </div>
                    <div>
                      <span className="text-[10px] text-on-surface-variant/70 uppercase tracking-wider font-bold block mb-1">
                        {item.status === 'error' ? 'Error output' : 'Result'}
                      </span>
                      {item.result ? (
                        <pre className={`p-2.5 rounded-lg border overflow-x-auto max-h-56 scrollbar-thin font-mono whitespace-pre-wrap break-all ${
                          item.status === 'error'
                            ? 'bg-error/5 border-error/30 text-error'
                            : 'bg-surface-container-highest/60 border-outline-variant text-on-surface'
                        }`}>
                          {prettyJson(item.result)}
                        </pre>
                      ) : (
                        <p className="text-on-surface-variant/70 italic">
                          {item.status === 'running' ? 'Still running…' : 'No output captured.'}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
