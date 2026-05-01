import { useEffect, useState } from 'react'

interface ApprovalRequest {
  approvalId: string
  agentId?: string
  toolName: string
  args: Record<string, any>
  description?: string
}

export function AgentToolPermissionDialog() {
  const [pending, setPending] = useState<ApprovalRequest | null>(null)

  useEffect(() => {
    const handler = (data: ApprovalRequest) => {
      setPending(data)
    }
    window.localmind?.agent?.onApprovalRequest?.(handler)
    return () => {
      window.localmind?.agent?.offApprovalRequest?.(handler)
    }
  }, [])

  if (!pending) return null

  const decide = async (decision: 'approved' | 'denied') => {
    await window.localmind?.agent?.approveTool?.(pending.approvalId, decision)
    setPending(null)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-outline-variant bg-surface shadow-2xl">
        <div className="border-b border-outline-variant p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-error-container/20 text-error">
              <span className="material-symbols-outlined">delete</span>
            </div>
            <div>
              <h3 className="text-base font-black text-on-surface">Approve File Delete</h3>
              <p className="text-xs text-on-surface-variant">{pending.description}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Agent</p>
            <p className="mt-1 text-sm text-on-surface">{pending.agentId ?? 'Agent'}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Tool</p>
            <p className="mt-1 font-mono text-sm text-on-surface">{pending.toolName}</p>
          </div>
          <pre className="max-h-48 overflow-auto rounded-xl border border-outline-variant bg-surface-container-low p-3 text-xs text-on-surface">
            {JSON.stringify(pending.args, null, 2)}
          </pre>
        </div>

        <div className="flex gap-3 border-t border-outline-variant p-5">
          <button
            onClick={() => decide('denied')}
            className="flex-1 rounded-xl border border-outline-variant bg-surface-container px-4 py-2 text-sm font-bold text-on-surface hover:bg-surface-container-high"
          >
            Deny
          </button>
          <button
            onClick={() => decide('approved')}
            className="flex-1 rounded-xl bg-error px-4 py-2 text-sm font-bold text-on-error hover:opacity-90"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
