import { useState } from 'react'
import { TraceHUD } from '../chat/TraceHUD'

type ContextTab = 'activity' | 'memory' | 'inspector'

interface ContextPanelProps {
  conversationId: string | null
  onClose: () => void
  onOpenMemory?: () => void
}

const TABS: { id: ContextTab; label: string; icon: string }[] = [
  { id: 'activity', label: 'Activity', icon: 'bolt' },
  { id: 'memory', label: 'Memory', icon: 'neurology' },
  { id: 'inspector', label: 'Inspector', icon: 'frame_inspect' },
]

/**
 * The right-hand Context Panel of the three-panel architecture.
 * Answers "What is AI doing?" and "What changed?" without forcing navigation.
 */
export function ContextPanel({ conversationId, onClose, onOpenMemory }: ContextPanelProps) {
  const [tab, setTab] = useState<ContextTab>('activity')

  return (
    <aside className="h-full w-full flex flex-col bg-surface border-l border-outline-variant">
      {/* Tab strip */}
      <div className="flex items-center justify-between px-2 h-11 border-b border-outline-variant">
        <div className="flex items-center gap-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[12px] font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-surface-container-high text-on-surface'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
              }`}
              title={t.label}
            >
              <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
              <span className="hidden xl:inline">{t.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors"
          title="Hide context panel"
        >
          <span className="material-symbols-outlined text-[18px]">right_panel_close</span>
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'activity' && (
          <TraceHUD conversationId={conversationId} />
        )}
        {tab === 'memory' && (
          <ContextEmptyState
            icon="neurology"
            title="No memory surfaced yet"
            description="As you work, LocalMind recalls relevant preferences and facts here."
            actionLabel="Open memory settings"
            onAction={onOpenMemory}
          />
        )}
        {tab === 'inspector' && (
          <ContextEmptyState
            icon="frame_inspect"
            title="Nothing to inspect"
            description="Select a message, file, or tool result to see its details here."
          />
        )}
      </div>
    </aside>
  )
}

function ContextEmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: string
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
      <span className="material-symbols-outlined text-[34px] text-on-surface-variant/40">{icon}</span>
      <div>
        <p className="text-[13px] font-semibold text-on-surface">{title}</p>
        <p className="text-[12px] text-on-surface-variant mt-1 max-w-[220px]">{description}</p>
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-1 text-[12px] font-semibold text-primary hover:underline"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
