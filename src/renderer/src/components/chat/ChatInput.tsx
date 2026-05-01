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
  compactTools?: boolean
}

export function ChatInput({ conversationId, disabled = false, isLanding = false, forcedAgent = null, compactTools = false }: Props) {
  const [input, setInput] = useState('')
  const [showSkillLauncher, setShowSkillLauncher] = useState(false)
  const [attachedContexts, setAttachedContexts] = useState<AttachedContext[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fetchingUrl, setFetchingUrl] = useState(false)
  const [webSearchActive, setWebSearchActive] = useState(false)
  const [searching, setSearching] = useState(false)
  const [mcpServers, setMcpServers] = useState<{ id: string; name: string; status: string }[]>([])
  const [showMcpMenu, setShowMcpMenu] = useState(false)
  const [installedMcps, setInstalledMcps] = useState<{ id: string; name: string; enabled: boolean; config: any }[]>([])
  const [isCreatingConv, setIsCreatingConv] = useState(false)
  const mcpMenuRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isStreaming, addMessage, createConversation } = useChatStore()
  const conversations = useChatStore((state) => state.conversations)
  const { selectedModel } = useProviderStore()
  const { startStream, cancelStream } = useStreaming()
  const { webSearchEnabled } = useSettingsStore()
  const draftPersonaId = usePersonaStore((state) => state.draftPersonaId)

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

  // Fetch installed MCPs when menu opens
  useEffect(() => {
    if (!showMcpMenu) return
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
  }, [showMcpMenu])

  // Close MCP menu on outside click
  useEffect(() => {
    if (!showMcpMenu) return
    const handleClick = (e: MouseEvent) => {
      if (mcpMenuRef.current && !mcpMenuRef.current.contains(e.target as Node)) {
        setShowMcpMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMcpMenu])

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

    // Perform web search if active
    if (webSearchActive && webSearchEnabled) {
      setSearching(true)
      try {
        if (window.localmind?.websearch?.search) {
          const res = await window.localmind.websearch.search(content)
          if (res.success && res.results && res.results.length > 0) {
            const searchResults = res.results.map((r: any, i: number) =>
              `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`
            ).join('\n\n')
            finalContent = `Web search results for "${content}":\n\n${searchResults}\n\nUser query: ${finalContent}`
          }
        }
      } catch (err) {
        console.error('[WebSearch] Search failed', err)
      } finally {
        setSearching(false)
        setWebSearchActive(false)
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
      .map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      }))

    const request: LLMRequest = {
      messages: llmMessages,
      model: selectedModel?.id ?? 'qwen2.5:7b',
      provider: (selectedModel?.provider as any) ?? 'ollama',
      customProviderId: selectedModel?.customProviderId,
      agentId: forcedAgent?.id,
      personaId: personaIdForRequest ?? undefined,
      personaVariables: {
        model: selectedModel?.name ?? selectedModel?.id ?? 'qwen2.5:7b',
        provider: selectedModel?.provider ?? 'ollama',
      },
      stream: true,
    }

    await startStream(currentConvId, request)
  }, [input, isStreaming, conversationId, disabled, selectedModel, addMessage, startStream, attachedContexts, isLanding, createConversation, conversations, draftPersonaId, forcedAgent])

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
    ? 'w-full py-6 px-6'
    : 'absolute bottom-0 left-0 w-full bg-gradient-to-t from-background via-background to-transparent pt-10 pb-6 px-6 z-10'

  return (
    <div className={wrapperClass}>
      <div className="max-w-4xl mx-auto relative group">
        {/* Glow */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-secondary-container/50 to-primary-container/50 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>

        {/* Skill Launcher */}
        {showSkillLauncher && (
          <div className="absolute left-1/2 bottom-full z-50 mb-3 w-[min(720px,calc(100vw-2rem))] -translate-x-1/2">
            <SkillLauncher
              onSelect={(skill) => {
                setInput(`[${skill.name}] `)
                setShowSkillLauncher(false)
                textareaRef.current?.focus()
              }}
              onClose={() => {
                setShowSkillLauncher(false)
                if (input === '/') setInput('')
              }}
            />
          </div>
        )}

        <div className="relative bg-surface-container-low border border-surface-container-highest rounded-2xl p-2 shadow-lg focus-within:border-secondary/50 transition-colors duration-300 flex flex-col">

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
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={isInert ? (isLanding ? 'What can I help you with?' : 'Start a conversation first...') : 'Message LocalMind... Use @ to trigger skills, / for commands'}
            rows={1}
            className="w-full bg-transparent border-none text-on-surface placeholder:text-on-surface-variant/50 resize-none focus:ring-0 text-[16px] leading-relaxed px-3 py-2 min-h-[36px] max-h-[200px] overflow-y-auto"
            disabled={isInert || isCreatingConv}
          />

          {/* Bottom Toolbar */}
          <div className="flex items-center justify-between px-2 pb-1 pt-2 border-t border-surface-container-highest/50">
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
              {/* MCP + button */}
              <div className="relative" ref={mcpMenuRef}>
                <button
                  onClick={() => setShowMcpMenu((v) => !v)}
                  disabled={isStreaming || isInert}
                  className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                  title="MCP Servers"
                >
                  <span className="material-symbols-outlined text-[20px]">add</span>
                </button>
                {showMcpMenu && (
                  <div className="absolute bottom-full left-0 mb-2 w-64 bg-surface-container border border-outline-variant rounded-xl shadow-xl p-3 z-50">
                    <div className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                      MCP Servers
                    </div>
                    {installedMcps.length === 0 && (
                      <div className="text-[12px] text-on-surface-variant/70 py-2">
                        No MCP servers installed.
                      </div>
                    )}
                    <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                      {installedMcps.map((srv) => {
                        const isConnected = srv.enabled
                        return (
                          <div
                            key={srv.id}
                            className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-container-high transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`material-symbols-outlined text-[16px] ${isConnected ? 'text-emerald-400' : 'text-on-surface-variant/50'}`}>
                                extension
                              </span>
                              <span className="text-[13px] text-on-surface truncate">{srv.name}</span>
                            </div>
                            <button
                              onClick={() => toggleMcp(srv)}
                              className={`relative w-9 h-5 rounded-full transition-colors ${isConnected ? 'bg-emerald-500' : 'bg-surface-container-highest'}`}
                              title={isConnected ? 'Disable' : 'Enable'}
                            >
                              <span
                                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isConnected ? 'translate-x-4' : 'translate-x-0'}`}
                              />
                            </button>
                          </div>
                        )
                      })}
                    </div>
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
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming || isInert || uploading}
                className="p-2 rounded-lg text-on-surface-variant hover:text-secondary hover:bg-secondary/10 transition-colors disabled:opacity-40"
                title="Attach file"
              >
                <span className="material-symbols-outlined text-[20px]">attach_file</span>
              </button>
              <button
                onClick={() => setShowUrlInput(!showUrlInput)}
                disabled={isStreaming || isInert}
                className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                title="Fetch URL content"
              >
                <span className="material-symbols-outlined text-[20px]">link</span>
              </button>
              <div className="w-px h-4 bg-surface-container-highest mx-2"></div>
              <button
                onClick={() => setWebSearchActive(!webSearchActive)}
                disabled={!webSearchEnabled || searching}
                className={`px-2 py-1 rounded-md text-[12px] font-semibold flex items-center gap-1 transition-colors ${
                  webSearchActive && webSearchEnabled
                    ? 'bg-primary-container text-white border border-primary-container'
                    : 'bg-secondary/10 text-secondary border border-secondary/20 hover:bg-secondary/20'
                } disabled:opacity-40`}
              >
                <span className="material-symbols-outlined text-[14px]">{searching ? 'sync' : 'psychology'}</span>
                {searching ? 'Searching...' : '@WebSearch'}
              </button>
              {/* MCP status badge */}
              {mcpServers.length > 0 && (
                <div
                  className="px-2 py-1 rounded-md text-[12px] font-semibold flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  title={`${mcpServers.length} MCP server${mcpServers.length > 1 ? 's' : ''} connected`}
                >
                  <span className="material-symbols-outlined text-[14px]">extension</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]"></span>
                  {mcpServers.length} MCP
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

        <div className="text-center mt-3 text-[12px] text-on-surface-variant/60">
          LocalMind can make mistakes. Consider verifying important information.
        </div>
      </div>
    </div>
  )
}
