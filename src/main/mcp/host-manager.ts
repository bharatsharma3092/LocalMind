import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ChildProcess } from 'child_process'

export type MCPTransportType = 'stdio' | 'http+sse' | 'streamable-http'

export interface MCPServerConfig {
  id: string
  name: string
  transport: MCPTransportType
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  autoApprove?: string[]
  enabled?: boolean
}

export interface MCPServerStatus {
  id: string
  name: string
  status: 'connected' | 'disconnected' | 'error' | 'connecting'
  error?: string
  toolCount: number
  resourceCount: number
}

export interface MCPToolInfo {
  serverId: string
  serverName: string
  name: string
  description?: string
  inputSchema: any
}

export interface MCPResourceInfo {
  serverId: string
  serverName: string
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface MCPPromptInfo {
  serverId: string
  serverName: string
  name: string
  description?: string
  arguments?: { name: string; description?: string; required?: boolean }[]
}

interface ConnectedServer {
  client: Client
  transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport
  process?: ChildProcess
  config: MCPServerConfig
  toolCount: number
  resourceCount: number
  error?: string
}

const log = {
  info:  (msg: string, data?: unknown) => console.log(`[MCP] ${msg}`, data !== undefined ? data : ''),
  warn:  (msg: string, data?: unknown) => console.warn(`[MCP] [WARN] ${msg}`, data !== undefined ? data : ''),
  error: (msg: string, data?: unknown) => console.error(`[MCP] [ERROR] ${msg}`, data !== undefined ? data : ''),
}

function requestInitForRemoteTransport(config: MCPServerConfig): RequestInit | undefined {
  const headers = Object.entries(config.headers ?? {}).reduce<Record<string, string>>((acc, [key, value]) => {
    const cleanKey = key.trim()
    const cleanValue = value.trim()
    if (cleanKey && cleanValue) acc[cleanKey] = cleanValue
    return acc
  }, {})

  return Object.keys(headers).length > 0 ? { headers } : undefined
}

function enrichConnectionError(message: string): string {
  if (/connection closed/i.test(message) && !message.includes('\n')) {
    return `${message}\nThe MCP server process exited before completing the handshake. Check the command, arguments, API keys, and whether the package is still valid.`
  }
  if (/\b401\b/.test(message)) {
    return `${message}\nRemote MCP server returned 401 Unauthorized. Add or verify the API key/Bearer token in the server headers.`
  }
  if (/\b403\b/.test(message)) {
    return `${message}\nRemote MCP server returned 403 Forbidden. Check the API key permissions and account access for this MCP server.`
  }
  return message
}

class MCPHostManager {
  private servers = new Map<string, ConnectedServer>()

