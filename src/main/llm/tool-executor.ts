import { mcpHostManager } from '../mcp/host-manager'
import { extractFileContent } from '../files/extractor'
import type { ToolDefinition, ToolCall } from '@shared/types/localmind-api'
import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import { dirname, extname, join, relative, resolve } from 'path'
import { promisify } from 'util'

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

const execFileAsync = promisify(execFile)
const defaultWorkspaceRoot = resolve(process.cwd())
const ignoredDirs = new Set(['.git', 'node_modules', 'out', 'dist', 'build', '.playwright-cli'])
const textExtensions = new Set([
  '.c', '.cpp', '.cs', '.css', '.csv', '.env', '.html', '.js', '.json', '.jsx', '.md',
  '.mjs', '.py', '.rs', '.sql', '.ts', '.tsx', '.txt', '.yaml', '.yml',
])
const extractableExtensions = new Set(['.pdf', '.docx', '.pptx', '.xlsx'])

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

function getWorkspaceRoot(workspacePath?: string): string {
  return resolve(workspacePath || defaultWorkspaceRoot)
}

function resolveWorkspacePath(inputPath = '.', workspacePath?: string): string {
  const workspaceRoot = getWorkspaceRoot(workspacePath)
  const resolved = resolve(workspaceRoot, inputPath)
  const rel = relative(workspaceRoot, resolved)
  if (rel.startsWith('..') || resolve(rel) === resolved) {
    throw new Error(`Path is outside the workspace: ${inputPath}`)
  }
  return resolved
}

function toWorkspacePath(absPath: string, workspacePath?: string): string {
  const workspaceRoot = getWorkspaceRoot(workspacePath)
  const rel = relative(workspaceRoot, absPath)
  return rel === '' ? '.' : rel.replace(/\\/g, '/')
}

function wildcardToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/')
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const regex = escaped.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')
  return new RegExp(`^${regex}$`, 'i')
}

async function walkFiles(root: string, maxFiles: number, workspacePath?: string): Promise<string[]> {
  const results: string[] = []

  async function visit(dir: string): Promise<void> {
    if (results.length >= maxFiles) return
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (results.length >= maxFiles) break
      if (entry.name.startsWith('.') && entry.name !== '.env') continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) await visit(fullPath)
      } else if (entry.isFile()) {
        results.push(toWorkspacePath(fullPath, workspacePath))
      }
    }
  }

  await visit(root)
  return results
}

