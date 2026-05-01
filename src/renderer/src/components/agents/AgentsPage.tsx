import { useCallback, useEffect, useMemo, useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { Agent } from '@shared/types/localmind-api'
import { useChatStore } from '../../stores/chatStore'
import { MessageList } from '../chat/MessageList'
import { ChatInput } from '../chat/ChatInput'

const fallbackAgents: Agent[] = [
  {
    id: 'cowork',
    name: 'Cowork',
    description: 'A collaborative work partner for planning, implementation, review, and testing.',
    systemPrompt: 'You are Cowork, a collaborative software engineering agent inside LocalMind.',
    icon: 'groups',
    category: 'Development',
    enabled: true,
    builtIn: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'code',
    name: 'Code',
    description: 'A coding agent with local file, glob, grep, edit, delete approval, npm script, MCP, and skill tools.',
    systemPrompt: 'You are Code, a local coding agent inside LocalMind.',
    icon: 'terminal',
    category: 'Coding',
    enabled: true,
    builtIn: true,
    createdAt: 0,
    updatedAt: 0,
  },
]

const quickStarts: Record<string, string[]> = {
  cowork: [
    'Plan this feature and identify the files that need to change.',
    'Review the current implementation and point out risks.',
    'Debug this behavior and suggest a minimal fix.',
  ],
  code: [
    'Inspect this project, implement the requested change, and run the build.',
    'Find the bug with grep/read tools, patch it, and verify it.',
    'Review the latest changes like a code reviewer with exact file references.',
  ],
}

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>(fallbackAgents)
  const [selectedAgentId, setSelectedAgentId] = useState('cowork')
  const [agentConversationIds, setAgentConversationIds] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const { createConversation, selectConversation } = useChatStore()

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true)
      if (!window.localmind?.agent?.list) {
        setAgents(fallbackAgents)
        return
      }
      const res = await window.localmind.agent.list()
      setAgents(res.success && res.data?.length ? res.data.filter((agent) => agent.enabled) : fallbackAgents)
    } catch (err) {
      console.error('[AgentsPage] Failed to load agents:', err)
      setAgents(fallbackAgents)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? fallbackAgents[0],
    [agents, selectedAgentId]
  )

  useEffect(() => {
    let cancelled = false

    async function ensureConversation() {
      if (!selectedAgent || agentConversationIds[selectedAgent.id]) {
        if (selectedAgent && agentConversationIds[selectedAgent.id]) {
          await selectConversation(agentConversationIds[selectedAgent.id])
        }
        return
      }

      if (!window.localmind?.db?.createConversation) {
        setAgentConversationIds((prev) => ({ ...prev, [selectedAgent.id]: `preview-${selectedAgent.id}-${uuid()}` }))
        return
      }

      const id = await createConversation({
        modelId: undefined,
        provider: undefined,
        personaId: null,
      })
      if (cancelled) return
      setAgentConversationIds((prev) => ({ ...prev, [selectedAgent.id]: id }))
      await window.localmind?.db?.updateConversation?.(id, {
        title: `${selectedAgent.name} workspace`,
      })
    }

    ensureConversation()
    return () => {
      cancelled = true
    }
  }, [selectedAgent, agentConversationIds, createConversation, selectConversation])

  const conversationId = selectedAgent ? agentConversationIds[selectedAgent.id] : null

  return (
    <div className="flex h-full bg-background text-on-background">
      <aside className="w-72 shrink-0 border-r border-outline-variant bg-surface-container-lowest p-4">
        <div className="mb-6">
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Agents</p>
          <h2 className="mt-1 text-2xl font-black text-on-surface">Workspaces</h2>
        </div>

        <div className="space-y-2">
          {agents.map((agent) => {
            const active = selectedAgent?.id === agent.id
            return (
              <button
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${
                  active
                    ? 'border-primary-container bg-primary-container/15 text-on-surface'
                    : 'border-outline-variant bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[22px]">{agent.icon ?? 'smart_toy'}</span>
                  <span className="font-bold">{agent.name}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-on-surface-variant">
                  {agent.description}
                </p>
              </button>
            )
          })}
        </div>

        <div className="mt-6 rounded-xl border border-outline-variant bg-surface-container-low p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface">Tool access</p>
          <div className="mt-3 space-y-2 text-xs leading-5 text-on-surface-variant">
            <p>Glob, grep, read, write, npm scripts, MCP tools, and Skills.</p>
            <p>Delete is available only after a confirmation prompt.</p>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-outline-variant bg-surface-container-low/80 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-outline-variant bg-surface-container-high text-primary">
              <span className="material-symbols-outlined">{selectedAgent?.icon ?? 'smart_toy'}</span>
            </div>
            <div>
              <h1 className="text-lg font-black text-on-surface">{selectedAgent?.name}</h1>
              <p className="text-xs text-on-surface-variant">{selectedAgent?.category}</p>
            </div>
          </div>
          <button
            onClick={fetchAgents}
            disabled={loading}
            className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-xs font-bold text-on-surface-variant hover:text-on-surface disabled:opacity-50"
          >
            Refresh
          </button>
        </header>

        <section className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px]">
          <div className="relative flex min-w-0 flex-col">
            {conversationId ? (
              <>
                <MessageList conversationId={conversationId} />
                <ChatInput
                  conversationId={conversationId}
                  forcedAgent={selectedAgent}
                  compactTools={true}
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-on-surface-variant">
                Preparing agent workspace...
              </div>
            )}
          </div>

          <aside className="hidden border-l border-outline-variant bg-surface-container-lowest p-5 lg:block">
            <h3 className="text-sm font-black uppercase tracking-widest text-on-surface">Try</h3>
            <div className="mt-4 space-y-3">
              {(quickStarts[selectedAgent?.id ?? 'cowork'] ?? quickStarts.cowork).map((prompt) => (
                <div
                  key={prompt}
                  className="rounded-xl border border-outline-variant bg-surface-container-low p-3 text-sm leading-6 text-on-surface-variant"
                >
                  {prompt}
                </div>
              ))}
            </div>

            <h3 className="mt-8 text-sm font-black uppercase tracking-widest text-on-surface">Powers</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Glob', 'Grep', 'Read', 'Write', 'Delete', 'NPM', 'MCP', 'Skills'].map((item) => (
                <span key={item} className="rounded-full border border-outline-variant bg-surface-container px-2.5 py-1 text-xs font-bold text-on-surface-variant">
                  {item}
                </span>
              ))}
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}