  async connectServer(config: MCPServerConfig): Promise<void> {
    if (this.servers.has(config.id)) {
      await this.disconnectServer(config.id)
    }

    let transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport
    let stderrOutput = ''

    if (config.transport === 'stdio') {
      if (!config.command) throw new Error('stdio transport requires a command')
      
      let finalCommand = config.command
      let finalArgs = config.args ?? []
      
      if (process.platform === 'win32') {
        // Use cmd.exe /c to launch batch files or CLI scripts on Windows reliably
        finalCommand = 'cmd.exe'
        finalArgs = ['/c', config.command, ...(config.args ?? [])]
      }
      
      log.info(`Connecting stdio: ${finalCommand} ${finalArgs.join(' ')}`)
      transport = new StdioClientTransport({
        command: finalCommand,
        args: finalArgs,
        env: config.env ? { ...process.env, ...config.env } : undefined,
        stderr: 'pipe',
      })

      const stderr = transport.stderr
      if (stderr) {
        log.info(`Hooked stderr for server "${config.name}"`)
        stderr.on('data', (chunk: Buffer) => {
          const text = chunk.toString('utf-8')
          stderrOutput = `${stderrOutput}${text}`.slice(-8000)
          log.info(`[${config.name} STDERR] ${text.trim()}`)

          // Automatically parse and launch OAuth URLs in the default browser
          const urlMatch = text.match(/https?:\/\/[^\s"'`]+/g)
          if (urlMatch) {
            for (const url of urlMatch) {
              if (url.includes('google.com') || url.includes('accounts.google') || url.includes('oauth')) {
                log.info(`Detected OAuth URL on stderr: ${url}`)
                import('electron').then(({ shell }) => {
                  shell.openExternal(url).catch(err => {
                    log.error(`Failed to open OAuth URL: ${err.message}`)
                  })
                })
              }
            }
          }
        })
      }
    } else if (config.transport === 'http+sse') {
      if (!config.url) throw new Error('http+sse transport requires a URL')
      log.info(`Connecting SSE: ${config.url}`)
      transport = new SSEClientTransport(new URL(config.url), {
        requestInit: requestInitForRemoteTransport(config),
      })
    } else if (config.transport === 'streamable-http') {
      if (!config.url) throw new Error('streamable-http transport requires a URL')
      log.info(`Connecting Streamable HTTP: ${config.url}`)
      transport = new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: requestInitForRemoteTransport(config),
      })
    } else {
      throw new Error(`Unknown transport type: ${config.transport}`)
    }

    const client = new Client(
      { name: 'localmind', version: '1.0.0' },
      { capabilities: {} }
    )

    try {
      await client.connect(transport)
      log.info(`Client connected, fetching capabilities for "${config.name}"`)

      let toolCount = 0
      let resourceCount = 0

      try {
        const toolsResult = await client.listTools()
        toolCount = toolsResult.tools.length
        log.info(`Server "${config.name}" has ${toolCount} tools: ${toolsResult.tools.map((t) => t.name).join(', ')}`)
      } catch (err: any) {
        log.warn(`listTools failed for "${config.name}": ${err.message}`)
      }

      try {
        const resourcesResult = await client.listResources()
        resourceCount = resourcesResult.resources.length
        log.info(`Server "${config.name}" has ${resourceCount} resources`)
      } catch (err: any) {
        log.warn(`listResources failed for "${config.name}": ${err.message}`)
      }

      this.servers.set(config.id, { client, transport, config, toolCount, resourceCount })
      log.info(`Server "${config.name}" (${config.id}) registered with ${toolCount} tools, ${resourceCount} resources`)
    } catch (err: any) {
      const stderrMessage = stderrOutput.trim()
      const baseMessage = stderrMessage ? `${err.message}\n${stderrMessage}` : err.message
      const message = enrichConnectionError(baseMessage)
      log.error(`Failed to connect "${config.name}": ${message}`, err.stack)
      try { await transport.close() } catch {}
      throw new Error(`Failed to connect to MCP server "${config.name}": ${message}`)
    }
  }

  async disconnectServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId)
    if (!server) return

    try {
      await server.client.close()
    } catch {}

    try {
      await server.transport.close()
    } catch {}

