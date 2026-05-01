import { useState, useEffect, useCallback } from 'react'

interface Skill {
  id: string
  name: string
  description: string
  author?: string
  version: string
  icon?: string
  category: string
  enabled: boolean
  parameters?: {
    id: string
    type: 'text' | 'select' | 'boolean'
    label: string
    options?: string[]
    default?: string
  }[]
}

// Fallback static skills for development preview when IPC is unavailable
const fallbackSkills: Skill[] = [
  { id: 'dev.api-doc-writer', name: 'API Doc Writer', description: 'Generate OpenAPI specs and documentation from code', author: 'LocalMind', version: '1.0.0', icon: 'file-text', category: 'Development', enabled: true },
  { id: 'dev.code-reviewer', name: 'Code Reviewer', description: 'Multi-dimensional code review with fixes and suggestions', author: 'LocalMind', version: '1.0.0', icon: 'code', category: 'Development', enabled: true },
  { id: 'qa.bug-analysis', name: 'Bug Analysis Agent', description: 'Root cause analysis from logs, error messages, and screenshots', author: 'LocalMind', version: '1.0.0', icon: 'bug', category: 'QA & Testing', enabled: true },
  { id: 'data.data-cleaner', name: 'Data Cleaner', description: 'Detect and fix messy CSV/JSON data', author: 'LocalMind', version: '1.0.0', icon: 'table', category: 'Data', enabled: true },
  { id: 'productivity.email-drafter', name: 'Email Drafter', description: 'Professional email composition with tone adjustment', author: 'LocalMind', version: '1.0.0', icon: 'mail', category: 'Productivity', enabled: true },
  { id: 'ops.incident-analyzer', name: 'Incident Analyzer', description: 'Analyze incident logs and suggest fixes', author: 'LocalMind', version: '1.0.0', icon: 'alert-triangle', category: 'Operations', enabled: true },
  { id: 'ai.langgraph-agent', name: 'LangGraph Agent', description: 'Generate LangGraph agent code from description', author: 'LocalMind', version: '1.0.0', icon: 'cpu', category: 'AI', enabled: true },
  { id: 'productivity.meeting-notes', name: 'Meeting Notes', description: 'Structure raw meeting notes into organized summaries', author: 'LocalMind', version: '1.0.0', icon: 'clipboard', category: 'Productivity', enabled: true },
  { id: 'qa.playwright-writer', name: 'Playwright Writer', description: 'Generate Playwright automation scripts from test scenarios', author: 'LocalMind', version: '1.0.0', icon: 'theater-masks', category: 'QA & Testing', enabled: true },
  { id: 'dev.pr-summarizer', name: 'PR Summarizer', description: 'Summarize pull request diffs and changes', author: 'LocalMind', version: '1.0.0', icon: 'git-pull-request', category: 'Development', enabled: true },
  { id: 'research.rag-query', name: 'RAG Query', description: 'Q&A over uploaded documents using retrieval-augmented generation', author: 'LocalMind', version: '1.0.0', icon: 'search', category: 'Research', enabled: true },
  { id: 'dev.regex-builder', name: 'Regex Builder', description: 'Generate and test regex patterns from natural language', author: 'LocalMind', version: '1.0.0', icon: 'hash', category: 'Development', enabled: true },
  { id: 'data.sql-builder', name: 'SQL Builder', description: 'Natural language to SQL with schema awareness', author: 'LocalMind', version: '1.0.0', icon: 'database', category: 'Data', enabled: true },
  { id: 'architecture.system-design', name: 'System Design', description: 'High-level system design advisor with diagrams', author: 'LocalMind', version: '1.0.0', icon: 'layout', category: 'Architecture', enabled: true },
  { id: 'qa.test-case-generator', name: 'Test Case Generator', description: 'Generate BDD/TDD test cases from requirements or user stories', author: 'LocalMind', version: '1.0.0', icon: 'test-tube', category: 'QA & Testing', enabled: true },
]

