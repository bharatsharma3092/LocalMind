import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ApprovalRequest {
  approvalId: string
  serverId: string
  toolName: string
  args: Record<string, any>
  description?: string
}

export function McpPermissionDialog() {
  const [pending, setPending] = useState<ApprovalRequest | null>(null)

  useEffect(() => {
    const handler = (_: any, data: ApprovalRequest) => {
      setPending(data)
    }
    window.localmind?.mcp?.onApprovalRequest?.(handler)
    return () => {
      window.localmind?.mcp?.offApprovalRequest?.(handler)
    }
  }, [])

  if (!pending) return null

  const handleDecision = async (decision: 'approved' | 'denied' | 'always') => {
    await window.localmind?.mcp?.approveTool?.(pending.approvalId, decision)
    setPending(null)
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4"
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh' }}
    >
      <div
        className="bg-surface rounded-xl shadow-2xl w-full max-w-md border border-border"
        style={{ width: '100%', maxWidth: '28rem', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold">MCP Tool Approval</h3>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <p className="text-xs text-text-muted">Server</p>
            <p className="text-sm font-medium">{pending.serverId}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Tool</p>
            <p className="text-sm font-medium font-mono">{pending.toolName}</p>
          </div>
          {Object.keys(pending.args).length > 0 && (
            <div>
              <p className="text-xs text-text-muted mb-1">Arguments</p>
              <pre className="bg-surface-offset border border-border rounded-lg p-3 text-xs overflow-x-auto max-h-40 overflow-y-auto">
                {JSON.stringify(pending.args, null, 2)}
              </pre>
            </div>
          )}
          {pending.description && (
            <p className="text-xs text-text-muted">{pending.description}</p>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t border-border">
          <button
            onClick={() => handleDecision('denied')}
            className="btn-danger text-xs flex-1"
          >
            Deny
          </button>
          <button
            onClick={() => handleDecision('approved')}
            className="btn-primary text-xs flex-1"
          >
            Allow Once
          </button>
          <button
            onClick={() => handleDecision('always')}
            className="px-4 py-2 bg-success text-white rounded-lg hover:opacity-90 transition-opacity text-xs flex-1"
          >
            Always Allow
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
