import { ipcMain, BrowserWindow } from 'electron'

export type ApprovalDecision = 'approved' | 'denied' | 'always'

interface PendingApproval {
  serverId: string
  toolName: string
  args: Record<string, any>
  resolve: (decision: ApprovalDecision) => void
  description?: string
}

const pendingApprovals = new Map<string, PendingApproval>()
const alwaysApproved = new Map<string, Set<string>>()

export function requestToolApproval(
  win: BrowserWindow,
  serverId: string,
  toolName: string,
  args: Record<string, any>,
  description?: string,
): Promise<ApprovalDecision> {
  if (alwaysApproved.get(serverId)?.has(toolName)) {
    return Promise.resolve('approved')
  }

  return new Promise((resolve) => {
    const approvalId = `${serverId}:${toolName}:${Date.now()}`
    pendingApprovals.set(approvalId, { serverId, toolName, args, resolve, description })

    win.webContents.send('mcp:approvalRequest', {
      approvalId,
      serverId,
      toolName,
      args,
      description,
    })
  })
}

export function handleApprovalResponse(approvalId: string, decision: ApprovalDecision): void {
  const pending = pendingApprovals.get(approvalId)
  if (!pending) return

  pendingApprovals.delete(approvalId)

  if (decision === 'always') {
    const set = alwaysApproved.get(pending.serverId) ?? new Set()
    set.add(pending.toolName)
    alwaysApproved.set(pending.serverId, set)
  }

  pending.resolve(decision === 'denied' ? 'denied' : 'approved')
}

export function registerApprovalIpcHandlers(win: BrowserWindow): void {
  ipcMain.handle('mcp:approveTool', async (_, approvalId: string, decision: ApprovalDecision) => {
    handleApprovalResponse(approvalId, decision)
    return undefined
  })
}
