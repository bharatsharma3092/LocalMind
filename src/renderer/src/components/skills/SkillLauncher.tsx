import { useState, useEffect, useRef, useCallback } from 'react'

interface Skill {
  id: string
  name: string
  description?: string
  category?: string
  icon?: string
  parameters?: any[]
  enabled: boolean
}

interface Props {
  onSelect: (skill: Skill) => void
  onClose: () => void
}

export function SkillLauncher({ onSelect, onClose }: Props) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.localmind.skill.list().then((res) => {
      if (res.success && res.data) setSkills(res.data.filter((s: Skill) => s.enabled))
    })
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = skills.filter((s) => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      s.name.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.category?.toLowerCase().includes(q)
    )
  })

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault()
        onSelect(filtered[selectedIndex])
      } else if (e.key === 'Escape') {
        onClose()
      }
    },
    [filtered, selectedIndex, onSelect, onClose]
  )

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center pt-[20vh] z-50" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <span className="text-text-muted text-lg">/</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search skills..."
            className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
          />
          <kbd className="text-xs text-text-muted bg-surface-offset border border-border px-1.5 py-0.5 rounded">
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-muted">
              No skills found
            </div>
          ) : (
            filtered.map((skill, i) => (
              <button
                key={skill.id}
                onClick={() => onSelect(skill)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  i === selectedIndex
                    ? 'bg-accent/10 text-text'
                    : 'text-text-muted hover:bg-surface-offset hover:text-text'
                }`}
              >
                <span className="text-lg w-8 text-center flex-shrink-0">
                  {skill.icon ?? '⚡'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{skill.name}</p>
                  {skill.description && (
                    <p className="text-xs text-text-muted truncate">{skill.description}</p>
                  )}
                </div>
                {skill.category && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-surface-offset border border-border text-text-muted flex-shrink-0">
                    {skill.category}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
