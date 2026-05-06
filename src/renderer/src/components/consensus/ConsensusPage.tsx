import { useState, useCallback, useRef, useEffect } from 'react'
import { useConsensusStore } from '../../stores/consensusStore'
import { useProviderStore, type ModelInfo } from '../../stores/providerStore'

export function ConsensusPage() {
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
    reset,
  } = useConsensusStore()

  const { availableModels } = useProviderStore()
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showSynthPicker, setShowSynthPicker] = useState(false)
  const [activeTab, setActiveTab] = useState<'synthesis' | number>('synthesis')
  const [modelSearch, setModelSearch] = useState('')
  const [synthSearch, setSynthSearch] = useState('')
  const modelPickerRef = useRef<HTMLDivElement>(null)
  const synthPickerRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

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

    try {
      const res = await window.localmind.llm.consensus({
        query: query.trim(),
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

      const chunkCleanup = window.localmind.llm.onChunk(streamId, (chunk) => {
        if (chunk.type === 'text' && chunk.content) {
          // Check for candidates metadata
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
            // Strip the metadata from displayed content
            const cleaned = chunk.content.replace(/<!--CANDIDATES_JSON:.*?-->\n?\n?/, '')
            if (cleaned) appendSynthesis(cleaned)
          } else {
            appendSynthesis(chunk.content)
          }
        }
      })

      const doneCleanup = window.localmind.llm.onDone(streamId, () => {
        setRunning(false)
        chunkCleanup()
        doneCleanup()
        errorCleanup()
      })

      const errorCleanup = window.localmind.llm.onError(streamId, (err) => {
        appendSynthesis(`\n\n**Error:** ${err}`)
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
  }, [query, selectedModels, synthesizerModel, reset, setRunning, setCandidates, appendSynthesis, setStreamId])

  const canRun = query.trim().length > 0 && selectedModels.length >= 2 && synthesizerModel !== null && !isRunning

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container/20">
            <span className="material-symbols-outlined text-primary text-[24px]">groups</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-on-surface">Consensus Engine</h1>
            <p className="text-[12px] text-on-surface-variant">Multi-model query with synthesis</p>
          </div>
        </div>
      </div>

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
          <label className="text-[13px] font-semibold text-on-surface">Query</label>
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
