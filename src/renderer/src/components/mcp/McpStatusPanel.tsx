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

export function McpStatusPanel() {
  const [servers, setServers] = useState<ServerStatus[]>([])
  const [showConfig, setShowConfig] = useState(false)
  const [configForm, setConfigForm] = useState<ServerConfig>({
    name: '',
    transport: 'stdio',
    command: '',
    args: [],
    url: '',
    autoApprove: [],
  })

  const refreshStatus = useCallback(async () => {
    const res = await window.localmind.mcp.serverStatus()
    if (res.success && res.data) setServers(res.data)
  }, [])

  useEffect(() => {
    refreshStatus()
    const interval = setInterval(refreshStatus, 10000)
    return () => clearInterval(interval)
  }, [refreshStatus])

  const handleConnect = async () => {
    await window.localmind.mcp.connect(configForm)
    setShowConfig(false)
    setConfigForm({ name: '', transport: 'stdio', command: '', args: [], url: '', autoApprove: [] })
    refreshStatus()
  }

  const handleDisconnect = async (id: string) => {
    await window.localmind.mcp.disconnect(id)
    refreshStatus()
  }

  const handleRestart = async (id: string) => {
    await window.localmind.mcp.restart(id)
    refreshStatus()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="text-sm font-semibold">MCP Servers</h3>
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="px-2 py-1 bg-accent text-white rounded text-xs hover:bg-accent-hover"
        >
          + Add Server
        </button>
      </div>

      {showConfig && (
        <div className="p-3 border-b border-border bg-surface-offset space-y-2">
          <input
            type="text"
            value={configForm.name}
            onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })}
            placeholder="Server name"
            className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text"
          />
          <select
            value={configForm.transport}
            onChange={(e) => setConfigForm({ ...configForm, transport: e.target.value as 'stdio' | 'http+sse' })}
            className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text"
          >
            <option value="stdio">stdio</option>
            <option value="http+sse">HTTP/SSE</option>
          </select>
          {configForm.transport === 'stdio' ? (
            <>
              <input
                type="text"
                value={configForm.command ?? ''}
                onChange={(e) => setConfigForm({ ...configForm, command: e.target.value })}
                placeholder="Command (e.g., npx)"
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text"
              />
              <input
                type="text"
                value={configForm.args?.join(' ') ?? ''}
                onChange={(e) => setConfigForm({ ...configForm, args: e.target.value.split(' ').filter(Boolean) })}
                placeholder="Arguments (space-separated)"
                className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text"
              />
            </>
          ) : (
            <input
              type="text"
              value={configForm.url ?? ''}
              onChange={(e) => setConfigForm({ ...configForm, url: e.target.value })}
              placeholder="Server URL"
              className="w-full bg-surface border border-border rounded px-2 py-1.5 text-sm text-text"
            />
          )}
          <div className="flex gap-2">
            <button onClick={handleConnect} className="btn-primary text-xs py-1">Connect</button>
            <button onClick={() => setShowConfig(false)} className="btn-ghost text-xs py-1">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {servers.length === 0 && (
          <div className="text-center text-sm text-text-muted p-4">No MCP servers connected</div>
        )}
        {servers.map((server) => (
          <div key={server.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-offset mb-1">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                server.status === 'connected' ? 'bg-green-500' :
                server.status === 'connecting' ? 'bg-amber-500' : 'bg-red-500'
              }`} />
              <span className="text-sm">{server.name}</span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => handleRestart(server.id)} className="text-xs text-text-muted hover:text-text px-1" title="Restart">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
              <button onClick={() => handleDisconnect(server.id)} className="text-xs text-text-muted hover:text-danger px-1" title="Disconnect">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
