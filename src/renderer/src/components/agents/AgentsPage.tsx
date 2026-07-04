import { useCallback, useEffect, useMemo, useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { Agent } from '@shared/types/localmind-api'
import { useChatStore } from '../../stores/chatStore'
import { MessageList } from '../chat/MessageList'
import { ChatInput } from '../chat/ChatInput'
import { PageNavIcons } from '../ui/PageNavIcons'
import type { AppPage } from '../sidebar/Sidebar'
import { WorkspaceSwitcher } from '../workspaces/WorkspaceSwitcher'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { TraceHUD } from '../chat/TraceHUD'
import { WorkspaceStatusBar } from './WorkspaceStatusBar'
import { useProviderStore } from '../../stores/providerStore'

const fallbackAgents: Agent[] = [
  {
    id: 'personal-assistant',
    name: 'Personal Assistant',
    description: 'Your primary autonomous personal assistant. Connects to your workspaces, recalls memories, manages files, executes scripts, uses MCP servers, and tracks commitments.',
    systemPrompt: 'You are the LocalMind Personal Assistant, a local-first autonomous agent platform. You operate over the user\'s active workspace and local computer environment.',
    icon: 'smart_toy',
    category: 'Productivity',
    enabled: true,
    builtIn: true,
    createdAt: 0,
    updatedAt: 0,
  },
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
    description: 'A coding agent with repo map, file, glob, grep, patch, git, command approval, MCP, and skill tools.',
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
  'personal-assistant': [
    'How can you help me manage my local workspace and files?',
    'Search my mailbox or files for key information.',
    'Help me summarize my active commitments and reminders.',
  ],
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
  'personal-assistant': ['Workspace', 'Memory', 'Commitments', 'Email', 'Web Search', 'Tools'],
  cowork: ['Plan', 'Review', 'Debug', 'Test', 'Coordinate'],
  code: ['Repo Map', 'Glob', 'Grep', 'Patch', 'Git', 'Commands', 'MCP', 'Skills'],
}

const EMPTY_MESSAGES: never[] = []

interface Props {
  currentPage: AppPage
  onNavigate: (page: AppPage) => void
}

export function AgentsPage({ currentPage, onNavigate }: Props) {
  const [agents, setAgents] = useState<Agent[]>(fallbackAgents)
  const [selectedAgentId, setSelectedAgentId] = useState('personal-assistant')
  const [agentConversationIds, setAgentConversationIds] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [showTracePanel, setShowTracePanel] = useState(true)
  const [planningEnabled, setPlanningEnabled] = useState(true)
  
  const { availableModels, selectedModel, setModel } = useProviderStore()
  const [modelSearch, setModelSearch] = useState('')

  const filteredModels = useMemo(() => {
    return availableModels.filter(
      (m) =>
        m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.id.toLowerCase().includes(modelSearch.toLowerCase())
    )
  }, [availableModels, modelSearch])
  
  const { createConversation, selectConversation } = useChatStore()
  const { workspaces, activeWorkspaceId, setActiveWorkspace, loadWorkspaces } = useWorkspaceStore()

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const activeWorkspacePath = activeWorkspace?.rootPath ?? null

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
    loadWorkspaces()
  }, [fetchAgents, loadWorkspaces])

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

  return (
    <div className="flex h-full min-h-0 bg-background text-on-background">
      <aside className="w-72 shrink-0 overflow-visible border-r border-outline-variant bg-surface-container-lowest p-4 flex flex-col justify-between h-full z-20">
        <div className="space-y-6">
          {/* Static Inline Model Selection Box (Contains 4 models, scrollable, does not exceed height) */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70">Select Model</p>
            <div className="bg-[#0b0c10]/20 border border-outline-variant/30 rounded-xl p-2.5 space-y-2 relative z-30">
              {/* Search Box inside Container */}
              <div className="relative">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/50 text-[14px]">search</span>
                <input
                  type="text"
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder="Search models..."
                  className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg py-1 pl-7 pr-3 text-[11px] text-on-surface outline-none focus:border-primary-container transition-colors placeholder:text-on-surface-variant/40"
                />
              </div>

              {/* Scrollable list of models (Exactly 4 items high: 4 * 37px = 148px) */}
              <div className="h-[148px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                {filteredModels.map((model) => {
                  const active = selectedModel?.id === model.id && selectedModel?.customProviderId === model.customProviderId
                  return (
                    <button
                      key={`${model.provider}-${model.customProviderId ?? ''}-${model.id}`}
                      onClick={() => setModel(model)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-all flex items-center justify-between ${
                        active
                          ? 'bg-primary-container/20 text-primary border border-primary-container/30 font-semibold'
                          : 'hover:bg-surface-container border border-transparent text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold truncate leading-tight">{model.name}</div>
                        <div className="text-[9px] text-on-surface-variant/60 uppercase tracking-wide leading-none mt-0.5">{model.provider}</div>
                      </div>
                      {active && (
                        <span className="material-symbols-outlined text-[13px] text-primary shrink-0">check</span>
                      )}
                    </button>
                  )
                })}
                {filteredModels.length === 0 && (
                  <div className="text-[11px] text-on-surface-variant/40 text-center py-6">No models found</div>
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-outline-variant/30"></div>

          {/* Compact Agent Pallets (PA, Cowork, Code) */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70 mb-1.5">Workspace Agent</p>
            {agents.map((agent) => {
              const active = selectedAgent?.id === agent.id
              return (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`w-full rounded-xl border p-2.5 text-left transition-all flex items-center gap-3 ${
                    active
                      ? 'border-primary-container bg-primary-container/15 text-on-surface font-semibold shadow-sm'
                      : 'border-outline-variant bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">{agent.icon ?? 'smart_toy'}</span>
                  <span className="font-bold text-[13px]">{agent.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-outline-variant bg-surface-container-low p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface">Active Workspace</p>
          <div className="bg-[#0b0c10]/20 p-1.5 rounded-lg border border-[#1f2833]/30">
            <WorkspaceSwitcher
              activeWorkspaceId={activeWorkspaceId}
              onSwitch={(id) => setActiveWorkspace(id)}
            />
          </div>
          {activeWorkspacePath && (
            <div className="text-[10px] leading-relaxed text-on-surface-variant/70 font-mono bg-black/30 p-2.5 rounded-lg border border-outline-variant/10 break-all select-all">
              Path: {activeWorkspacePath}
            </div>
          )}
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPlanningEnabled((enabled) => !enabled)}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition-colors ${
                planningEnabled
                  ? 'border-primary-container bg-primary-container/15 text-primary'
                  : 'border-outline-variant bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
              title="Plan before using tools"
            >
              <span className="material-symbols-outlined text-[18px]">route</span>
              Planning {planningEnabled ? 'On' : 'Off'}
            </button>
            <button
              onClick={() => setShowTracePanel(!showTracePanel)}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors duration-200 cursor-pointer active:scale-95 ${
                showTracePanel ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
              title="Toggle Tool Trace Panel"
            >
              <span className="material-symbols-outlined text-[20px]">analytics</span>
            </button>
            <button
              onClick={fetchAgents}
              disabled={loading}
              className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-xs font-bold text-on-surface-variant hover:text-on-surface disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </header>

        {activeWorkspacePath && (
          <div className="flex h-9 shrink-0 items-center gap-2 overflow-x-auto border-b border-outline-variant bg-surface-container-lowest/60 px-6 scrollbar-thin">
            <WorkspaceStatusBar
              workspacePath={activeWorkspacePath}
              refreshToken={currentMessages.length}
            />
          </div>
        )}

        <section className="min-h-0 flex-1 flex overflow-hidden">
          <div className="relative flex-1 flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
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
                  planningEnabled={planningEnabled}
                  workspacePath={activeWorkspacePath ?? undefined}
                  compactTools={true}
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-on-surface-variant">
                Preparing agent workspace...
              </div>
            )}
          </div>
          {showTracePanel && conversationId && (
            <TraceHUD
              conversationId={conversationId}
              onClose={() => setShowTracePanel(false)}
            />
          )}
        </section>
      </main>
    </div>
  )
}
