import type { AppPage } from '../sidebar/Sidebar'

interface Props {
  currentPage: AppPage
  onNavigate: (page: AppPage) => void
}

const navItems: { id: AppPage; icon: string; label: string }[] = [
  { id: 'consensus', icon: 'groups', label: 'Consensus' },
  { id: 'agents', icon: 'smart_toy', label: 'Agents' },
  { id: 'skills', icon: 'psychology', label: 'Skills' },
  { id: 'mcp', icon: 'hub', label: 'MCP Servers' },
]

export function PageNavIcons({ currentPage, onNavigate }: Props) {
  const goHome = () => {
    window.dispatchEvent(new Event('localmind:go-home'))
  }

  return (
    <div className="flex items-center gap-1">
      <div className="w-px h-5 bg-outline-variant/50 mx-2" />
      <button
        onClick={goHome}
        title="Home"
        className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors duration-200 ${
          currentPage === 'chat'
            ? 'bg-primary/10 text-primary'
            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
        }`}
      >
        <span className="material-symbols-outlined text-[20px]">home</span>
      </button>
      {navItems.map((item) => {
        const isActive = currentPage === item.id
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            title={item.label}
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors duration-200 ${
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
          </button>
        )
      })}
    </div>
  )
}
