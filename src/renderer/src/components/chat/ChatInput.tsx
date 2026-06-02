import { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useProviderStore } from '../../stores/providerStore'
import { useStreaming } from '../../hooks/useStreaming'
import { useSettingsStore } from '../../stores/settingsStore'
import { usePersonaStore } from '../../stores/personaStore'
import { PersonaPicker } from '../personas/PersonaPicker'
import { SkillLauncher } from '../skills/SkillLauncher'
import type { LLMRequest } from '@shared/types/localmind-api'
import type { Agent } from '@shared/types/localmind-api'

const log = {
  info:  (fn: string, msg: string, data?: unknown) => console.log(`[ChatInput][${fn}] ${msg}`, data !== undefined ? data : ''),
  warn:  (fn: string, msg: string, data?: unknown) => console.warn(`[ChatInput][${fn}] [WARN] ${msg}`, data !== undefined ? data : ''),
  error: (fn: string, msg: string, data?: unknown) => console.error(`[ChatInput][${fn}] [ERROR] ${msg}`, data !== undefined ? data : ''),
}

let sessionWebSearchActive = false


interface AttachedContext {
  id: string
  type: 'file' | 'url'
  name: string
  content: string
}

interface Props {
  conversationId: string
  disabled?: boolean
  isLanding?: boolean
  forcedAgent?: Agent | null
  planningEnabled?: boolean
  workspacePath?: string | null
  compactTools?: boolean
}

