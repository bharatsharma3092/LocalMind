import { useState, useCallback, useRef, useEffect } from 'react'
import { useConsensusStore } from '../../stores/consensusStore'
import { useProviderStore, type ModelInfo } from '../../stores/providerStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useChatStore } from '../../stores/chatStore'
import { PageNavIcons } from '../ui/PageNavIcons'
import type { AppPage } from '../sidebar/Sidebar'

interface Props {
  currentPage: AppPage
  onNavigate: (page: AppPage) => void
}

export function ConsensusPage({ currentPage, onNavigate }: Props) {
  const {
    selectedModels,
    synthesizerModel,
    isRunning,
    candidateResponses,
    synthesizedAnswer,
    query,
    addModel,
    removeModel,
    setSynthesizer,
    setQuery,
    setRunning,
    setCandidates,
    appendSynthesis,
    setStreamId,
    setConversationId,
    reset,
  } = useConsensusStore()

  const { availableModels } = useProviderStore()
  const { webSearchEnabled } = useSettingsStore()
  const { createConversation, addMessage } = useChatStore()

  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showSynthPicker, setShowSynthPicker] = useState(false)
  const [activeTab, setActiveTab] = useState<'synthesis' | number>('synthesis')
  const [modelSearch, setModelSearch] = useState('')
  const [synthSearch, setSynthSearch] = useState('')
  const [webSearchActive, setWebSearchActive] = useState(false)
  const [searching, setSearching] = useState(false)
  const modelPickerRef = useRef<HTMLDivElement>(null)
  const synthPickerRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // Fresh session every time consensus page mounts
  useEffect(() => {
    reset()
    setQuery('')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false)
      }
      if (synthPickerRef.current && !synthPickerRef.current.contains(e.target as Node)) {
        setShowSynthPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filteredModels = availableModels.filter(
    (m) =>
      !selectedModels.some((s) => s.id === m.id && s.provider === m.provider) &&
      (m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.id.toLowerCase().includes(modelSearch.toLowerCase()))
  )

  const filteredSynthModels = availableModels.filter(
    (m) =>
      m.name.toLowerCase().includes(synthSearch.toLowerCase()) ||
      m.id.toLowerCase().includes(synthSearch.toLowerCase())
  )

  const runConsensus = useCallback(async () => {
    if (!query.trim() || selectedModels.length < 2 || !synthesizerModel) return

    reset()
    setRunning(true)
    setCandidates(
      selectedModels.map((m) => ({
        model: m.id,
        provider: m.provider,
        status: 'pending',
        text: '',
      }))
    )

    // Create conversation for saving
    let convId: string | null = null
    try {
      convId = await createConversation()
      setConversationId(convId)
      const modelNames = selectedModels.map((m) => m.name).join(', ')
      await window.localmind.db.updateConversation(convId, {
        title: `Consensus: ${query.trim().slice(0, 50)}${query.trim().length > 50 ? '...' : ''}`,
      })
      // Save user query as a message
      await addMessage({
        conversationId: convId,
        role: 'user',
        content: `[Consensus Query — Models: ${modelNames}]\n\n${query.trim()}`,
      })
    } catch (err) {
      console.error('[ConsensusPage] Failed to create conversation:', err)
    }

    // Web search enrichment
    let enrichedQuery = query.trim()
    if (webSearchActive && webSearchEnabled) {
      setSearching(true)
      try {
        if (window.localmind?.websearch?.search) {
          const res = await window.localmind.websearch.search(query.trim())
          const searchData = res.data ?? res
          if (searchData.success && searchData.results && searchData.results.length > 0) {
            const searchResults = searchData.results.map((r: any, i: number) =>
              `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`
            ).join('\n\n')
            enrichedQuery = `Web search results for "${query.trim()}":\n\n${searchResults}\n\nUser question: ${query.trim()}`
          }
        }
      } catch (err) {
        console.error('[ConsensusPage] Web search failed:', err)
      } finally {
        setSearching(false)
      }
    }

    try {
      const res = await window.localmind.llm.consensus({
        query: enrichedQuery,
        models: selectedModels.map((m) => ({
          provider: m.provider,
          model: m.id,
          customProviderId: m.customProviderId,
        })),
        synthesizer: {
          provider: synthesizerModel.provider,
          model: synthesizerModel.id,
          customProviderId: synthesizerModel.customProviderId,
        },
      })

      if (!res.success || !res.data?.streamId) {
        throw new Error(res.error ?? 'Failed to start consensus')
      }

      const streamId = res.data.streamId
      setStreamId(streamId)

      let fullSynthesis = ''

      const chunkCleanup = window.localmind.llm.onChunk(streamId, (chunk) => {
        if (chunk.type === 'text' && chunk.content) {
          const candidateMatch = chunk.content.match(/<!--CANDIDATES_JSON:(.*?)-->/)
          if (candidateMatch) {
            try {
              const candidates = JSON.parse(candidateMatch[1])
              setCandidates(
                candidates.map((c: any) => ({
                  model: c.model,
                  provider: c.provider,
                  status: c.text.startsWith('[Error') ? 'error' : 'done',
                  text: c.text,
                  error: c.text.startsWith('[Error') ? c.text : undefined,
                }))
              )
            } catch { /* ignore parse errors */ }
            const cleaned = chunk.content.replace(/<!--CANDIDATES_JSON:.*?-->\n?\n?/, '')
            if (cleaned) {
              appendSynthesis(cleaned)
              fullSynthesis += cleaned
            }
          } else {
            appendSynthesis(chunk.content)
            fullSynthesis += chunk.content
          }
        }
      })

      const doneCleanup = window.localmind.llm.onDone(streamId, async () => {
        setRunning(false)
        chunkCleanup()
        doneCleanup()
        errorCleanup()

        // Save synthesized answer to conversation
        if (convId && fullSynthesis.trim()) {
          try {
            await addMessage({
              conversationId: convId,
              role: 'assistant',
              content: fullSynthesis.trim(),
            })
          } catch (err) {
            console.error('[ConsensusPage] Failed to save synthesis:', err)
          }
        }
      })

      const errorCleanup = window.localmind.llm.onError(streamId, (err) => {
        const errMsg = `\n\n**Error:** ${err}`
        appendSynthesis(errMsg)
        fullSynthesis += errMsg
        setRunning(false)
        chunkCleanup()
        doneCleanup()
        errorCleanup()
      })

      window.localmind.llm.signalReady(streamId)
    } catch (err: any) {
      appendSynthesis(`**Error:** ${err?.message ?? 'Consensus failed'}`)
      setRunning(false)
    }
  }, [query, selectedModels, synthesizerModel, reset, setRunning, setCandidates, appendSynthesis, setStreamId, setConversationId, createConversation, addMessage, webSearchActive, webSearchEnabled])

  const canRun = query.trim().length > 0 && selectedModels.length >= 2 && synthesizerModel !== null && !isRunning

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header with nav icons */}
      <header className="flex justify-between items-center w-full px-6 py-2 z-50 h-14 bg-surface-container-low/80 backdrop-blur-md border-b border-outline-variant shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">groups</span>
            <h1 className="text-[15px] font-bold text-on-surface">Consensus</h1>
          </div>
          <PageNavIcons currentPage={currentPage} onNavigate={onNavigate} />
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="text-[11px] px-2 py-1 rounded-full bg-primary-container/20 text-primary font-semibold animate-pulse">
              Running...
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {/* Model Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-semibold text-on-surface">Council Models (2-5)</label>
            <span className="text-[11px] text-on-surface-variant">{selectedModels.length}/5 selected</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedModels.map((model) => (
              <span
                key={`${model.provider}:${model.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-container border border-outline-variant rounded-lg text-[12px] text-on-surface"
              >
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span className="font-medium">{model.name}</span>
                <span className="text-on-surface-variant">({model.provider})</span>
                <button
                  onClick={() => removeModel(model.id)}
                  className="ml-1 text-on-surface-variant hover:text-error transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </span>
            ))}

            {selectedModels.length < 5 && (
              <div className="relative" ref={modelPickerRef}>
                <button
                  onClick={() => setShowModelPicker(!showModelPicker)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 border border-dashed border-outline-variant rounded-lg text-[12px] text-on-surface-variant hover:text-on-surface hover:border-secondary transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span>
                  Add Model
                </button>

                {showModelPicker && (
                  <div className="absolute top-full left-0 mt-2 w-72 bg-surface-container border border-outline-variant rounded-xl shadow-xl p-3 z-50 max-h-80 overflow-hidden flex flex-col">
                    <input
                      type="text"
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      placeholder="Search models..."
                      className="w-full bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2 text-[12px] text-on-surface outline-none focus:border-secondary mb-2"
                      autoFocus
                    />
                    <div className="overflow-y-auto flex-1 space-y-1">
                      {filteredModels.map((model) => (
                        <button
                          key={`${model.provider}:${model.id}`}
                          onClick={() => {
                            addModel(model)
                            setModelSearch('')
                            if (selectedModels.length >= 4) setShowModelPicker(false)
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-container-high transition-colors"
                        >
                          <div className="text-[12px] font-medium text-on-surface">{model.name}</div>
                          <div className="text-[11px] text-on-surface-variant">{model.provider}</div>
                        </button>
                      ))}
                      {filteredModels.length === 0 && (
                        <div className="text-[12px] text-on-surface-variant py-3 text-center">No models available</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Synthesizer Selection */}
        <div className="space-y-3">
          <label className="text-[13px] font-semibold text-on-surface">Synthesizer Model</label>
          <div className="relative" ref={synthPickerRef}>
            <button
              onClick={() => setShowSynthPicker(!showSynthPicker)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-surface-container border border-outline-variant rounded-lg text-[12px] hover:border-secondary transition-colors"
            >
              {synthesizerModel ? (
                <span className="text-on-surface font-medium">
                  {synthesizerModel.name} <span className="text-on-surface-variant">({synthesizerModel.provider})</span>
                </span>
              ) : (
                <span className="text-on-surface-variant">Select synthesizer model...</span>
              )}
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">expand_more</span>
            </button>

            {showSynthPicker && (
              <div className="absolute top-full left-0 mt-2 w-full bg-surface-container border border-outline-variant rounded-xl shadow-xl p-3 z-50 max-h-64 overflow-hidden flex flex-col">
                <input
                  type="text"
                  value={synthSearch}
                  onChange={(e) => setSynthSearch(e.target.value)}
                  placeholder="Search models..."
                  className="w-full bg-surface-container-high border border-outline-variant rounded-lg px-3 py-2 text-[12px] text-on-surface outline-none focus:border-secondary mb-2"
                  autoFocus
                />
                <div className="overflow-y-auto flex-1 space-y-1">
                  {filteredSynthModels.map((model) => (
                    <button
                      key={`${model.provider}:${model.id}`}
                      onClick={() => {
                        setSynthesizer(model)
                        setShowSynthPicker(false)
                        setSynthSearch('')
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-container-high transition-colors"
                    >
                      <div className="text-[12px] font-medium text-on-surface">{model.name}</div>
                      <div className="text-[11px] text-on-surface-variant">{model.provider}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-outline-variant/50"></div>

        {/* Query Input */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-semibold text-on-surface">Query</label>
            <button
              onClick={() => setWebSearchActive(!webSearchActive)}
              disabled={!webSearchEnabled || searching}
              className={`px-2 py-1 rounded-md text-[12px] font-semibold flex items-center gap-1 transition-colors ${
                webSearchActive && webSearchEnabled
                  ? 'bg-primary-container text-white border border-primary-container'
                  : 'bg-secondary/10 text-secondary border border-secondary/20 hover:bg-secondary/20'
              } disabled:opacity-40`}
              title={!webSearchEnabled ? 'Enable web search in Settings' : ''}
            >
              <span className="material-symbols-outlined text-[14px]">{searching ? 'sync' : 'travel_explore'}</span>
              {searching ? 'Searching...' : '@WebSearch'}
            </button>
          </div>
          <div className="relative">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question to the model council..."
              rows={3}
              disabled={isRunning}
              className="w-full bg-surface-container border border-outline-variant rounded-xl px-4 py-3 text-[14px] text-on-surface placeholder:text-on-surface-variant/50 resize-y min-h-[80px] max-h-[200px] outline-none focus:border-secondary transition-colors disabled:opacity-60"
            />
            <button
              onClick={runConsensus}
              disabled={!canRun}
              className="absolute right-3 bottom-3 px-4 py-2 bg-primary-container text-white rounded-lg text-[12px] font-semibold hover:bg-primary-container/80 disabled:opacity-40 transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">
                {isRunning ? 'hourglass_top' : 'play_arrow'}
              </span>
              {isRunning ? 'Running...' : 'Run Consensus'}
            </button>
          </div>
        </div>

        {/* Results */}
        {(candidateResponses.length > 0 || synthesizedAnswer) && (
          <div className="space-y-4" ref={resultsRef}>
            <div className="border-t border-outline-variant/50"></div>

            {/* Model Response Tabs */}
            {candidateResponses.length > 0 && (
              <div className="space-y-3">
                <label className="text-[13px] font-semibold text-on-surface">Model Responses</label>
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={() => setActiveTab('synthesis')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                      activeTab === 'synthesis'
                        ? 'bg-primary-container text-white'
                        : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    Synthesis
                  </button>
                  {candidateResponses.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveTab(i)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1.5 ${
                        activeTab === i
                          ? 'bg-secondary text-on-secondary'
                          : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        c.status === 'done' ? 'bg-green-500' :
                        c.status === 'error' ? 'bg-red-500' :
                        'bg-amber-500 animate-pulse'
                      }`}></span>
                      {c.model.split('/').pop()?.split(':')[0] ?? c.model}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                {activeTab !== 'synthesis' && typeof activeTab === 'number' && candidateResponses[activeTab] && (
                  <div className="bg-surface-container border border-outline-variant rounded-xl p-4 max-h-[300px] overflow-y-auto">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
                        {candidateResponses[activeTab].model} ({candidateResponses[activeTab].provider})
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        candidateResponses[activeTab].status === 'done' ? 'bg-green-500/10 text-green-500' :
                        candidateResponses[activeTab].status === 'error' ? 'bg-red-500/10 text-red-500' :
                        'bg-amber-500/10 text-amber-500'
                      }`}>
                        {candidateResponses[activeTab].status}
                      </span>
                    </div>
                    <div className="text-[13px] text-on-surface whitespace-pre-wrap leading-relaxed">
                      {candidateResponses[activeTab].text || 'Waiting for response...'}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Synthesized Answer */}
            {(activeTab === 'synthesis' || !candidateResponses.length) && synthesizedAnswer && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">auto_awesome</span>
                  <label className="text-[13px] font-semibold text-on-surface">Synthesized Consensus</label>
                  {isRunning && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary-container/20 text-primary font-semibold animate-pulse">
                      Synthesizing...
                    </span>
                  )}
                </div>
                <div className="bg-surface-container-low border border-primary-container/30 rounded-xl p-5 max-h-[500px] overflow-y-auto">
                  <div className="text-[13px] text-on-surface whitespace-pre-wrap leading-relaxed prose prose-sm max-w-none">
                    {synthesizedAnswer}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
