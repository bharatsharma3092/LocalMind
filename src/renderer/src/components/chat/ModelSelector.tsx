import { useState, useRef, useEffect } from 'react'
import { useProviderStore, type ProviderStatus } from '../../stores/providerStore'

const statusLabels: Record<ProviderStatus, string> = {
  unknown: 'Checking...',
  online: 'Connected',
  offline: 'Not running',
  error: 'Error',
}

const statusColors: Record<ProviderStatus, string> = {
  unknown: 'bg-gray-500',
  online: 'bg-green-500',
  offline: 'bg-red-500',
  error: 'bg-amber-500',
}

const builtinProviders = [
  { key: 'ollama', label: 'Ollama' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'openrouter', label: 'OpenRouter' },
  { key: 'google', label: 'Google' },
]

export function ModelSelector() {
  const { availableModels, selectedModel, setModel, providerStatus, providerErrors, customProviders } = useProviderStore()
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = availableModels.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.id.toLowerCase().includes(search.toLowerCase())
  )

  const grouped = filtered.reduce(
    (acc, m) => {
      const key = m.customProviderId
        ? `custom:${m.customProviderId}`
        : m.provider
      if (!acc[key]) acc[key] = { label: m.provider, models: [] }
      acc[key].models.push(m)
      return acc
    },
    {} as Record<string, { label: string; models: typeof filtered }>
  )

  for (const cp of customProviders) {
    const key = `custom:${cp.id}`
    if (grouped[key]) grouped[key].label = cp.name
  }

  const providerOrder = [
    ...builtinProviders.map((p) => p.key),
    ...customProviders.map((cp) => `custom:${cp.id}`),
    'custom',
  ]

  const orderedGroups = providerOrder
    .filter((key) => grouped[key])
    .map((key) => ({ key, ...grouped[key] }))

  const currentStatus = providerStatus[selectedModel?.customProviderId ? `custom:${selectedModel.customProviderId}` : selectedModel?.provider ?? 'ollama'] ?? 'unknown'

  return (
    <div className="relative" ref={ref}>
      {/* Trigger pill */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-surface-container py-1.5 px-3 rounded-lg border border-outline-variant cursor-pointer active:scale-95 hover:bg-surface-container-high transition-colors duration-200"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${statusColors[currentStatus]}`} />
        <span className="font-semibold text-[14px] text-on-surface truncate max-w-[160px]">
          {selectedModel ? `${selectedModel.provider}: ${selectedModel.name}` : 'Select Model'}
        </span>
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">expand_more</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-surface-container border border-outline-variant rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="p-2 border-b border-outline-variant">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm outline-none focus:border-secondary text-on-surface placeholder:text-on-surface-variant/50"
              autoFocus
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {orderedGroups.map(({ key, label, models }) => {
              const status = providerStatus[key] ?? 'unknown'
              const error = providerErrors[key]
              return (
                <div key={key}>
                  <div className="px-3 py-1.5 text-xs font-semibold text-on-surface-variant uppercase bg-surface-container-low flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColors[status]}`} />
                    <span>{label}</span>
                    {status !== 'online' && status !== 'unknown' && (
                      <span className="font-normal normal-case text-on-surface-variant/70 ml-auto" title={error}>
                        {statusLabels[status]}
                      </span>
                    )}
                  </div>
                  {error && status === 'offline' && (
                    <div className="px-3 py-1.5 text-xs text-amber-400 bg-amber-500/10">
                      {key === 'ollama' ? 'Ollama is not running. Start it with: ollama serve' : error}
                    </div>
                  )}
                  {models.map((model) => (
                    <button
                      key={`${model.provider}-${model.customProviderId ?? ''}-${model.id}`}
                      onClick={() => {
                        setModel(model)
                        setIsOpen(false)
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface-container-high transition-colors ${
                        selectedModel?.id === model.id && selectedModel?.customProviderId === model.customProviderId ? 'bg-primary/10 text-primary' : 'text-on-surface'
                      }`}
                    >
                      <div className="truncate font-medium">{model.name}</div>
                      <div className="text-xs text-on-surface-variant/70">
                        {model.contextWindow.toLocaleString()} tokens
                        {model.costPer1MTokens && ` · $${model.costPer1MTokens.output}/1M`}
                      </div>
                    </button>
                  ))}
                </div>
              )
            })}
            {orderedGroups.length === 0 && (
              <div className="p-4 text-center text-sm text-on-surface-variant">No models found</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
