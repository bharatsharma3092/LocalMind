import { useState, useEffect, useCallback } from 'react'

interface ServerConfig {
  id?: string
  name: string
  transport: 'stdio' | 'http+sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  autoApprove?: string[]
}

interface ServerStatus {
  id: string
  name: string
  status: 'connected' | 'disconnected' | 'error' | 'connecting'
  toolCount: number
  resourceCount: number
}

interface MarketplaceItem {
  id: string
  name: string
  description: string
  icon: string
  iconColor: string
  iconBg: string
  category: string
  packageName?: string
  command?: string
  args?: string[]
  url?: string
  transport: 'stdio' | 'http+sse'
  requiresConfig?: boolean
  configFields?: { key: string; label: string; placeholder: string; envVar?: string }[]
}

const marketplaceItems: MarketplaceItem[] = [
  // Official Anthropic MCP Servers
  {
    id: 'mcp-filesystem',
    name: 'Filesystem',
    description: 'Secure file operations with configurable access controls. Read, write, and manage files.',
    icon: 'folder',
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/20',
    category: 'Official',
    packageName: '@modelcontextprotocol/server-filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/dir'],
    transport: 'stdio',
    requiresConfig: true,
    configFields: [{ key: 'path', label: 'Allowed Directory', placeholder: '/Users/username/Documents', envVar: 'MCP_FS_PATH' }],
  },
  {
    id: 'mcp-github',
    name: 'GitHub',
    description: 'Repository management, issue tracking, and code search. Interact with GitHub APIs.',
    icon: 'code',
    iconColor: 'text-gray-300',
    iconBg: 'bg-gray-500/20',
    category: 'Official',
    packageName: '@modelcontextprotocol/server-github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    transport: 'stdio',
    requiresConfig: true,
    configFields: [{ key: 'token', label: 'GitHub Token', placeholder: 'ghp_xxxxxxxxxxxx', envVar: 'GITHUB_PERSONAL_ACCESS_TOKEN' }],
  },
  {
    id: 'mcp-postgres',
    name: 'PostgreSQL',
    description: 'Read-only database access with schema inspection. Safe SQL query execution.',
    icon: 'database',
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/20',
    category: 'Official',
    packageName: '@modelcontextprotocol/server-postgres',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    transport: 'stdio',
    requiresConfig: true,
    configFields: [{ key: 'url', label: 'Database URL', placeholder: 'postgresql://localhost/mydb', envVar: 'DATABASE_URL' }],
  },
  {
    id: 'mcp-sqlite',
    name: 'SQLite',
    description: 'Lightweight database operations with SQLite. Perfect for local data storage.',
    icon: 'table',
    iconColor: 'text-cyan-400',
    iconBg: 'bg-cyan-500/20',
    category: 'Official',
    packageName: '@modelcontextprotocol/server-sqlite',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', '/path/to/database.db'],
    transport: 'stdio',
    requiresConfig: true,
    configFields: [{ key: 'dbPath', label: 'Database Path', placeholder: '/path/to/database.db' }],
  },
  {
    id: 'mcp-puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation and web scraping. Capture screenshots and interact with pages.',
    icon: 'smart_toy',
    iconColor: 'text-green-400',
    iconBg: 'bg-green-500/20',
    category: 'Official',
    packageName: '@modelcontextprotocol/server-puppeteer',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    transport: 'stdio',
  },
  {
    id: 'mcp-brave-search',
    name: 'Brave Search',
    description: 'Web search capabilities using Brave Search API. Find information across the web.',
    icon: 'search',
    iconColor: 'text-orange-400',
    iconBg: 'bg-orange-500/20',
    category: 'Official',
    packageName: '@modelcontextprotocol/server-brave-search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    transport: 'stdio',
    requiresConfig: true,
    configFields: [{ key: 'apiKey', label: 'Brave API Key', placeholder: 'BSxxxxxxxxxxxx', envVar: 'BRAVE_API_KEY' }],
  },
  {
    id: 'mcp-fetch',
    name: 'Fetch',
    description: 'HTTP request capabilities for fetching web content and APIs. Simple and fast.',
    icon: 'download',
    iconColor: 'text-purple-400',
    iconBg: 'bg-purple-500/20',
    category: 'Official',
    packageName: '@modelcontextprotocol/server-fetch',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    transport: 'stdio',
  },
  // Web & Search
  {
    id: 'mcp-firecrawl',
    name: 'Firecrawl',
    description: 'Advanced web scraping with content extraction, crawling, and search functionalities.',
    icon: 'local_fire_department',
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/20',
    category: 'Web & Search',
    packageName: '@michaellatman/mcp-get-firecrawl',
    command: 'npx',
    args: ['-y', '@michaellatman/mcp-get-firecrawl'],
    transport: 'stdio',
    requiresConfig: true,
    configFields: [{ key: 'apiKey', label: 'Firecrawl API Key', placeholder: 'fc-xxxxxxxx', envVar: 'FIRECRAWL_API_KEY' }],
  },
  {
    id: 'mcp-browserbase',
    name: 'Browserbase',
    description: 'Cloud browser automation for web interaction, data extraction, and task automation.',
    icon: 'web',
    iconColor: 'text-indigo-400',
    iconBg: 'bg-indigo-500/20',
    category: 'Web & Search',
    packageName: '@browserbasehq/mcp-stagehand',
    command: 'npx',
    args: ['-y', '@browserbasehq/mcp-stagehand'],
    transport: 'stdio',
    requiresConfig: true,
    configFields: [
      { key: 'apiKey', label: 'Browserbase API Key', placeholder: 'bb-live-xxx', envVar: 'BROWSERBASE_API_KEY' },
      { key: 'projectId', label: 'Project ID', placeholder: 'proj-xxx', envVar: 'BROWSERBASE_PROJECT_ID' },
    ],
  },
  // Development
  {
    id: 'mcp-chrome-devtools',
    name: 'Chrome DevTools',
    description: 'Programmatic browser control, inspection, and debugging via Chrome DevTools Protocol.',
    icon: 'bug_report',
    iconColor: 'text-teal-400',
    iconBg: 'bg-teal-500/20',
    category: 'Development',
    packageName: '@anthropic-ai/mcp-chrome-devtools',
    command: 'npx',
    args: ['-y', '@anthropic-ai/mcp-chrome-devtools'],
    transport: 'stdio',
  },
  {
    id: 'mcp-context7',
    name: 'Context7',
    description: 'Fetch up-to-date documentation and code examples directly from source for LLMs.',
    icon: 'menu_book',
    iconColor: 'text-rose-400',
    iconBg: 'bg-rose-500/20',
    category: 'Development',
    packageName: '@upstash/context7-mcp',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp'],
    transport: 'stdio',
  },
  // Productivity
  {
    id: 'mcp-excel',
    name: 'Excel',
    description: 'Excel file manipulation without requiring Microsoft Excel installation.',
    icon: 'table_chart',
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/20',
    category: 'Productivity',
    packageName: '@encoded-evolution/mcp-excel',
    command: 'npx',
    args: ['-y', '@encoded-evolution/mcp-excel'],
    transport: 'stdio',
  },
  {
    id: 'mcp-slack',
    name: 'Slack',
    description: 'Send messages, read channels, and manage conversations in Slack workspaces.',
    icon: 'chat',
    iconColor: 'text-pink-400',
    iconBg: 'bg-pink-500/20',
    category: 'Productivity',
    packageName: '@modelcontextprotocol/server-slack',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    transport: 'stdio',
    requiresConfig: true,
    configFields: [
      { key: 'token', label: 'Slack Bot Token', placeholder: 'xoxb-xxx', envVar: 'SLACK_BOT_TOKEN' },
      { key: 'teamId', label: 'Team ID', placeholder: 'Txxxxx', envVar: 'SLACK_TEAM_ID' },
    ],
  },
  {
    id: 'mcp-gdrive',
    name: 'Google Drive',
    description: 'Search, read, and manage files in Google Drive. Access documents and spreadsheets.',
    icon: 'cloud',
    iconColor: 'text-sky-400',
    iconBg: 'bg-sky-500/20',
    category: 'Productivity',
    packageName: '@modelcontextprotocol/server-gdrive',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    transport: 'stdio',
  },
]

