import { useState, useEffect, useCallback } from 'react'

interface ServerStatus {
  id: string
  name: string
  status: 'connected' | 'disconnected' | 'error' | 'connecting'
  toolCount: number
  resourceCount: number
  error?: string
}

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

const emptyConfig: ServerConfig = {
  name: '',
  transport: 'stdio',
  command: '',
  args: [],
  url: '',
  autoApprove: [],
}

export function McpConfigEditor() {
  const [servers, setServers] = useState<ServerStatus[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ServerConfig>({ ...emptyConfig })
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const res = await window.localmind.mcp.serverStatus()
    if (res.success && res.data) setServers(res.data)
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 15000)
    return () => clearInterval(interval)
  }, [refresh])

  const handleConnect = async () => {
    if (!form.name.trim()) return setError('Server name is required')
    setConnecting(true)
    setError(null)
    try {
      const res = await window.localmind.mcp.connect(form)
      if (!res.success) {
        setError(res.error ?? 'Failed to connect')
      } else {
        setShowForm(false)
        setForm({ ...emptyConfig })
        refresh()
      }
    } catch (err: any) {
      setError(err.message ?? 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async (id: string) => {
    await window.localmind.mcp.disconnect(id)
    refresh()
  }

  const handleRestart = async (id: string) => {
    try {
      await window.localmind.mcp.restart(id)
      refresh()
    } catch {}
  }

  const handleEdit = (server: ServerStatus) => {
    setEditingId(server.id)
    setShowForm(true)
    setForm({
      id: server.id,
      name: server.name,
      transport: 'stdio',
      command: '',
      args: [],
      url: '',
      autoApprove: [],
    })
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-muted uppercase">MCP Servers</h3>
        <button
          onClick={() => {
            setShowForm(!showForm)
            setEditingId(null)
            setForm({ ...emptyConfig })
            setError(null)
          }}
          className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs hover:bg-accent-hover transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Server'}
        </button>
      </div>

      {showForm && (
        <div className="bg-surface-offset border border-border rounded-xl p-4 space-y-3 mb-4">
          <div>
            <label className="text-xs text-text-muted block mb-1">Server Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., filesystem-server"
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1">Transport</label>
            <div className="flex gap-2">
              {(['stdio', 'http+sse'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, transport: t })}
                  className={`px-3 py-1.5 rounded-lg text-sm ${
                    form.transport === t
                      ? 'bg-accent text-white'
                      : 'bg-surface border border-border text-text-muted hover:text-text'
                  }`}
                >
                  {t === 'stdio' ? 'Stdio' : 'HTTP/SSE'}
                </button>
              ))}
            </div>
          </div>

          {form.transport === 'stdio' ? (
            <>
              <div>
                <label className="text-xs text-text-muted block mb-1">Command</label>
                <input
                  type="text"
                  value={form.command ?? ''}
                  onChange={(e) => setForm({ ...form, command: e.target.value })}
                  placeholder="e.g., npx, python, node"
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">Arguments</label>
                <input
                  type="text"
                  value={form.args?.join(' ') ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, args: e.target.value.split(' ').filter(Boolean) })
                  }
                  placeholder="e.g., -y @modelcontextprotocol/server-filesystem /path"
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs text-text-muted block mb-1">Server URL</label>
              <input
                type="text"
                value={form.url ?? ''}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="e.g., http://localhost:3001/sse"
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-text-muted block mb-1">
              Auto-approve Tools (comma-separated)
            </label>
            <input
              type="text"
              value={form.autoApprove?.join(', ') ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  autoApprove: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="e.g., read_file, list_directory"
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="btn-primary text-xs disabled:opacity-50"
            >
              {connecting ? 'Connecting...' : editingId ? 'Reconnect' : 'Connect'}
            </button>
            <button
              onClick={() => {
                setShowForm(false)
                setError(null)
              }}
              className="btn-ghost text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {servers.length === 0 && !showForm && (
        <p className="text-sm text-text-muted py-2">
          No MCP servers configured. Add one to enable tool use.
        </p>
      )}

      <div className="space-y-2">
        {servers.map((server) => (
          <div
            key={server.id}
            className="flex items-center justify-between bg-surface-offset border border-border rounded-xl px-4 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  server.status === 'connected'
                    ? 'bg-success'
                    : server.status === 'connecting'
                      ? 'bg-warning animate-pulse'
                      : 'bg-danger'
                }`}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{server.name}</p>
                <p className="text-xs text-text-muted">
                  {server.status === 'connected'
                    ? `${server.toolCount} tools \u00b7 ${server.resourceCount} resources`
                    : server.status === 'disconnected'
                      ? 'Disconnected'
                      : server.status}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {server.status === 'connected' && (
                <button
                  onClick={() => handleRestart(server.id)}
                  className="p-1.5 rounded-lg hover:bg-surface text-text-muted hover:text-text transition-colors"
                  title="Restart"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
              {server.status !== 'connected' && server.status !== 'connecting' && (
                <button
                  onClick={async () => {
                    if (window.localmind.mcp.removeServer) {
                      await window.localmind.mcp.removeServer(server.id)
                      refresh()
                    }
                  }}
                  className="p-1.5 rounded-lg hover:bg-surface text-text-muted hover:text-danger transition-colors"
                  title="Remove"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
              <div
                onClick={async () => {
                  if (server.status === 'connecting') return;
                  if (server.status === 'connected') {
                    await handleDisconnect(server.id)
                  } else {
                    try {
                      await window.localmind.mcp.restart(server.id)
                      refresh()
                    } catch {
                      try {
                        await window.localmind.mcp.connect({ id: server.id, name: server.name })
                        refresh()
                      } catch {}
                    }
                  }
                }}
                className={`w-10 h-6 rounded-full relative transition-colors ${server.status === 'connecting' ? 'cursor-wait opacity-50' : 'cursor-pointer'} ${
                  server.status === 'connected' ? 'bg-accent' : 'bg-surface-offset border border-border'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    server.status === 'connected' ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
