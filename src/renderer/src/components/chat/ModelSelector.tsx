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

export function ModelSelector() {
  const { availableModels, selectedModel, setModel, providerStatus, providerErrors } = useProviderStore()
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
      if (!acc[m.provider]) acc[m.provider] = []
      acc[m.provider].push(m)
      return acc
    },
    {} as Record<string, typeof filtered>
  )

  const currentStatus = providerStatus[selectedModel?.provider ?? 'ollama'] ?? 'unknown'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-surface-offset border border-border rounded-lg text-sm hover:bg-surface-hover transition-colors"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${statusColors[currentStatus]}`} />
        <span className="truncate max-w-[160px]">{selectedModel?.name ?? 'Select Model'}</span>
        <span className="text-text-muted text-xs">▼</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-72 bg-surface border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-border">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="w-full bg-surface-offset border border-border rounded px-2 py-1.5 text-sm outline-none focus:border-accent text-text"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {['ollama', 'openai', 'openrouter', 'google', 'custom'].map((provider) => {
              const models = grouped[provider]
              const status = providerStatus[provider] ?? 'unknown'
              const error = providerErrors[provider]
              return (
                <div key={provider}>
                  <div className="px-3 py-1.5 text-xs font-semibold text-text-muted uppercase bg-surface-offset flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColors[status]}`} />
                    <span>{provider}</span>
                    {status !== 'online' && status !== 'unknown' && (
                      <span className="font-normal normal-case text-text-muted ml-auto" title={error}>
                        {statusLabels[status]}
                      </span>
                    )}
                  </div>
                  {error && status === 'offline' && (
                    <div className="px-3 py-1 text-xs text-amber-500 bg-amber-500/5">
                      {provider === 'ollama' ? 'Ollama is not running. Start it with: ollama serve' : error}
                    </div>
                  )}
                  {models?.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => {
                        setModel(model)
                        setIsOpen(false)
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-hover transition-colors ${
                        selectedModel?.id === model.id ? 'bg-accent/10 text-accent' : 'text-text'
                      }`}
                    >
                      <div className="truncate">{model.name}</div>
                      <div className="text-xs text-text-muted">
                        {model.contextWindow.toLocaleString()} tokens
                        {model.costPer1MTokens && ` · $${model.costPer1MTokens.output}/1M`}
                      </div>
                    </button>
                  ))}
                </div>
              )
            })}
            {Object.keys(grouped).length === 0 && (
              <div className="p-4 text-center text-sm text-text-muted">No models found</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