export function getLocalWorkspaceTools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'local__list_files',
        description: 'List files inside the current workspace. Use this before reading unknown paths.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Workspace-relative directory path. Defaults to the workspace root.' },
            maxFiles: { type: 'number', description: 'Maximum files to return. Defaults to 100.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__glob',
        description: 'Find workspace files by a glob-like pattern such as src/**/*.ts or **/*.tsx.',
        parameters: {
          type: 'object',
          required: ['pattern'],
          properties: {
            pattern: { type: 'string', description: 'Glob-like file pattern.' },
            maxFiles: { type: 'number', description: 'Maximum files to return. Defaults to 100.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__read_file',
        description: 'Read a file from the current workspace. Supports text, PDF, DOCX, PPTX, and XLSX extraction.',
        parameters: {
          type: 'object',
          required: ['path'],
          properties: {
            path: { type: 'string', description: 'Workspace-relative file path.' },
            startLine: { type: 'number', description: '1-based starting line. Defaults to 1.' },
            maxLines: { type: 'number', description: 'Maximum lines to return. Defaults to 200.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__search_files',
        description: 'Search text files in the current workspace for a query.',
        parameters: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', description: 'Case-insensitive text to search for.' },
            path: { type: 'string', description: 'Workspace-relative directory path. Defaults to the workspace root.' },
            maxResults: { type: 'number', description: 'Maximum matching lines to return. Defaults to 50.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__grep',
        description: 'Search workspace text files for a query. Alias of local__search_files.',
        parameters: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', description: 'Case-insensitive text to search for.' },
            path: { type: 'string', description: 'Workspace-relative directory path. Defaults to the workspace root.' },
            maxResults: { type: 'number', description: 'Maximum matching lines to return. Defaults to 50.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__write_file',
        description: 'Create or replace a file inside the current workspace.',
        parameters: {
          type: 'object',
          required: ['path', 'content'],
          properties: {
            path: { type: 'string', description: 'Workspace-relative file path.' },
            content: { type: 'string', description: 'Complete file content to write.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__edit_file',
        description: 'Edit a text file by replacing an exact string. Prefer this for targeted code changes.',
        parameters: {
          type: 'object',
          required: ['path', 'oldText', 'newText'],
          properties: {
            path: { type: 'string', description: 'Workspace-relative file path.' },
            oldText: { type: 'string', description: 'Exact text to replace.' },
            newText: { type: 'string', description: 'Replacement text.' },
            replaceAll: { type: 'boolean', description: 'Replace every occurrence. Defaults to false.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__delete_path',
        description: 'Delete a workspace file or directory. This requires explicit user approval at action time.',
        parameters: {
          type: 'object',
          required: ['path'],
          properties: {
            path: { type: 'string', description: 'Workspace-relative file or directory path to delete.' },
            recursive: { type: 'boolean', description: 'Allow directory deletion. Defaults to false.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__run_npm_script',
        description: 'Run an existing npm script from package.json in the current workspace.',
        parameters: {
          type: 'object',
          required: ['script'],
          properties: {
            script: { type: 'string', description: 'Script name from package.json, such as build or test:unit.' },
          },
        },
      },
    },
  ]
}

export function getSkillTools(skills: Array<{ id: string; name: string; description?: string; parameters?: any[]; enabled?: boolean }>): ToolDefinition[] {
  return skills
    .filter((skill) => skill.enabled !== false)
    .map((skill) => ({
      type: 'function' as const,
      function: {
        name: `skill__${skill.id.replace(/[^a-zA-Z0-9_]/g, '_')}`,
        description: `[Skill] ${skill.name}: ${skill.description ?? 'Run this LocalMind skill.'}`,
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'The task or content to give this skill.' },
          },
        },
      },
    }))
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

export function isLocalToolName(name: string): boolean {
  return name.startsWith('local__')
}

export async function executeLocalToolCall(
  toolCall: ToolCall,
  workspacePath?: string,
  approvalHandler?: (toolName: string, args: Record<string, any>) => Promise<boolean>
): Promise<{ role: 'tool'; content: string; toolCallId: string }> {
  let args: Record<string, any> = {}
  try {
    args = JSON.parse(toolCall.arguments || '{}')
  } catch {
    args = {}
  }

  try {
    if (toolCall.name === 'local__list_files') {
      const workspaceRoot = getWorkspaceRoot(workspacePath)
      const root = resolveWorkspacePath(args.path ?? '.', workspacePath)
      const files = await walkFiles(root, Math.min(Number(args.maxFiles) || 100, 500), workspacePath)
      return { role: 'tool', content: JSON.stringify({ workspaceRoot, files }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__glob') {
      const workspaceRoot = getWorkspaceRoot(workspacePath)
      const pattern = String(args.pattern ?? '')
      if (!pattern) throw new Error('pattern is required')
      const regex = wildcardToRegExp(pattern)
      const files = await walkFiles(workspaceRoot, Math.min(Number(args.maxFiles) || 100, 500), workspacePath)
      return { role: 'tool', content: JSON.stringify({ files: files.filter((file) => regex.test(file)) }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__read_file') {
      const filePath = resolveWorkspacePath(String(args.path ?? ''), workspacePath)
      const extension = extname(filePath).toLowerCase()
      if (extractableExtensions.has(extension)) {
        const extracted = await extractFileContent(filePath)
        const lines = extracted.text.split(/\r?\n/)
        const startLine = Math.max(Number(args.startLine) || 1, 1)
        const maxLines = Math.min(Number(args.maxLines) || 200, 1000)
        const selected = lines.slice(startLine - 1, startLine - 1 + maxLines)
        return {
          role: 'tool',
          content: JSON.stringify({
            path: toWorkspacePath(filePath, workspacePath),
            extractedFrom: extension,
            startLine,
            endLine: startLine + selected.length - 1,
            content: selected.join('\n'),
          }),
          toolCallId: toolCall.id,
        }
      }
      if (extension && !textExtensions.has(extension)) {
        throw new Error(`Refusing to read likely binary file: ${args.path}`)
      }
      const text = await fs.readFile(filePath, 'utf-8')
      const lines = text.split(/\r?\n/)
      const startLine = Math.max(Number(args.startLine) || 1, 1)
      const maxLines = Math.min(Number(args.maxLines) || 200, 1000)
      const selected = lines.slice(startLine - 1, startLine - 1 + maxLines)
      return {
        role: 'tool',
        content: JSON.stringify({
          path: toWorkspacePath(filePath, workspacePath),
          startLine,
          endLine: startLine + selected.length - 1,
          content: selected.join('\n'),
        }),
        toolCallId: toolCall.id,
      }
    }

    if (toolCall.name === 'local__search_files' || toolCall.name === 'local__grep') {
      const root = resolveWorkspacePath(args.path ?? '.', workspacePath)
      const query = String(args.query ?? '').toLowerCase()
      if (!query) throw new Error('query is required')
      const files = await walkFiles(root, 1000, workspacePath)
      const maxResults = Math.min(Number(args.maxResults) || 50, 200)
      const matches: Array<{ path: string; line: number; text: string }> = []
      for (const relPath of files) {
        if (matches.length >= maxResults) break
        const filePath = resolveWorkspacePath(relPath, workspacePath)
        const extension = extname(filePath).toLowerCase()
        if (extension && !textExtensions.has(extension)) continue
        let text = ''
        try { text = await fs.readFile(filePath, 'utf-8') } catch { continue }
        text.split(/\r?\n/).some((line, index) => {
          if (line.toLowerCase().includes(query)) {
            matches.push({ path: relPath, line: index + 1, text: line.slice(0, 300) })
          }
          return matches.length >= maxResults
        })
      }
      return { role: 'tool', content: JSON.stringify({ matches }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__write_file') {
      const filePath = resolveWorkspacePath(String(args.path ?? ''), workspacePath)
      await fs.mkdir(dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, String(args.content ?? ''), 'utf-8')
      return { role: 'tool', content: JSON.stringify({ path: toWorkspacePath(filePath, workspacePath), bytes: Buffer.byteLength(String(args.content ?? ''), 'utf-8') }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__edit_file') {
      const filePath = resolveWorkspacePath(String(args.path ?? ''), workspacePath)
      const oldText = String(args.oldText ?? '')
      const newText = String(args.newText ?? '')
      if (!oldText) throw new Error('oldText is required')
      const current = await fs.readFile(filePath, 'utf-8')
      if (!current.includes(oldText)) throw new Error(`oldText was not found in ${args.path}`)
      const next = args.replaceAll ? current.split(oldText).join(newText) : current.replace(oldText, newText)
      await fs.writeFile(filePath, next, 'utf-8')
      return {
        role: 'tool',
        content: JSON.stringify({
          path: toWorkspacePath(filePath, workspacePath),
          replacements: args.replaceAll ? current.split(oldText).length - 1 : 1,
        }),
        toolCallId: toolCall.id,
      }
    }

    if (toolCall.name === 'local__delete_path') {
      if (!approvalHandler || !(await approvalHandler(toolCall.name, args))) {
        return {
          role: 'tool',
          content: JSON.stringify({ error: 'Delete was denied or not approved by the user' }),
          toolCallId: toolCall.id,
        }
      }

      const targetPath = resolveWorkspacePath(String(args.path ?? ''), workspacePath)
      if (toWorkspacePath(targetPath, workspacePath) === '.') throw new Error('Refusing to delete the workspace root')
      const stats = await fs.stat(targetPath)
      await fs.rm(targetPath, { recursive: Boolean(args.recursive) && stats.isDirectory(), force: false })
      return { role: 'tool', content: JSON.stringify({ deleted: toWorkspacePath(targetPath, workspacePath) }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__run_npm_script') {
      const workspaceRoot = getWorkspaceRoot(workspacePath)
      const packageJsonPath = resolveWorkspacePath('package.json', workspacePath)
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
      const script = String(args.script ?? '')
      if (!packageJson.scripts?.[script]) throw new Error(`npm script not found: ${script}`)
      const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
      const result = await execFileAsync(npmCommand, ['run', script], {
        cwd: workspaceRoot,
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      })
      return { role: 'tool', content: JSON.stringify({ stdout: result.stdout, stderr: result.stderr }), toolCallId: toolCall.id }
    }

    return {
      role: 'tool',
      content: JSON.stringify({ error: `Unknown local tool: ${toolCall.name}` }),
      toolCallId: toolCall.id,
    }
  } catch (err: any) {
    return {
      role: 'tool',
      content: JSON.stringify({ error: err.message ?? 'Local tool execution failed' }),
      toolCallId: toolCall.id,
    }
  }
}

export { parseMcpToolName }
