import { useCallback, useEffect, useMemo, useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { Agent } from '@shared/types/localmind-api'
import { useChatStore } from '../../stores/chatStore'
import { MessageList } from '../chat/MessageList'
import { ChatInput } from '../chat/ChatInput'
import { PageNavIcons } from '../ui/PageNavIcons'
import type { AppPage } from '../sidebar/Sidebar'

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

const agentPowers: Record<string, string[]> = {
  cowork: ['Plan', 'Review', 'Debug', 'Test', 'Coordinate'],
  code: ['Glob', 'Grep', 'Read', 'Write', 'Delete', 'NPM', 'MCP', 'Skills'],
}

const EMPTY_MESSAGES: never[] = []

interface Props {
  currentPage: AppPage
  onNavigate: (page: AppPage) => void
}

export function AgentsPage({ currentPage, onNavigate }: Props) {
  const [agents, setAgents] = useState<Agent[]>(fallbackAgents)
  const [selectedAgentId, setSelectedAgentId] = useState('cowork')
  const [agentConversationIds, setAgentConversationIds] = useState<Record<string, string>>({})
  const [workspacePath, setWorkspacePath] = useState<string | null>(null)
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
  const currentMessages = useChatStore((state) => conversationId ? state.messages[conversationId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES)
  const hasStartedConversation = currentMessages.length > 0
  const selectedQuickStarts = quickStarts[selectedAgent?.id ?? 'cowork'] ?? quickStarts.cowork
  const selectedPowers = agentPowers[selectedAgent?.id ?? 'cowork'] ?? agentPowers.cowork
  const selectFolder = async () => {
    const res = await window.localmind?.file?.selectFolder?.()
    if (res?.success && res.data) {
      setWorkspacePath(res.data)
    }
  }

  return (
    <div className="flex h-full min-h-0 bg-background text-on-background">
      <aside className="w-72 shrink-0 overflow-y-auto border-r border-outline-variant bg-surface-container-lowest p-4">
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
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface">Workspace folder</p>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-on-surface-variant">
            {workspacePath ?? 'No folder selected. Tools use the app workspace.'}
          </p>
          <button
            onClick={selectFolder}
            className="mt-3 w-full rounded-lg border border-primary-container/40 bg-primary-container/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary-container/20"
          >
            Select Folder
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-outline-variant bg-surface-container-low/80 backdrop-blur-md px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">{selectedAgent?.icon ?? 'smart_toy'}</span>
              <h1 className="text-[15px] font-bold text-on-surface">{selectedAgent?.name}</h1>
            </div>
            <PageNavIcons currentPage={currentPage} onNavigate={onNavigate} />
          </div>
          <button
            onClick={fetchAgents}
            disabled={loading}
            className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-xs font-bold text-on-surface-variant hover:text-on-surface disabled:opacity-50"
          >
            Refresh
          </button>
        </header>

        <section className="min-h-0 flex-1 overflow-hidden">
          <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            {conversationId ? (
              <>
                {hasStartedConversation ? (
                  <MessageList conversationId={conversationId} />
                ) : (
                  <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-8 pb-40 pt-8">
                    <div className="w-full max-w-3xl">
                      <p className="text-center text-sm text-on-surface-variant">Send a message to start the conversation</p>
                      <div className="mt-6 grid gap-3 md:grid-cols-3">
                        {selectedQuickStarts.map((prompt) => (
                          <div
                            key={prompt}
                            className="rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm leading-6 text-on-surface-variant"
                          >
                            {prompt}
                          </div>
                        ))}
                      </div>

                      <div className="mt-8 text-center">
                        <h3 className="text-sm font-black uppercase tracking-widest text-on-surface">Powers</h3>
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                          {selectedPowers.map((item) => (
                            <span key={item} className="rounded-full border border-outline-variant bg-surface-container px-2.5 py-1 text-xs font-bold text-on-surface-variant">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <ChatInput
                  conversationId={conversationId}
                  forcedAgent={selectedAgent}
                  workspacePath={workspacePath}
                  compactTools={true}
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-on-surface-variant">
                Preparing agent workspace...
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