export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState('All Skills')
  const [searchQuery, setSearchQuery] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fetchSkills = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const api = (window as any).localmind?.skill
      if (api?.list) {
        const result = await api.list()
        const skillList = Array.isArray(result) ? result : result?.data
        if (Array.isArray(skillList) && skillList.length > 0) {
          setSkills(skillList)
        } else {
          setSkills(fallbackSkills)
        }
      } else {
        setSkills(fallbackSkills)
      }
    } catch (err: any) {
      console.error('[SkillsPage] Failed to load skills:', err)
      setError(err?.message || 'Failed to load skills')
      setSkills(fallbackSkills)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSkills()
  }, [fetchSkills])

  const handleToggle = useCallback(async (skill: Skill) => {
    try {
      setTogglingId(skill.id)
      const api = (window as any).localmind?.skill
      if (api?.update) {
        await api.update(skill.id, { enabled: !skill.enabled })
        setSkills((prev) =>
          prev.map((s) => (s.id === skill.id ? { ...s, enabled: !s.enabled } : s))
        )
      }
    } catch (err: any) {
      console.error('[SkillsPage] Failed to toggle skill:', err)
    } finally {
      setTogglingId(null)
    }
  }, [])

  // Derive categories dynamically from actual skills
  const allCategories = ['All Skills', ...Array.from(new Set(skills.map((s) => s.category))).sort()]

  const filteredSkills = skills.filter((skill) => {
    const matchesCategory = activeCategory === 'All Skills' || skill.category === activeCategory
    const matchesSearch =
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.category.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const getCategoryCount = (category: string) => {
    if (category === 'All Skills') return skills.length
    return skills.filter((s) => s.category === category).length
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-surface">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-[32px] font-bold text-on-surface mb-2 tracking-tight leading-tight">
            Skills Library
          </h2>
          <p className="text-[16px] leading-relaxed text-on-surface-variant">
            {skills.length > 0
              ? `${skills.length} specialized skills available to enhance your AI workflows.`
              : 'Loading your skills...'}
          </p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-[20px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search skills..."
              className="w-full bg-surface-container-highest border border-outline-variant rounded-lg py-2 pl-10 pr-4 text-sm text-on-surface focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-colors placeholder-gray-500"
            />
          </div>
          <button
            onClick={fetchSkills}
            disabled={loading}
            className="px-3 py-2 bg-surface-container-high border border-outline-variant rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-50"
            title="Refresh skills"
          >
            <span className={`material-symbols-outlined text-[20px] ${loading ? 'animate-spin' : ''}`}>
              refresh
            </span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-error-container/20 border border-error-container rounded-xl flex items-center gap-3">
          <span className="material-symbols-outlined text-error">error</span>
          <p className="text-sm text-error flex-1">{error}</p>
          <button
            onClick={fetchSkills}
            className="text-sm text-error font-semibold hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Category Filters */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6 scrollbar-hide">
        {loading && skills.length === 0
          ? // Skeleton category pills
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="px-4 py-1.5 rounded-full bg-surface-container-high border border-outline-variant animate-pulse w-24 h-7"
              />
            ))
          : allCategories.map((category) => {
              const isActive = activeCategory === category
              const count = getCategoryCount(category)
              return (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`px-4 py-1.5 rounded-full font-semibold text-[12px] whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-primary-container/20 border border-primary-container text-primary-fixed'
                      : 'bg-surface-container-high border border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
                  }`}
                >
                  {category}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-primary-container/30 text-primary-fixed'
                        : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
      </div>

      {/* Loading Skeleton Grid */}
      {loading && skills.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-24">
          {Array.from({ length: 9 }).map((_, i) => (
            <SkillCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Skills Bento Grid */}
      {!loading || skills.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-24">
          {filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onToggle={() => handleToggle(skill)}
              isToggling={togglingId === skill.id}
            />
          ))}
        </div>
      ) : null}

      {/* Empty State */}
      {filteredSkills.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-[32px] text-on-surface-variant">
              search_off
            </span>
          </div>
          <h3 className="text-lg font-semibold text-on-surface mb-1">No skills found</h3>
          <p className="text-sm text-on-surface-variant max-w-sm">
            Try adjusting your search or category filter to find what you're looking for.
          </p>
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('')
                setActiveCategory('All Skills')
              }}
              className="mt-4 px-4 py-2 bg-surface-container-high border border-outline-variant rounded-lg text-sm font-semibold text-on-surface hover:bg-surface-container-highest transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SkillCardSkeleton() {
  return (
    <div className="rounded-xl p-5 bg-surface-container-lowest border border-outline-variant animate-pulse">
      <div className="flex justify-between items-start mb-4">
        <div className="w-12 h-12 rounded-lg bg-surface-container-high" />
        <div className="w-16 h-5 rounded-md bg-surface-container-high" />
      </div>
      <div className="h-6 w-3/4 bg-surface-container-high rounded mb-1" />
      <div className="h-4 w-full bg-surface-container-high rounded mb-4" />
      <div className="h-4 w-1/2 bg-surface-container-high rounded mb-5" />
      <div className="h-9 w-full bg-surface-container-high rounded-lg" />
    </div>
  )
}

function SkillCard({
  skill,
  onToggle,
  isToggling,
}: {
  skill: Skill
  onToggle: () => void
  isToggling: boolean
}) {
  const hasParameters = skill.parameters && skill.parameters.length > 0

  return (
    <div
      className={`rounded-xl p-5 hover:bg-surface-container transition-colors group relative overflow-hidden border ${
        skill.enabled
          ? 'bg-surface-container-low border-primary-container/30'
          : 'bg-surface-container-lowest border-outline-variant hover:bg-surface-container-low'
      }`}
    >
      {skill.enabled && (
        <div className="absolute top-0 right-0 w-24 h-24 bg-primary-container/5 rounded-bl-full -z-0" />
      )}

      <div className="flex justify-between items-start mb-4 relative z-10">
        <div
          className={`w-12 h-12 rounded-lg flex items-center justify-center ${
            skill.enabled
              ? 'bg-surface-container-highest border border-outline-variant text-primary'
              : 'bg-surface-container-high text-gray-400 group-hover:text-primary transition-colors'
          }`}
        >
          <span className="material-symbols-outlined text-[28px]">
            {skill.icon || 'extension'}
          </span>
        </div>
        <span
          className={`px-2 py-1 rounded-md font-semibold text-[10px] uppercase tracking-wider ${
            skill.enabled
              ? 'bg-secondary-container/20 text-secondary'
              : 'bg-surface-variant text-on-surface-variant'
          }`}
        >
          {skill.enabled ? 'Enabled' : skill.category}
        </span>
      </div>

      <h3 className="text-[20px] font-semibold text-on-surface mb-1 leading-snug">
        {skill.name}
      </h3>
      <p className="text-[14px] leading-relaxed text-on-surface-variant mb-4 line-clamp-2 h-10">
        {skill.description}
      </p>

      <div className="flex items-center gap-3 mb-5">
        <span className="text-[12px] text-gray-500 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">person</span>
          {skill.author || 'LocalMind'}
        </span>
        <span className="text-gray-600 text-xs">•</span>
        <span className="text-[12px] text-gray-500">{skill.version}</span>
        {hasParameters && (
          <>
            <span className="text-gray-600 text-xs">•</span>
            <span className="text-[12px] text-primary-container flex items-center gap-0.5">
              <span className="material-symbols-outlined text-[14px]">tune</span>
              {skill.parameters?.length} params
            </span>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onToggle}
          disabled={isToggling}
          className={`flex-1 py-2 rounded-lg font-semibold text-[12px] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${
            skill.enabled
              ? 'bg-surface-container-high border border-outline-variant text-on-surface hover:bg-surface-container-highest hover:border-gray-600'
              : 'bg-transparent border border-primary-container text-primary-container hover:bg-primary-container/10'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">
            {isToggling ? 'progress_activity' : skill.enabled ? 'toggle_on' : 'toggle_off'}
          </span>
          {isToggling ? 'Updating...' : skill.enabled ? 'Disable' : 'Enable'}
        </button>
      </div>
    </div>
  )
}
