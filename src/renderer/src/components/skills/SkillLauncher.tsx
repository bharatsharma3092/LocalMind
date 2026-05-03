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
  onCreateSkill?: () => void
  onClose: () => void
}

const fallbackSkills: Skill[] = [
  { id: 'dev.api-doc-writer', name: 'API Doc Writer', description: 'Generate OpenAPI specs and documentation from code', icon: 'description', category: 'Development', enabled: true },
  { id: 'dev.code-reviewer', name: 'Code Reviewer', description: 'Review code for bugs, maintainability, and missing tests', icon: 'code', category: 'Development', enabled: true },
  { id: 'qa.bug-analysis', name: 'Bug Analysis Agent', description: 'Find likely root causes from logs, errors, and screenshots', icon: 'bug_report', category: 'QA', enabled: true },
  { id: 'data.sql-builder', name: 'SQL Builder', description: 'Create SQL queries from natural language and schema context', icon: 'database', category: 'Data', enabled: true },
]

const materialIconAliases: Record<string, string> = {
  'file-text': 'description',
  file_text: 'description',
  bug: 'bug_report',
  'alert-triangle': 'warning',
  'theater-masks': 'theaters',
  'git-pull-request': 'call_merge',
  layout: 'dashboard',
  'test-tube': 'science',
}

function getSkillIcon(icon?: string) {
  if (!icon) return 'bolt'
  return materialIconAliases[icon] ?? icon
}

export function SkillLauncher({ onSelect, onCreateSkill, onClose }: Props) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!window.localmind?.skill?.list) {
      setSkills(fallbackSkills)
      return
    }
    window.localmind.skill.list().then((res) => {
      if (res.success && res.data) setSkills(res.data.filter((s: Skill) => s.enabled))
    }).catch(() => setSkills([]))
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [onClose])

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
    <div
      ref={panelRef}
      className="w-full min-w-0 overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-low shadow-2xl"
    >
        <div className="flex items-center gap-3 border-b border-outline-variant px-4 py-3">
          <span className="text-lg text-on-surface-variant">/</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search skills..."
            className="flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant"
          />
          <kbd className="rounded border border-outline-variant bg-surface-container px-1.5 py-0.5 text-xs text-on-surface-variant">
            Esc
          </kbd>
        </div>

        <div className="max-h-[360px] overflow-y-auto py-1">
          {onCreateSkill && (
            <button
              onClick={onCreateSkill}
              className="grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-b border-outline-variant px-4 py-3 text-left text-on-surface hover:bg-surface-container"
            >
              <span className="text-lg w-8 text-center">
                <span className="material-symbols-outlined text-[20px]">add_circle</span>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-5 text-on-surface">Create Skill</p>
                <p className="mt-0.5 text-xs leading-4 text-on-surface-variant">Save a reusable instruction and make it available here.</p>
              </div>
              <span className="rounded-full border border-primary-container/40 bg-primary-container/10 px-2 py-0.5 text-xs text-primary">
                New
              </span>
            </button>
          )}
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-on-surface-variant">
              No skills found
            </div>
          ) : (
            filtered.map((skill, i) => (
              <button
                key={skill.id}
                onClick={() => onSelect(skill)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors ${
                  i === selectedIndex
                    ? 'bg-primary-container/10 text-on-surface'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <span className="text-lg w-8 text-center">
                  <span className="material-symbols-outlined text-[20px]">
                    {getSkillIcon(skill.icon)}
                  </span>
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-5 text-on-surface">{skill.name}</p>
                  {skill.description && (
                    <p className="mt-0.5 text-xs leading-4 text-on-surface-variant line-clamp-2">{skill.description}</p>
                  )}
                </div>
                {skill.category && (
                  <span className="max-w-28 truncate rounded-full border border-outline-variant bg-surface-container px-2 py-0.5 text-xs text-on-surface-variant">
                    {skill.category}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
    </div>
  )
}