    this.servers.delete(serverId)
    log.info(`Server ${serverId} disconnected`)
  }

  async restartServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId)
    if (!server) throw new Error(`Server ${serverId} not found`)
    const config = server.config
    await this.disconnectServer(serverId)
    await this.connectServer(config)
  }

  async callTool(serverId: string, toolName: string, args: Record<string, any>): Promise<any> {
    const server = this.servers.get(serverId)
    if (!server) throw new Error(`Server ${serverId} not connected`)

    const result = await server.client.callTool({ name: toolName, arguments: args })
    return result
  }

  async listAllTools(): Promise<MCPToolInfo[]> {
    const allTools: MCPToolInfo[] = []
    for (const [serverId, server] of this.servers) {
      try {
        const result = await server.client.listTools()
        for (const tool of result.tools) {
          allTools.push({
            serverId,
            serverName: server.config.name,
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })
        }
      } catch (err: any) {
        log.error(`listAllTools failed for ${serverId}: ${err.message}`)
      }
    }
    return allTools
  }

  async listToolsForServer(serverId: string): Promise<MCPToolInfo[]> {
    const server = this.servers.get(serverId)
    if (!server) return []
    try {
      const result = await server.client.listTools()
      return result.tools.map((tool) => ({
        serverId,
        serverName: server.config.name,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }))
    } catch (err: any) {
      log.error(`listToolsForServer failed for ${serverId}: ${err.message}`)
      return []
    }
  }

  async listResources(serverId: string): Promise<MCPResourceInfo[]> {
    const server = this.servers.get(serverId)
    if (!server) return []
    try {
      const result = await server.client.listResources()
      return result.resources.map((r) => ({
        serverId,
        serverName: server.config.name,
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      }))
    } catch (err: any) {
      log.error(`listResources failed for ${serverId}: ${err.message}`)
      return []
    }
  }

  async readResource(serverId: string, uri: string): Promise<any> {
    const server = this.servers.get(serverId)
    if (!server) throw new Error(`Server ${serverId} not connected`)
    return server.client.readResource({ uri })
  }

  async listPrompts(serverId: string): Promise<MCPPromptInfo[]> {
    const server = this.servers.get(serverId)
    if (!server) return []
    try {
      const result = await server.client.listPrompts()
      return result.prompts.map((p) => ({
        serverId,
        serverName: server.config.name,
        name: p.name,
        description: p.description,
        arguments: p.arguments,
      }))
    } catch (err: any) {
      log.error(`listPrompts failed for ${serverId}: ${err.message}`)
      return []
    }
  }

  async getPrompt(serverId: string, promptName: string, args?: Record<string, string>): Promise<any> {
    const server = this.servers.get(serverId)
    if (!server) throw new Error(`Server ${serverId} not connected`)
    return server.client.getPrompt({ name: promptName, arguments: args })
  }

  async getServerStatus(): Promise<MCPServerStatus[]> {
    const statuses: MCPServerStatus[] = []
    for (const [id, server] of this.servers) {
      let toolCount = server.toolCount
      let resourceCount = server.resourceCount

      try {
        const toolsResult = await server.client.listTools()
        toolCount = toolsResult.tools.length
        server.toolCount = toolCount
      } catch {}

      try {
        const resourcesResult = await server.client.listResources()
        resourceCount = resourcesResult.resources.length
        server.resourceCount = resourceCount
      } catch {}

      statuses.push({
        id,
        name: server.config.name,
        status: 'connected',
        toolCount,
        resourceCount,
      })
    }
    return statuses
  }

  async getServerStatusById(serverId: string): Promise<MCPServerStatus | null> {
    const server = this.servers.get(serverId)
    if (!server) return null

    let toolCount = server.toolCount
    let resourceCount = server.resourceCount

    try {
      const toolsResult = await server.client.listTools()
      toolCount = toolsResult.tools.length
      server.toolCount = toolCount
    } catch {}

    try {
      const resourcesResult = await server.client.listResources()
      resourceCount = resourcesResult.resources.length
      server.resourceCount = resourceCount
    } catch {}

    return {
      id: serverId,
      name: server.config.name,
      status: 'connected',
      toolCount,
      resourceCount,
    }
  }

  isToolAutoApproved(serverId: string, toolName: string): boolean {
    const server = this.servers.get(serverId)
    if (!server) return false
    return server.config.autoApprove?.includes(toolName) ?? false
  }

  getConnectedServerIds(): string[] {
    return Array.from(this.servers.keys())
  }

  async disconnectAll(): Promise<void> {
    for (const id of Array.from(this.servers.keys())) {
      await this.disconnectServer(id)
    }
  }
}

export const mcpHostManager = new MCPHostManager()

export async function reconnectSavedServers(savedConfigs: MCPServerConfig[]): Promise<void> {
  for (const config of savedConfigs) {
    if (!config.enabled) continue
    try {
      log.info(`Reconnecting saved server: ${config.name} (${config.id})`)
      await mcpHostManager.connectServer(config)
    } catch (err: any) {
      log.error(`Failed to reconnect ${config.name}: ${err.message}`)
    }
  }
}