const statusConfig = {
  connected: { dot: 'bg-emerald-500', shadow: 'shadow-[0_0_8px_rgba(16,185,129,0.5)]', text: 'text-emerald-400', label: 'Connected' },
  connecting: { dot: 'bg-amber-500', shadow: 'shadow-[0_0_8px_rgba(245,158,11,0.5)]', text: 'text-amber-400', label: 'Connecting' },
  error: { dot: 'bg-error', shadow: 'shadow-[0_0_8px_rgba(255,180,171,0.5)]', text: 'text-error', label: 'Error' },
  disconnected: { dot: 'bg-error', shadow: 'shadow-[0_0_8px_rgba(255,180,171,0.5)]', text: 'text-error', label: 'Disconnected' },
}

export function McpManagementPage() {
  const [servers, setServers] = useState<ServerStatus[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [configForm, setConfigForm] = useState<ServerConfig>({
    name: '',
    transport: 'stdio',
    command: '',
    args: [],
    url: '',
    autoApprove: [],
  })
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [installingItem, setInstallingItem] = useState<MarketplaceItem | null>(null)
  const [installConfig, setInstallConfig] = useState<Record<string, string>>({})

  const refreshStatus = useCallback(async () => {
    const res = await window.localmind.mcp.serverStatus()
    if (res.success && res.data) setServers(res.data)
  }, [])

  useEffect(() => {
    refreshStatus()
    const interval = setInterval(refreshStatus, 5000)
    return () => clearInterval(interval)
  }, [refreshStatus])

  const withLoading = async (id: string, fn: () => Promise<void>) => {
    setLoadingIds((prev) => new Set(prev).add(id))
    try {
      await fn()
      await refreshStatus()
    } catch (err: any) {
      console.error('[MCP]', err)
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleConnect = async () => {
    await window.localmind.mcp.connect(configForm)
    setShowAddForm(false)
    setConfigForm({ name: '', transport: 'stdio', command: '', args: [], url: '', autoApprove: [] })
    await refreshStatus()
  }

  const handleDisconnect = (id: string) => withLoading(id, async () => {
    await window.localmind.mcp.disconnect(id)
  })

  const handleRestart = (id: string) => withLoading(id, async () => {
    await window.localmind.mcp.restart(id)
  })

  const handleServerConnect = (server: ServerStatus) => withLoading(server.id, async () => {
    try {
      await window.localmind.mcp.restart(server.id)
    } catch {
      await window.localmind.mcp.connect({ id: server.id, name: server.name })
    }
  })

  const handleDelete = (id: string) => withLoading(id, async () => {
    if (window.localmind.mcp.removeServer) {
      await window.localmind.mcp.removeServer(id)
    }
  })

  const handleInstall = (item: MarketplaceItem) => {
    if (item.requiresConfig) {
      setInstallingItem(item)
      setInstallConfig({})
    } else {
      // Direct install without config
      const config: ServerConfig = {
        name: item.name,
        transport: item.transport,
        command: item.command,
        args: item.args,
        url: item.url,
      }
      window.localmind.mcp.connect(config).then(() => refreshStatus())
    }
  }

  const handleInstallWithConfig = async () => {
    if (!installingItem) return
    const item = installingItem
    const env: Record<string, string> = {}
    const args = item.args ? [...item.args] : []

    item.configFields?.forEach((field) => {
      if (field.envVar && installConfig[field.key]) {
        env[field.envVar] = installConfig[field.key]
      }
      // Replace placeholders in args
      for (let i = 0; i < args.length; i++) {
        if (args[i].includes(`{{${field.key}}}`)) {
          args[i] = args[i].replace(`{{${field.key}}}`, installConfig[field.key] || '')
        }
      }
    })

    const config: ServerConfig = {
      name: item.name,
      transport: item.transport,
      command: item.command,
      args,
      url: item.url,
      env: Object.keys(env).length > 0 ? env : undefined,
    }

    await window.localmind.mcp.connect(config)
    setInstallingItem(null)
    setInstallConfig({})
    await refreshStatus()
  }

  const categories = ['All', ...Array.from(new Set(marketplaceItems.map((i) => i.category)))]

  const filteredMarketplace = marketplaceItems.filter((item) => {
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const installedIds = new Set(servers.map((s) => s.id))

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="w-full max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-10">
            <div className="flex justify-between items-end">
              <div>
                <h1 className="font-h1 text-h1 text-on-surface mb-2">MCP Management</h1>
                <p className="font-body-lg text-body-lg text-on-surface-variant">
                  Connect and manage Model Context Protocol servers to extend LocalMind's capabilities.
                </p>
              </div>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="bg-primary-container text-white px-6 py-3 rounded-lg font-label-md text-label-md hover:bg-accent-hover transition-colors flex items-center gap-2 shrink-0 ml-4"
              >
                <span className="material-symbols-outlined">add</span>
                Add Custom Server
              </button>
            </div>
          </header>

          {/* Add Server Form */}
          {showAddForm && (
            <div className="bg-surface-container rounded-xl border border-outline-variant p-6 mb-10">
              <h3 className="font-h3 text-h3 text-on-surface mb-4">Add Custom MCP Server</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-on-surface-variant uppercase mb-2">Server Name</label>
                  <input
                    type="text"
                    value={configForm.name}
                    onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })}
                    placeholder="My Server"
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-on-surface-variant uppercase mb-2">Transport</label>
                  <select
                    value={configForm.transport}
                    onChange={(e) => setConfigForm({ ...configForm, transport: e.target.value as 'stdio' | 'http+sse' })}
                    className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
                  >
                    <option value="stdio">stdio</option>
                    <option value="http+sse">HTTP/SSE</option>
                  </select>
                </div>
                {configForm.transport === 'stdio' ? (
                  <>
                    <div>
                      <label className="block text-[12px] font-semibold text-on-surface-variant uppercase mb-2">Command</label>
                      <input
                        type="text"
                        value={configForm.command ?? ''}
                        onChange={(e) => setConfigForm({ ...configForm, command: e.target.value })}
                        placeholder="e.g., npx"
                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-on-surface-variant uppercase mb-2">Arguments</label>
                      <input
                        type="text"
                        value={configForm.args?.join(' ') ?? ''}
                        onChange={(e) => setConfigForm({ ...configForm, args: e.target.value.split(' ').filter(Boolean) })}
                        placeholder="space-separated args"
                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
                      />
                    </div>
                  </>
                ) : (
                  <div className="md:col-span-2">
                    <label className="block text-[12px] font-semibold text-on-surface-variant uppercase mb-2">Server URL</label>
                    <input
                      type="text"
                      value={configForm.url ?? ''}
                      onChange={(e) => setConfigForm({ ...configForm, url: e.target.value })}
                      placeholder="https://example.com/mcp"
                      className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleConnect}
                  disabled={!configForm.name.trim()}
                  className="px-4 py-2 bg-primary-container text-white rounded-lg text-sm font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40"
                >
                  Connect
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 bg-surface-bright text-on-surface border border-outline-variant rounded-lg text-sm font-semibold hover:bg-surface-container-high transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Install Config Modal */}
          {installingItem && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
              <div className="bg-surface-container rounded-2xl shadow-2xl w-[480px] max-w-full border border-outline-variant p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className={`w-10 h-10 rounded-lg ${installingItem.iconBg} flex items-center justify-center`}>
                    <span className={`material-symbols-outlined ${installingItem.iconColor}`}>{installingItem.icon}</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-on-surface">Install {installingItem.name}</h3>
                    <p className="text-sm text-on-surface-variant">Configure required settings</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  {installingItem.configFields?.map((field) => (
                    <div key={field.key}>
                      <label className="block text-[12px] font-semibold text-on-surface-variant uppercase mb-2">
                        {field.label}
                      </label>
                      <input
                        type="text"
                        value={installConfig[field.key] || ''}
                        onChange={(e) => setInstallConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface outline-none focus:border-secondary"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => { setInstallingItem(null); setInstallConfig({}) }}
                    className="px-4 py-2 text-on-surface-variant hover:text-on-surface text-sm font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleInstallWithConfig}
                    className="px-5 py-2 bg-primary-container text-white rounded-lg text-sm font-semibold hover:bg-accent-hover transition-colors"
                  >
                    Install & Connect
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Connected Servers Section */}
          <section className="mb-12">
            <h2 className="font-h2 text-h2 text-on-surface mb-6 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary-container">dns</span>
              Connected Servers
            </h2>
            {servers.length === 0 ? (
              <div className="bg-surface-container rounded-xl border border-outline-variant p-8 text-center">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">hub</span>
                <p className="text-on-surface-variant">No MCP servers connected yet.</p>
                <p className="text-on-surface-variant/70 text-sm mt-1">Browse the marketplace below to install one.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {servers.map((server) => {
                  const cfg = statusConfig[server.status]
                  const isConnected = server.status === 'connected'
                  return (
                    <div
                      key={server.id}
                      className="bg-surface-container rounded-xl border border-outline-variant p-6 hover:bg-surface-container-high transition-colors group"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-lg bg-surface-bright flex items-center justify-center border border-outline-variant">
                            <span className="material-symbols-outlined text-primary text-2xl">memory</span>
                          </div>
                          <div>
                            <h3 className="font-h3 text-h3 text-on-surface">{server.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <div className={`w-2 h-2 rounded-full ${cfg.dot} ${cfg.shadow}`}></div>
                              <span className={`font-label-sm text-label-sm ${cfg.text}`}>{cfg.label}</span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDelete(server.id)}
                          disabled={loadingIds.has(server.id)}
                          className="text-on-surface-variant hover:text-error transition-colors p-1 rounded hover:bg-error/10 disabled:opacity-40"
                          title="Delete server"
                        >
                          <span className="material-symbols-outlined">delete</span>
                        </button>
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant mb-6">
                        {server.toolCount > 0
                          ? `Provides ${server.toolCount} tool${server.toolCount !== 1 ? 's' : ''} and ${server.resourceCount} resource${server.resourceCount !== 1 ? 's' : ''}.`
                          : 'MCP server for extended AI capabilities.'}
                      </p>
                      <div className="flex gap-2 mt-auto">
                        <button
                          onClick={() => handleRestart(server.id)}
                          disabled={loadingIds.has(server.id)}
                          className="flex-1 bg-surface-bright text-on-surface border border-outline-variant py-2 rounded-lg font-label-md text-label-md hover:border-primary/50 transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
                        >
                          <span className="material-symbols-outlined text-[18px]">settings</span> Config
                        </button>
                        {isConnected ? (
                          <>
                            <button
                              onClick={() => handleRestart(server.id)}
                              disabled={loadingIds.has(server.id)}
                              className="flex-1 bg-surface-bright text-on-surface border border-outline-variant py-2 rounded-lg font-label-md text-label-md hover:border-primary/50 transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
                            >
                              <span className="material-symbols-outlined text-[18px]">restart_alt</span> Restart
                            </button>
                            <button
                              onClick={() => handleDisconnect(server.id)}
                              disabled={loadingIds.has(server.id)}
                              className="flex-1 bg-error/10 text-error border border-error/30 py-2 rounded-lg font-label-md text-label-md hover:bg-error/20 transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
                            >
                              <span className="material-symbols-outlined text-[18px]">power_settings_new</span> Disable
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleServerConnect(server)}
                            disabled={loadingIds.has(server.id)}
                            className="flex-1 bg-primary-container text-white border border-primary-container py-2 rounded-lg font-label-md text-label-md hover:bg-accent-hover transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
                          >
                            <span className="material-symbols-outlined text-[18px]">power_settings_new</span> Enable
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Marketplace Section */}
          <section>
            <div className="flex justify-between items-center mb-6 border-b border-outline-variant pb-4">
              <h2 className="font-h2 text-h2 text-on-surface flex items-center gap-3">
                <span className="material-symbols-outlined text-primary-container">storefront</span>
                MCP Marketplace
              </h2>
              <div className="relative w-64">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search integrations..."
                  className="w-full bg-surface-container border border-outline-variant rounded-lg pl-10 pr-4 py-2 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all"
                />
              </div>
            </div>

            {/* Category Filters */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-colors border ${
                    selectedCategory === category
                      ? 'bg-primary-container/20 border-primary-container text-primary-fixed'
                      : 'bg-surface-container-high border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredMarketplace.map((item) => {
                const isInstalled = installedIds.has(item.id)
                return (
                  <div
                    key={item.id}
                    className="bg-surface-container-low border border-outline-variant/50 rounded-xl p-5 hover:bg-surface-container transition-colors flex flex-col h-full"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-lg ${item.iconBg} flex items-center justify-center`}>
                        <span className={`material-symbols-outlined ${item.iconColor}`}>{item.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-h3 text-h3 text-on-surface text-base truncate">{item.name}</h4>
                        <span className="text-[11px] text-on-surface-variant">{item.category}</span>
                      </div>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mb-4 flex-1">{item.description}</p>
                    {isInstalled ? (
                      <div className="flex items-center gap-2 text-[12px] text-emerald-400 font-semibold">
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                        Installed
                      </div>
                    ) : (
                      <button
                        onClick={() => handleInstall(item)}
                        className="w-full border border-primary/30 text-primary py-2 rounded-lg font-label-md text-label-md hover:bg-primary/10 transition-colors"
                      >
                        {item.requiresConfig ? 'Configure & Install' : 'Install'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
