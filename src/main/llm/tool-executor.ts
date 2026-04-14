import { mcpHostManager } from '../mcp/host-manager'
import type { ToolDefinition, LLMMessage, ToolCall } from '@shared/types/localmind-api'

interface MCPToolEntry {
  serverId: string
  serverName: string
  toolName: string
  description?: string
  inputSchema: any
}

const log = {
  info:  (msg: string, data?: unknown) => console.log(`[ToolExec] ${msg}`, data !== undefined ? data : ''),
  error: (msg: string, data?: unknown) => console.error(`[ToolExec] [ERROR] ${msg}`, data !== undefined ? data : ''),
}

function stripUnsupportedSchemaFields(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(stripUnsupportedSchemaFields)
  const cleaned: any = {}
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'additionalProperties') continue
    cleaned[key] = stripUnsupportedSchemaFields(value)
  }
  return cleaned
}

export async function getMcpToolsAsLlmTools(): Promise<ToolDefinition[]> {
  const mcpTools = await mcpHostManager.listAllTools()
  if (mcpTools.length === 0) return []

  return mcpTools.map((t) => ({
    type: 'function' as const,
    function: {
      name: `mcp__${t.serverId}__${t.name}`,
      description: `[${t.serverName}] ${t.description ?? t.name}`,
      parameters: stripUnsupportedSchemaFields(t.inputSchema ?? { type: 'object', properties: {} }),
    },
  }))
}

function parseMcpToolName(fullName: string): { serverId: string; toolName: string } | null {
  const parts = fullName.split('__')
  if (parts.length < 3 || parts[0] !== 'mcp') return null
  return { serverId: parts[1], toolName: parts.slice(2).join('__') }
}

export async function executeMcpToolCall(
  toolCall: ToolCall,
  approvalHandler?: (serverId: string, toolName: string, args: Record<string, any>) => Promise<boolean>
): Promise<{ role: 'tool'; content: string; toolCallId: string }> {
  const parsed = parseMcpToolName(toolCall.name)
  if (!parsed) {
    log.error(`Cannot parse tool name: ${toolCall.name}`)
    return {
      role: 'tool',
      content: JSON.stringify({ error: `Unknown tool name format: ${toolCall.name}` }),
      toolCallId: toolCall.id,
    }
  }

  const { serverId, toolName } = parsed
  let args: Record<string, any> = {}
  try {
    args = JSON.parse(toolCall.arguments || '{}')
  } catch {
    args = {}
  }

  if (approvalHandler) {
    const approved = await approvalHandler(serverId, toolName, args)
    if (!approved) {
      return {
        role: 'tool',
        content: JSON.stringify({ error: 'Tool call was denied by user' }),
        toolCallId: toolCall.id,
      }
    }
  }

  try {
    log.info(`Executing MCP tool: ${toolCall.name}`, { serverId, toolName, args })
    const result = await mcpHostManager.callTool(serverId, toolName, args)
    const content = typeof result === 'string' ? result : JSON.stringify(result)
    log.info(`MCP tool result received`, { toolName, contentLength: content.length })
    return { role: 'tool', content, toolCallId: toolCall.id }
  } catch (err: any) {
    log.error(`MCP tool execution failed: ${toolCall.name}`, err.message)
    return {
      role: 'tool',
      content: JSON.stringify({ error: err.message ?? 'Tool execution failed' }),
      toolCallId: toolCall.id,
    }
  }
}

export function isMcpToolName(name: string): boolean {
  return name.startsWith('mcp__')
}

export { parseMcpToolName }
