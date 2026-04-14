import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { ChildProcess } from 'child_process'

export interface MCPServerConfig {
  id: string
  name: string
  transport: 'stdio' | 'http+sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
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
  transport: StdioClientTransport | SSEClientTransport
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

class MCPHostManager {
  private servers = new Map<string, ConnectedServer>()

  async connectServer(config: MCPServerConfig): Promise<void> {
    if (this.servers.has(config.id)) {
      await this.disconnectServer(config.id)
    }

    let transport: StdioClientTransport | SSEClientTransport

    if (config.transport === 'stdio') {
      if (!config.command) throw new Error('stdio transport requires a command')
      log.info(`Connecting stdio: ${config.command} ${(config.args ?? []).join(' ')}`)
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env ? { ...process.env, ...config.env } : undefined,
      })
    } else if (config.transport === 'http+sse') {
      if (!config.url) throw new Error('http+sse transport requires a URL')
      log.info(`Connecting SSE: ${config.url}`)
      transport = new SSEClientTransport(new URL(config.url))
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
      log.error(`Failed to connect "${config.name}": ${err.message}`, err.stack)
      try { await transport.close() } catch {}
      throw new Error(`Failed to connect to MCP server "${config.name}": ${err.message}`)
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
