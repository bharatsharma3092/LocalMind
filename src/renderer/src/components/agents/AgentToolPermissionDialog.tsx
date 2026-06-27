import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface ApprovalRequest {
  approvalId: string
  agentId?: string
  toolName: string
  args: Record<string, any>
  description?: string
  riskLevel?: 'low' | 'medium' | 'high' | 'critical'
  category?: 'read' | 'write' | 'delete' | 'shell' | 'network'
  protectedPath?: boolean
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

  const icon = pending.category === 'delete'
    ? 'delete'
    : pending.category === 'shell'
      ? 'terminal'
      : pending.category === 'network'
        ? 'public'
        : pending.category === 'write'
          ? 'edit_document'
          : 'security'
  const title = pending.category === 'delete'
    ? 'Approve Delete'
    : pending.category === 'shell'
      ? 'Approve Command'
      : pending.category === 'network'
        ? 'Approve Network Access'
        : pending.category === 'write'
          ? 'Approve File Change'
          : 'Approve Tool Use'
  const approveLabel = pending.category === 'delete' ? 'Delete' : 'Approve'
  const accentClass = pending.riskLevel === 'critical' || pending.category === 'delete'
    ? 'bg-error text-on-error'
    : 'bg-primary text-on-primary'

  const decide = async (decision: 'approved' | 'denied') => {
    await window.localmind?.agent?.approveTool?.(pending.approvalId, decision)
    setPending(null)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh' }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-outline-variant bg-surface shadow-2xl"
        style={{ width: '100%', maxWidth: '32rem', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="border-b border-outline-variant p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-error-container/20 text-error">
              <span className="material-symbols-outlined">{icon}</span>
            </div>
            <div>
              <h3 className="text-base font-black text-on-surface">{title}</h3>
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
          <div className="flex flex-wrap gap-2">
            {pending.riskLevel && (
              <span className="rounded-full border border-outline-variant bg-surface-container px-2.5 py-1 text-xs font-bold uppercase text-on-surface-variant">
                {pending.riskLevel} risk
              </span>
            )}
            {pending.protectedPath && (
              <span className="rounded-full border border-error/40 bg-error-container/20 px-2.5 py-1 text-xs font-bold uppercase text-error">
                protected path
              </span>
            )}
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
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold hover:opacity-90 ${accentClass}`}
          >
            {approveLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