export function ChatInput({ conversationId, disabled = false, isLanding = false, forcedAgent = null, planningEnabled = false, workspacePath = null, compactTools = false }: Props) {
  const [input, setInput] = useState('')
  const [showSkillLauncher, setShowSkillLauncher] = useState(false)
  const [showSkillCreator, setShowSkillCreator] = useState(false)
  const [skillDraft, setSkillDraft] = useState({ name: '', description: '', systemPrompt: '' })
  const [creatingSkill, setCreatingSkill] = useState(false)
  const [attachedContexts, setAttachedContexts] = useState<AttachedContext[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fetchingUrl, setFetchingUrl] = useState(false)
  const [webSearchActive, setWebSearchActive] = useState(sessionWebSearchActive)
  const [searching, setSearching] = useState(false)
  const [autoRefinePrompt, setAutoRefinePrompt] = useState(false)
  const [refiningPrompt, setRefiningPrompt] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [mcpServers, setMcpServers] = useState<{ id: string; name: string; status: string }[]>([])
  const [installedMcps, setInstalledMcps] = useState<{ id: string; name: string; enabled: boolean; config: any }[]>([])
  const [isCreatingConv, setIsCreatingConv] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const plusMenuRef = useRef<HTMLDivElement>(null)
  const { isStreaming, addMessage, createConversation } = useChatStore()
  const conversations = useChatStore((state) => state.conversations)
  const { selectedModel } = useProviderStore()
  const { startStream, cancelStream } = useStreaming()
  const { webSearchEnabled } = useSettingsStore()
  const draftPersonaId = usePersonaStore((state) => state.draftPersonaId)

  const toggleWebSearch = useCallback(() => {
    setWebSearchActive((active) => {
      const next = !active
      sessionWebSearchActive = next
      return next
    })
  }, [])


  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.rows = 1
    textarea.style.height = 'auto'
    const newHeight = Math.min(textarea.scrollHeight, 200)
    textarea.style.height = `${newHeight}px`
    if (newHeight > 40) {
      textarea.rows = Math.floor(newHeight / 20)
    }
  }, [input])


  // Poll MCP server status
  useEffect(() => {
    const fetchMcpStatus = async () => {
      try {
        if (!window.localmind?.mcp?.serverStatus) return
        const res = await window.localmind.mcp.serverStatus()
        if (res.success && res.data) {
          setMcpServers(res.data.filter((s: any) => s.status === 'connected'))
        }
      } catch {
        // Ignore MCP errors
      }
    }
    fetchMcpStatus()
    const interval = setInterval(fetchMcpStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  // Fetch installed MCPs when plus menu opens
  useEffect(() => {
    if (!showPlusMenu) return
    const fetchInstalled = async () => {
      try {
        if (!window.localmind?.mcp?.listSaved) return
        const res = await window.localmind.mcp.listSaved()
        if (res.success && res.data) {
          setInstalledMcps(res.data)
        }
      } catch {
        // Ignore
      }
    }
    fetchInstalled()
  }, [showPlusMenu])

  // Close plus menu on outside click
  useEffect(() => {
    if (!showPlusMenu) return
    const handleClick = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setShowPlusMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPlusMenu])

  const toggleMcp = useCallback(async (server: { id: string; name: string; enabled: boolean; config: any }) => {
    const nextEnabled = !server.enabled
    // Optimistic UI: flip immediately
    setInstalledMcps((prev) =>
      prev.map((s) => (s.id === server.id ? { ...s, enabled: nextEnabled } : s))
    )
    setMcpServers((prev) => {
      if (nextEnabled) {
        return prev.some((s) => s.id === server.id)
          ? prev
          : [...prev, { id: server.id, name: server.name, status: 'connected' }]
      } else {
        return prev.filter((s) => s.id !== server.id)
      }
    })
    try {
      if (server.enabled) {
        await window.localmind?.mcp?.disconnect(server.id)
      } else {
        await window.localmind?.mcp?.connect(server.config)
      }
    } catch (err: any) {
      log.error('toggleMcp', 'Failed to toggle MCP', err?.message)
      // Revert on failure
      setInstalledMcps((prev) =>
        prev.map((s) => (s.id === server.id ? { ...s, enabled: server.enabled } : s))
      )
      setMcpServers((prev) => {
        if (server.enabled) {
          return prev.some((s) => s.id === server.id)
            ? prev
            : [...prev, { id: server.id, name: server.name, status: 'connected' }]
        } else {
          return prev.filter((s) => s.id !== server.id)
        }
      })
    }
  }, [])

  const handleFileUpload = useCallback(async (filePath: string) => {
    setUploading(true)
    try {
      if (!window.localmind?.file?.upload) return
      const res = await window.localmind.file.upload({ path: filePath })
      if (res.success && res.data) {
        let content = res.data.text
        if (res.data.isImage && res.data.mimeType) {
          content = `[Image: ${res.data.filename}]\n[data:${res.data.mimeType};base64,${res.data.text}]`
        }
        const ctx: AttachedContext = {
          id: `file_${Date.now()}`,
          type: 'file',
          name: res.data.filename,
          content,
        }
        setAttachedContexts((prev) => [...prev, ctx])
      }
    } catch (err: any) {
      log.error('handleFileUpload', 'Upload failed', err?.message)
    } finally {
      setUploading(false)
    }
  }, [])

  const handleUrlFetch = useCallback(async () => {
    const url = urlInput.trim()
    if (!url) return
    setFetchingUrl(true)
    try {
      if (!window.localmind?.url?.fetch) return
      const res = await window.localmind.url.fetch(url)
      if (res.success && res.data) {
        const ctx: AttachedContext = {
          id: `url_${Date.now()}`,
          type: 'url',
          name: url,
          content: res.data,
        }
        setAttachedContexts((prev) => [...prev, ctx])
        setUrlInput('')
        setShowUrlInput(false)
      }
    } catch (err: any) {
      log.error('handleUrlFetch', 'URL fetch failed', err?.message)
    } finally {
      setFetchingUrl(false)
    }
  }, [urlInput])

  const removeContext = useCallback((id: string) => {
    setAttachedContexts((prev) => prev.filter((c) => c.id !== id))
  }, [])


  const createSkillFromTextbox = useCallback(async () => {
    const name = skillDraft.name.trim()
    const systemPrompt = skillDraft.systemPrompt.trim()
    if (!name || !systemPrompt) return
    setCreatingSkill(true)
    try {
      const id = `user.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || Date.now()}`
      await window.localmind?.skill?.create?.({
        id,
        name,
        description: skillDraft.description.trim() || `Custom skill: ${name}`,
        category: 'User',
        author: 'You',
        version: '1.0.0',
        icon: 'auto_awesome',
        systemPrompt,
      })
      setInput((prev) => `${prev}${prev.trim() ? ' ' : ''}[${name}] `)
      setSkillDraft({ name: '', description: '', systemPrompt: '' })
      setShowSkillCreator(false)
      textareaRef.current?.focus()
    } finally {
      setCreatingSkill(false)
    }
  }, [skillDraft])

  const handleSend = useCallback(async () => {
    let currentConvId = conversationId
    let personaIdForRequest = conversations.find((conversation) => conversation.id === currentConvId)?.personaId ?? draftPersonaId ?? null
    const content = input.trim()
    if ((!content && attachedContexts.length === 0) || isStreaming) {
      return
    }

    // In landing mode with no conversation, create one on-the-fly
    if (!currentConvId && isLanding) {
      setIsCreatingConv(true)
      currentConvId = await createConversation({ personaId: draftPersonaId ?? null })
      setIsCreatingConv(false)
      if (!currentConvId) return
      personaIdForRequest = draftPersonaId ?? null
    }

    if (!currentConvId || disabled) {
      return
    }

    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.rows = 1
    }

    let finalContent = content
    if (attachedContexts.length > 0) {
      const contextParts = attachedContexts.map((ctx) => {
        const label = ctx.type === 'file' ? `File: ${ctx.name}` : `URL: ${ctx.name}`
        return `[${label}]\n${ctx.content}`
      })
      finalContent = [...contextParts, content].filter(Boolean).join('\n\n')
      setAttachedContexts([])
    }

    if (autoRefinePrompt && finalContent.trim()) {
      setRefiningPrompt(true)
      try {
        const res = await window.localmind?.llm?.refinePrompt?.({
          prompt: finalContent,
          messages: [],
          model: selectedModel?.id ?? 'qwen2.5:7b',
          provider: (selectedModel?.provider as any) ?? 'ollama',
          customProviderId: selectedModel?.customProviderId,
          stream: false,
        } as any)
        if (res?.success && res.data?.trim()) {
          finalContent = res.data.trim()
        }
      } catch (err: any) {
        log.warn('handleSend', 'Prompt refinement failed; sending original prompt', err?.message)
      } finally {
        setRefiningPrompt(false)
      }
    }

    // Perform web search if active
    if (webSearchActive && webSearchEnabled) {
      setSearching(true)
      try {
        if (window.localmind?.websearch?.search) {
          const res = await window.localmind.websearch.search(content)
          const searchData = res.data ?? res
          if (searchData.success && searchData.results && searchData.results.length > 0) {
            const searchResults = searchData.results.map((r: any, i: number) =>
              `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`
            ).join('\n\n')
            finalContent = `Web search results for "${content}":\n\n${searchResults}\n\nUser query: ${finalContent}`
          } else if (!searchData.success) {
            finalContent = `Web search failed for "${content}": ${searchData.error ?? 'Unknown error'}\n\nUser query: ${finalContent}`
          }
        }
      } catch (err) {
        console.error('[WebSearch] Search failed', err)
      } finally {
        setSearching(false)
      }
    }

    const userMsg = await addMessage({
      conversationId: currentConvId,
      role: 'user',
      content: finalContent,
    })

    const allMessages = useChatStore.getState().messages[currentConvId] ?? []
    const llmMessages = allMessages
      .filter((m) => !m.isStreaming)
      .map((m) => {
        const msg: any = {
          role: m.role,
          content: m.content,
        }
        if (m.toolCalls) msg.toolCalls = m.toolCalls
        if (m.toolCallId) msg.toolCallId = m.toolCallId
        return msg
      })

    const request: LLMRequest = {
      messages: llmMessages,
      model: selectedModel?.id ?? 'qwen2.5:7b',
      provider: (selectedModel?.provider as any) ?? 'ollama',
      customProviderId: selectedModel?.customProviderId,
      agentId: forcedAgent?.id,
      conversationId: currentConvId,
      planningEnabled: !!forcedAgent && planningEnabled,
      workspacePath: workspacePath ?? undefined,
      personaId: personaIdForRequest ?? undefined,
      personaVariables: {
        model: selectedModel?.name ?? selectedModel?.id ?? 'qwen2.5:7b',
        provider: selectedModel?.provider ?? 'ollama',
      },
      stream: true,
    }

    await startStream(currentConvId, request)
  }, [input, isStreaming, conversationId, disabled, selectedModel, addMessage, startStream, attachedContexts, isLanding, createConversation, conversations, draftPersonaId, forcedAgent, planningEnabled, workspacePath, autoRefinePrompt, webSearchActive, webSearchEnabled])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInput(value)
    if (value === '/') {
      setShowSkillLauncher(true)
    } else if (showSkillLauncher && !value.startsWith('/')) {
      setShowSkillLauncher(false)
    }
    const textarea = e.target
    textarea.rows = 1
    textarea.style.height = 'auto'
    const newHeight = Math.min(textarea.scrollHeight, 200)
    textarea.style.height = `${newHeight}px`
    if (newHeight > 40) {
      textarea.rows = Math.floor(newHeight / 20)
    }
  }

  const isInert = isStreaming || (!isLanding && disabled)

  const wrapperClass = isLanding
    ? 'w-full py-4 px-4'
    : 'absolute bottom-0 left-0 w-full bg-gradient-to-t from-background via-background to-transparent pt-8 pb-4 px-4 z-10'

  return (
    <div className={wrapperClass}>
      <div className="max-w-5xl mx-auto relative group">
        {/* Glow */}
        <div className="absolute -inset-0.5 bg-primary/15 rounded-2xl blur opacity-0 group-focus-within:opacity-40 transition duration-300"></div>

        {/* Skill Launcher */}
        {showSkillLauncher && (
          <div className="absolute left-1/2 bottom-full z-50 mb-3 w-[calc(100vw-2rem)] max-w-[720px] -translate-x-1/2">
            <SkillLauncher
              onSelect={(skill) => {
                setInput(`[${skill.name}] `)
                setShowSkillLauncher(false)
                textareaRef.current?.focus()
              }}
              onCreateSkill={() => {
                setShowSkillLauncher(false)
                setShowSkillCreator(true)
              }}
              onClose={() => {
                setShowSkillLauncher(false)
                if (input === '/') setInput('')
              }}
            />
          </div>
        )}

        {showSkillCreator && (
          <div className="absolute left-1/2 bottom-full z-50 mb-3 w-[calc(100vw-2rem)] max-w-[620px] -translate-x-1/2 rounded-2xl border border-outline-variant bg-surface-container-low p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-on-surface">Create Skill</p>
                <p className="text-xs text-on-surface-variant">Add a reusable instruction directly from the textbox.</p>
              </div>
              <button onClick={() => setShowSkillCreator(false)} className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container hover:text-on-surface">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="grid gap-3">
              <input
                value={skillDraft.name}
                onChange={(e) => setSkillDraft((draft) => ({ ...draft, name: e.target.value }))}
                placeholder="Skill name"
                className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
              />
              <input
                value={skillDraft.description}
                onChange={(e) => setSkillDraft((draft) => ({ ...draft, description: e.target.value }))}
                placeholder="Short description"
                className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
              />
              <textarea
                value={skillDraft.systemPrompt}
                onChange={(e) => setSkillDraft((draft) => ({ ...draft, systemPrompt: e.target.value }))}
                placeholder="System prompt for this skill"
                rows={4}
                className="resize-y rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
              />
              <button
                onClick={createSkillFromTextbox}
                disabled={creatingSkill || !skillDraft.name.trim() || !skillDraft.systemPrompt.trim()}
                className="rounded-lg bg-primary-container px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover disabled:opacity-40"
              >
                {creatingSkill ? 'Creating...' : 'Create Skill'}
              </button>
            </div>
          </div>
        )}

        <div className="relative bg-surface-container-low border border-outline-variant/70 rounded-2xl p-2 shadow-sm focus-within:border-secondary/60 transition-colors duration-300 flex flex-col">

          {/* Attached contexts */}
          {attachedContexts.length > 0 && (
            <div className="px-3 pt-2 flex flex-wrap gap-2">
              {attachedContexts.map((ctx) => (
                <span
                  key={ctx.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-container border border-outline-variant rounded-lg text-[12px] text-on-surface"
                >
                  <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
                    {ctx.type === 'file' ? 'description' : 'link'}
                  </span>
                  <span className="max-w-32 truncate">{ctx.name}</span>
                  <button
                    onClick={() => removeContext(ctx.id)}
                    className="text-on-surface-variant hover:text-error"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* URL input */}
          {showUrlInput && (
            <div className="px-3 pt-2 flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUrlFetch()}
                placeholder="https://example.com"
                className="flex-1 bg-surface-container border border-outline-variant rounded-lg px-3 py-1.5 text-sm text-on-surface outline-none focus:border-secondary"
                autoFocus
              />
              <button
                onClick={handleUrlFetch}
                disabled={fetchingUrl || !urlInput.trim()}
                className="px-3 py-1.5 bg-secondary text-on-secondary rounded-lg text-xs font-semibold hover:bg-secondary/90 disabled:opacity-40"
              >
                {fetchingUrl ? 'Fetching...' : 'Add'}
              </button>
              <button
                onClick={() => { setShowUrlInput(false); setUrlInput('') }}
                className="px-2 py-1.5 text-on-surface-variant hover:text-on-surface text-xs"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Textarea */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={isInert ? (isLanding ? 'What can I help you with?' : 'Start a conversation first...') : 'Message LocalMind... Use / to trigger skills and, @ for commands'}
              rows={1}
              className="w-full bg-transparent border-none text-on-surface placeholder:text-on-surface-variant/55 resize-none focus:ring-0 text-[15px] leading-6 pl-3 pr-12 py-2 min-h-[34px] max-h-[180px] overflow-y-auto"
              disabled={isInert || isCreatingConv}
            />
          </div>

          {/* Bottom Toolbar */}
          <div className="flex items-center justify-between px-2 pb-1 pt-1.5 border-t border-surface-container-highest/50">
            <div className="flex items-center gap-1 relative">
              {!compactTools && (
                <>
                  <PersonaPicker
                    conversationId={conversationId || null}
                    onManagePersonas={() => {
                        window.dispatchEvent(new CustomEvent('localmind:open-settings-tab', { detail: 'personas' }))
                    }}
                  />
                  <div className="w-px h-4 bg-surface-container-highest mx-2"></div>
                </>
              )}

              {/* Unified + button with sectioned popup */}
              <div className="relative" ref={plusMenuRef}>
                <button
                  onClick={() => setShowPlusMenu((v) => !v)}
                  disabled={isStreaming || isInert}
                  className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                  title="Attach & Tools"
                >
                  <span className="material-symbols-outlined text-[20px]">add</span>
                </button>
                {showPlusMenu && (
                  <div className="absolute bottom-full left-0 mb-2 w-72 bg-surface-container border border-outline-variant rounded-xl shadow-xl p-3 z-50">
                    {/* MCP Servers Section */}
                    <div className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                      MCP Servers
                    </div>
                    {installedMcps.length === 0 ? (
                      <div className="text-[12px] text-on-surface-variant/70 py-1 mb-2">No MCP servers installed.</div>
                    ) : (
                      <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto mb-2">
                        {installedMcps.map((srv) => {
                          const isConnected = srv.enabled
                          return (
                            <div
                              key={srv.id}
                              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-container-high transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`material-symbols-outlined text-[16px] ${isConnected ? 'text-emerald-400' : 'text-on-surface-variant/50'}`}>extension</span>
                                <span className="text-[12px] text-on-surface truncate">{srv.name}</span>
                              </div>
                              <button
                                onClick={() => toggleMcp(srv)}
                                className={`relative w-8 h-4 rounded-full transition-colors ${isConnected ? 'bg-emerald-500' : 'bg-surface-container-highest'}`}
                              >
                                <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${isConnected ? 'translate-x-4' : 'translate-x-0'}`} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <div className="border-t border-outline-variant/50 my-2"></div>

                    {/* Attach Section */}
                    <div className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                      Attach
                    </div>
                    <button
                      onClick={() => { fileInputRef.current?.click(); setShowPlusMenu(false) }}
                      disabled={uploading}
                      className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-surface-container-high transition-colors text-left"
                    >
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">attach_file</span>
                      <span className="text-[12px] text-on-surface">File or Folder</span>
                    </button>

                    <div className="border-t border-outline-variant/50 my-2"></div>

                    {/* Fetch URL Section */}
                    <div className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                      Fetch
                    </div>
                    <button
                      onClick={() => { setShowUrlInput(true); setShowPlusMenu(false) }}
                      className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-surface-container-high transition-colors text-left"
                    >
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">link</span>
                      <span className="text-[12px] text-on-surface">URL</span>
                    </button>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    const filePath = window.localmind?.file?.getPathForFile(file)
                    if (filePath) await handleFileUpload(filePath)
                  }
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
              />

              <div className="w-px h-4 bg-surface-container-highest mx-2"></div>
              {/* Refine button (icon-only, neutral style) */}
              <button
                onClick={() => setAutoRefinePrompt((value) => !value)}
                disabled={isStreaming || isInert || refiningPrompt}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 ${
                  autoRefinePrompt
                    ? 'text-on-surface bg-surface-container-highest border border-outline'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border border-outline-variant/30'
                }`}
                title="Refine your message with the selected model before answering"
              >
                <span className={`material-symbols-outlined text-[16px] ${refiningPrompt ? 'animate-spin' : ''}`}>
                  {refiningPrompt ? 'sync' : 'auto_fix_high'}
                </span>
              </button>

              {/* WebSearch button (icon-only, standard globe logo) */}
              <button
                onClick={toggleWebSearch}
                disabled={!webSearchEnabled || searching}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  webSearchActive && webSearchEnabled
                    ? 'bg-primary-container text-white border border-primary-container'
                    : 'bg-secondary/10 text-secondary border border-secondary/20 hover:bg-secondary/20'
                } disabled:opacity-40`}
                title="Search the web for up-to-date information"
              >
                <span className={`material-symbols-outlined text-[16px] ${searching ? 'animate-spin' : ''}`}>
                  {searching ? 'sync' : 'language'}
                </span>
              </button>

              {/* MCP status badge (icon-only with a small active green pulsing indicator) */}
              {mcpServers.length > 0 && (
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center relative bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  title={`${mcpServers.length} MCP server${mcpServers.length > 1 ? 's' : ''} connected (Active)`}
                >
                  <span className="material-symbols-outlined text-[16px]">extension</span>
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-surface-container shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"></span>
                </div>
              )}
            </div>

            {isStreaming ? (
              <button
                onClick={cancelStream}
                className="w-10 h-10 rounded-xl bg-error text-on-error flex items-center justify-center hover:bg-error/90 active:scale-95 transition-all shadow-md"
              >
                <span className="material-symbols-outlined text-[18px]">stop</span>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={(!input.trim() && attachedContexts.length === 0) || isInert}
                className="w-10 h-10 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center hover:bg-primary-container/90 active:scale-95 transition-all shadow-md shadow-primary-container/20 disabled:opacity-40"
              >
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                  arrow_upward
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="text-center mt-2 text-[11px] text-on-surface-variant/60">
          LocalMind can make mistakes. Consider verifying important information.
        </div>
      </div>
    </div>
  )
}
