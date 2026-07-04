import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitInfo } from '@shared/types/localmind-api'

interface Props {
  workspacePath?: string | null
  /** Bump this value to force an immediate refresh (e.g. after an agent edits files). */
  refreshToken?: number | string
}

const POLL_INTERVAL_MS = 8000

/**
 * Claude Code–style workspace indicator bar: environment · folder · branch ·
 * worktree · diff stats. Reflects the git state of the active workspace.
 */
export function WorkspaceStatusBar({ workspacePath, refreshToken }: Props) {
  const [info, setInfo] = useState<GitInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const pathRef = useRef(workspacePath)
  pathRef.current = workspacePath

  const refresh = useCallback(async () => {
    const path = pathRef.current
    if (!path || !window.localmind?.workspace?.gitInfo) {
      setInfo(null)
      return
    }
    setLoading(true)
    try {
      const res = await window.localmind.workspace.gitInfo(path)
      setInfo(res.success && res.data ? res.data : null)
    } catch {
      setInfo(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [refresh, workspacePath, refreshToken])

  const folderName = info?.folderName || (workspacePath ? workspacePath.split(/[\\/]/).filter(Boolean).pop() : null)
  const hasChanges = !!info && (info.additions > 0 || info.deletions > 0 || info.untracked > 0)

  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium">
      {/* Environment */}
      <span className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant/60 bg-surface-container px-2 py-1 text-on-surface-variant">
        <span className="material-symbols-outlined text-[14px]">computer</span>
        Local
      </span>

      {/* Workspace folder */}
      {folderName && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant/60 bg-surface-container px-2 py-1 text-on-surface">
          <span className="material-symbols-outlined text-[14px] text-primary">folder</span>
          <span className="max-w-[160px] truncate font-semibold">{folderName}</span>
        </span>
      )}

      {/* Git branch */}
      {info?.isRepo && info.branch && (
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant/60 bg-surface-container px-2 py-1 text-on-surface-variant"
          title={info.detached ? 'Detached HEAD' : `Branch ${info.branch}`}
        >
          <span className="material-symbols-outlined text-[14px]">fork_right</span>
          <span className="max-w-[140px] truncate font-mono">{info.branch}</span>
          {info.ahead > 0 && <span className="text-[10px] text-emerald-400">↑{info.ahead}</span>}
          {info.behind > 0 && <span className="text-[10px] text-amber-400">↓{info.behind}</span>}
        </span>
      )}

      {/* Worktree */}
      {info?.isWorktree && (
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant/60 bg-surface-container px-2 py-1 text-on-surface-variant"
          title="Linked git worktree"
        >
          <span className="material-symbols-outlined text-[14px]">account_tree</span>
          worktree
        </span>
      )}

      {/* Diff stats */}
      {hasChanges && info && (
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant/60 bg-surface-container px-2 py-1"
          title={`${info.changedFiles} changed file${info.changedFiles === 1 ? '' : 's'}${info.untracked ? ` · ${info.untracked} untracked` : ''}`}
        >
          <span className="material-symbols-outlined text-[14px] text-on-surface-variant">difference</span>
          <span className="text-on-surface-variant">Changes</span>
          <span className="font-mono font-semibold text-emerald-400">+{info.additions}</span>
          <span className="font-mono font-semibold text-red-400">-{info.deletions}</span>
        </span>
      )}

      {loading && !info && (
        <span className="material-symbols-outlined animate-spin text-[14px] text-on-surface-variant/50">progress_activity</span>
      )}
    </div>
  )
}
