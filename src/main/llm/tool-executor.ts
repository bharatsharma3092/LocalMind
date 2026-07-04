import { mcpHostManager } from '../mcp/host-manager'
import { extractFileContent } from '../files/extractor'
import { searchWeb } from '../websearch/service'
import { browserController } from '../browser/controller'
import { queryDocumentsDetailed, getRagDocumentCount } from '../rag/indexer'
import type { ToolDefinition, ToolCall } from '@shared/types/localmind-api'
import { execFile, spawn } from 'child_process'
import { app, shell } from 'electron'
import { promises as fs, existsSync, realpathSync } from 'fs'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'path'
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

type PermissionMode = 'safe' | 'balanced' | 'trusted' | 'custom'
type ToolRiskLevel = 'low' | 'medium' | 'high' | 'critical'
type ToolCategory = 'read' | 'write' | 'delete' | 'shell' | 'network'

interface LocalToolExecutionOptions {
  sessionId?: string
  permissionMode?: PermissionMode
  approvalHandler?: (toolName: string, args: Record<string, any>, details?: ApprovalDetails) => Promise<boolean>
}

interface ApprovalDetails {
  riskLevel: ToolRiskLevel
  category: ToolCategory
  reason: string
  protectedPath?: boolean
}

interface PermissionDecision extends ApprovalDetails {
  decision: 'allow' | 'ask' | 'deny'
}

const writeTools = new Set([
  'local__write_file',
  'local__write_spreadsheet',
  'local__append_spreadsheet',
  'local__write_document',
  'local__append_document',
  'local__edit_file',
  'local__patch_file',
])
const deleteTools = new Set(['local__delete_path'])
const shellTools = new Set(['local__run_npm_script', 'local__run_command', 'local__launch_app'])
const networkTools = new Set([
  'web__search',
  'local__open_url',
  'local__browser_open',
  'local__browser_click',
  'local__browser_type',
  'local__browser_press_key',
])
const protectedPathPatterns = [
  '.env',
  '.env.*',
  '**/secrets/**',
  '**/*.pem',
  '**/*.key',
  '**/.git/**',
  '**/.ssh/**',
  '**/credentials/**',
  '**/auth/**',
]

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
  if (isAbsolute(inputPath)) {
    return resolve(inputPath)
  }

  const workspaceRoot = getWorkspaceRoot(workspacePath)
  
  // Resolve realpath of workspace root to handle symlinks correctly
  let realWorkspaceRoot = workspaceRoot
  try {
    if (existsSync(workspaceRoot)) {
      realWorkspaceRoot = realpathSync(workspaceRoot)
    }
  } catch {}

  const resolved = resolve(realWorkspaceRoot, inputPath)

  // Robust Write-Path Symlink Checking: climb up to find the nearest existing parent
  let checkPath = resolved
  while (checkPath && checkPath !== dirname(checkPath)) {
    if (existsSync(checkPath)) {
      try {
        const realCheckPath = realpathSync(checkPath)
        const rel = relative(realWorkspaceRoot, realCheckPath)
        if (rel.startsWith('..') || resolve(rel) === realCheckPath) {
          throw new Error(`Path resolves outside the workspace boundary: ${inputPath}`)
        }
      } catch (err) {
        throw new Error(`Path validation failed: ${inputPath} (${(err as Error).message})`)
      }
      break
    }
    checkPath = dirname(checkPath)
  }

  // Fallback relative boundary validation
  const rel = relative(realWorkspaceRoot, resolved)
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

function getUserDataPath(): string {
  try {
    return app.getPath('userData')
  } catch {
    return join(defaultWorkspaceRoot, '.localmind-runtime')
  }
}

function normalizeForPolicy(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '')
}

function pathMatchesPattern(pathValue: string, pattern: string): boolean {
  const normalizedPath = normalizeForPolicy(pathValue)
  const normalizedPattern = normalizeForPolicy(pattern)
  return wildcardToRegExp(normalizedPattern).test(normalizedPath) || wildcardToRegExp(`**/${normalizedPattern}`).test(normalizedPath)
}

function isProtectedPath(pathValue: string | undefined, workspacePath?: string): boolean {
  if (!pathValue) return false
  const relativePath = normalizeForPolicy(isAbsolute(pathValue) ? toWorkspacePath(resolve(pathValue), workspacePath) : pathValue)
  return protectedPathPatterns.some((pattern) => pathMatchesPattern(relativePath, pattern))
}

function getToolCategory(toolName: string): ToolCategory {
  if (deleteTools.has(toolName)) return 'delete'
  if (shellTools.has(toolName)) return 'shell'
  if (writeTools.has(toolName)) return 'write'
  if (networkTools.has(toolName)) return 'network'
  return 'read'
}

function evaluatePermission(toolName: string, args: Record<string, any>, workspacePath: string | undefined, mode: PermissionMode): PermissionDecision {
  const category = getToolCategory(toolName)
  const targetPath = typeof args.path === 'string' ? args.path : undefined
  const protectedPath = isProtectedPath(targetPath, workspacePath)

  if (category === 'delete') {
    return {
      decision: 'ask',
      category,
      riskLevel: 'critical',
      protectedPath,
      reason: protectedPath ? 'Delete targets a protected path.' : 'Delete can remove local workspace data.',
    }
  }

  if (protectedPath && (category === 'write' || category === 'shell')) {
    return {
      decision: mode === 'custom' ? 'deny' : 'ask',
      category,
      riskLevel: 'critical',
      protectedPath,
      reason: 'Action touches a protected path or secret-like location.',
    }
  }

  if (mode === 'safe' && (category === 'write' || category === 'shell' || category === 'network')) {
    return {
      decision: 'ask',
      category,
      riskLevel: category === 'write' ? 'medium' : 'high',
      protectedPath,
      reason: 'Safe mode requires approval for writes, shell commands, and network calls.',
    }
  }

  if (mode === 'balanced' && (category === 'shell' || category === 'network')) {
    return {
      decision: 'ask',
      category,
      riskLevel: 'high',
      protectedPath,
      reason: 'Balanced mode requires approval for shell commands and network calls.',
    }
  }

  if (mode === 'custom' && category !== 'read') {
    return {
      decision: 'ask',
      category,
      riskLevel: category === 'write' ? 'medium' : 'high',
      protectedPath,
      reason: 'Custom policy mode asks for side-effecting actions unless a specific rule is added.',
    }
  }

  return {
    decision: 'allow',
    category,
    riskLevel: category === 'read' ? 'low' : 'medium',
    protectedPath,
    reason: `${mode} mode allows this ${category} action.`,
  }
}

async function appendAuditLog(entry: Record<string, unknown>): Promise<void> {
  try {
    const auditDir = join(getUserDataPath(), 'audit')
    await fs.mkdir(auditDir, { recursive: true })
    const date = new Date().toISOString().slice(0, 10)
    await fs.appendFile(join(auditDir, `${date}.log`), JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry,
    }) + '\n', 'utf-8')
  } catch (err) {
    log.error('Failed to write permission audit log', err)
  }
}

async function ensurePermission(
  toolName: string,
  args: Record<string, any>,
  workspacePath: string | undefined,
  options?: LocalToolExecutionOptions
): Promise<PermissionDecision> {
  const mode = options?.permissionMode ?? 'balanced'
  const decision = evaluatePermission(toolName, args, workspacePath, mode)

  if (decision.decision === 'deny') {
    await appendAuditLog({
      event: 'tool_permission',
      sessionId: options?.sessionId ?? null,
      tool: toolName,
      policyMode: mode,
      decision: 'denied',
      reason: decision.reason,
      args: sanitizeArgsForAudit(args),
    })
    throw new Error(`Permission denied for ${toolName}: ${decision.reason}`)
  }

  if (decision.decision === 'ask') {
    const approved = options?.approvalHandler
      ? await options.approvalHandler(toolName, args, decision)
      : false
    await appendAuditLog({
      event: 'tool_permission',
      sessionId: options?.sessionId ?? null,
      tool: toolName,
      policyMode: mode,
      decision: approved ? 'approved' : 'denied',
      reason: decision.reason,
      args: sanitizeArgsForAudit(args),
    })
    if (!approved) {
      throw new Error(`${toolName} was denied by the user`)
    }
  } else {
    await appendAuditLog({
      event: 'tool_permission',
      sessionId: options?.sessionId ?? null,
      tool: toolName,
      policyMode: mode,
      decision: 'allowed',
      reason: decision.reason,
      args: sanitizeArgsForAudit(args),
    })
  }

  return decision
}

function sanitizeArgsForAudit(args: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {}
  for (const [key, value] of Object.entries(args)) {
    if (/key|token|secret|password/i.test(key)) {
      sanitized[key] = '[redacted]'
    } else if (typeof value === 'string' && value.length > 600) {
      sanitized[key] = `${value.slice(0, 600)}...`
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

async function checkpointPath(filePath: string, workspacePath: string | undefined, sessionId?: string): Promise<string | null> {
  try {
    const checkpointRoot = join(getUserDataPath(), 'checkpoints', sessionId ?? 'anonymous', String(Date.now()))
    await fs.mkdir(checkpointRoot, { recursive: true })
    const relPath = toWorkspacePath(filePath, workspacePath)
    const manifest = {
      timestamp: new Date().toISOString(),
      workspacePath: workspacePath ?? null,
      path: relPath,
      existed: existsSync(filePath),
    }

    if (manifest.existed) {
      const safeName = relPath.replace(/[\\/:"*?<>|]+/g, '__')
      const stats = await fs.stat(filePath)
      if (stats.isDirectory()) {
        const files = await walkFiles(filePath, 500, workspacePath)
        const filesRoot = join(checkpointRoot, 'files')
        await fs.mkdir(filesRoot, { recursive: true })
        for (const relFile of files) {
          const absFile = resolveWorkspacePath(relFile, workspacePath)
          const safeFileName = relFile.replace(/[\\/:"*?<>|]+/g, '__')
          await fs.copyFile(absFile, join(filesRoot, safeFileName))
        }
      } else {
        await fs.copyFile(filePath, join(checkpointRoot, safeName))
      }
    }

    await fs.writeFile(join(checkpointRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')
    return checkpointRoot
  } catch (err) {
    log.error('Checkpoint creation failed', err)
    return null
  }
}

function sanitizeProcessEnv(): Record<string, string> {
  const envAllowlist = ['PATH', 'APPDATA', 'USERPROFILE', 'LANG', 'LC_ALL', 'TEMP', 'TMP', 'HOME', 'SystemRoot', 'COMSPEC', 'PATHEXT']
  const sanitizedEnv: Record<string, string> = {}
  for (const key of envAllowlist) {
    if (process.env[key] !== undefined) {
      sanitizedEnv[key] = process.env[key]!
    }
  }
  return sanitizedEnv
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

async function readJsonFile(filePath: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function detectStack(files: string[]): string[] {
  const stack = new Set<string>()
  const names = new Set(files.map((file) => normalizeForPolicy(file).toLowerCase()))

  if (names.has('package.json')) stack.add('node')
  if ([...names].some((file) => file.endsWith('.ts') || file.endsWith('.tsx'))) stack.add('typescript')
  if ([...names].some((file) => file.endsWith('.jsx') || file.endsWith('.tsx'))) stack.add('react')
  if (names.has('electron.vite.config.ts') || names.has('electron.vite.config.js')) stack.add('electron')
  if (names.has('vite.config.ts') || names.has('vite.config.js')) stack.add('vite')
  if (names.has('vitest.config.ts') || names.has('vitest.config.js')) stack.add('vitest')
  if ([...names].some((file) => file.endsWith('.py'))) stack.add('python')
  if (names.has('pyproject.toml')) stack.add('python-package')
  if ([...names].some((file) => file.endsWith('.csproj'))) stack.add('dotnet')
  if (names.has('cargo.toml')) stack.add('rust')
  if (names.has('go.mod')) stack.add('go')

  return Array.from(stack)
}

async function generateRepoMap(workspacePath: string | undefined, maxFiles: number): Promise<Record<string, any>> {
  const workspaceRoot = getWorkspaceRoot(workspacePath)
  const files = await walkFiles(workspaceRoot, Math.min(maxFiles, 2000), workspacePath)
  const packageJson = await readJsonFile(join(workspaceRoot, 'package.json'))
  const instructionFiles = ['LOCALMIND.md', 'AGENTS.md', 'CLAUDE.md', '.localmind/AGENTS.md', '.localmind/TOOLS.md']
    .filter((file) => files.includes(file))
  const importantFiles = files.filter((file) => {
    const normalized = normalizeForPolicy(file)
    return /(^|\/)(package\.json|tsconfig.*\.json|electron\.vite\.config\.[jt]s|vite\.config\.[jt]s|vitest\.config\.[jt]s|README\.md|LOCALMIND\.md|AGENTS\.md|CLAUDE\.md)$/i.test(normalized)
  }).slice(0, 80)
  const entryPoints = files.filter((file) => /(^|\/)(main|index|App)\.(ts|tsx|js|jsx)$/i.test(file)).slice(0, 80)
  const testFiles = files.filter((file) => /\.(test|spec)\.(ts|tsx|js|jsx|py)$/i.test(file)).slice(0, 80)
  const topDirectories = Array.from(new Set(files.map((file) => normalizeForPolicy(file).split('/')[0]).filter(Boolean))).slice(0, 80)

  return {
    workspaceRoot,
    fileCountScanned: files.length,
    detectedStack: detectStack(files),
    packageScripts: packageJson?.scripts ?? {},
    topDirectories,
    importantFiles,
    instructionFiles,
    entryPoints,
    testFiles,
  }
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
        name: 'local__repo_map',
        description: 'Generate a concise repository map with detected stack, commands, important files, instructions, and test entry points.',
        parameters: {
          type: 'object',
          properties: {
            maxFiles: { type: 'number', description: 'Maximum workspace files to inspect. Defaults to 400.' },
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
        description: 'Read a file. Supports reading from both workspace-relative paths and system-wide absolute paths. Supports text, PDF, DOCX, PPTX, and XLSX extraction.',
        parameters: {
          type: 'object',
          required: ['path'],
          properties: {
            path: { type: 'string', description: 'Workspace-relative file path or system-wide absolute file path.' },
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
        name: 'local__write_spreadsheet',
        description: 'Create or replace an Excel spreadsheet (.xlsx) with a 2D array of data (rows and columns).',
        parameters: {
          type: 'object',
          required: ['path', 'data'],
          properties: {
            path: { type: 'string', description: 'Workspace-relative file path ending in .xlsx.' },
            data: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'A 2D array representing rows and columns of data.' },
            sheetName: { type: 'string', description: 'Optional sheet name. Defaults to Sheet1.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__append_spreadsheet',
        description: 'Append rows to an existing sheet in an Excel spreadsheet (.xlsx). Creates the file if it does not exist.',
        parameters: {
          type: 'object',
          required: ['path', 'data'],
          properties: {
            path: { type: 'string', description: 'Workspace-relative file path ending in .xlsx.' },
            data: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'A 2D array representing rows to append.' },
            sheetName: { type: 'string', description: 'Optional sheet name. Defaults to Sheet1.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__write_document',
        description: 'Create or replace a Word document (.docx) with structured elements (headings, paragraphs, lists).',
        parameters: {
          type: 'object',
          required: ['path', 'elements'],
          properties: {
            path: { type: 'string', description: 'Workspace-relative file path ending in .docx.' },
            elements: {
              type: 'array',
              items: {
                type: 'object',
                required: ['type', 'text'],
                properties: {
                  type: { type: 'string', enum: ['paragraph', 'heading1', 'heading2', 'list_item'] },
                  text: { type: 'string' },
                },
              },
              description: 'Structured elements of the document.',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__append_document',
        description: 'Append structured elements (headings, paragraphs, lists) to an existing Word document (.docx). Creates the file if it does not exist.',
        parameters: {
          type: 'object',
          required: ['path', 'elements'],
          properties: {
            path: { type: 'string', description: 'Workspace-relative file path ending in .docx.' },
            elements: {
              type: 'array',
              items: {
                type: 'object',
                required: ['type', 'text'],
                properties: {
                  type: { type: 'string', enum: ['paragraph', 'heading1', 'heading2', 'list_item'] },
                  text: { type: 'string' },
                },
              },
              description: 'Structured elements to append.',
            },
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
        name: 'local__patch_file',
        description: 'Apply multiple exact text replacements to one text file. Use this for multi-hunk targeted code changes.',
        parameters: {
          type: 'object',
          required: ['path', 'replacements'],
          properties: {
            path: { type: 'string', description: 'Workspace-relative file path.' },
            replacements: {
              type: 'array',
              items: {
                type: 'object',
                required: ['oldText', 'newText'],
                properties: {
                  oldText: { type: 'string' },
                  newText: { type: 'string' },
                },
              },
            },
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
        name: 'local__git_status',
        description: 'Run git status --short inside the workspace.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__git_diff',
        description: 'Run git diff inside the workspace, optionally scoped to a file.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Optional workspace-relative file path to diff.' },
            staged: { type: 'boolean', description: 'Use --staged to show staged changes. Defaults to false.' },
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
    {
      type: 'function',
      function: {
        name: 'local__run_command',
        description: 'Run a non-interactive local command with an executable and argument array. Requires approval and uses a sanitized environment.',
        parameters: {
          type: 'object',
          required: ['command'],
          properties: {
            command: { type: 'string', description: 'Executable name or absolute path, such as git, node, npm, or python.' },
            args: { type: 'array', items: { type: 'string' }, description: 'Command arguments as separate strings.' },
            timeoutMs: { type: 'number', description: 'Timeout in milliseconds. Defaults to 120000.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__open_url',
        description: 'Open a web URL in the user\'s default browser. Use this to launch a browser and navigate to a website. Only http(s) URLs are allowed.',
        parameters: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string', description: 'The full http(s) URL to open, such as https://example.com.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__launch_app',
        description: 'Launch a local desktop application or executable (such as a browser, editor, or other program) detached and non-blocking. Use this to start GUI apps. For opening a website, prefer local__open_url.',
        parameters: {
          type: 'object',
          required: ['command'],
          properties: {
            command: { type: 'string', description: 'Executable name or absolute path, such as chrome, msedge, notepad, or an absolute path to an .exe.' },
            args: { type: 'array', items: { type: 'string' }, description: 'Arguments to pass to the application, such as a URL or file path.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__browser_open',
        description: 'Open a controllable browser window and navigate to a URL. Returns the page title and readable text. Use this to actually browse the web and read page content (not just launch a browser).',
        parameters: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string', description: 'The URL to navigate to (https assumed if no scheme).' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__browser_read',
        description: 'Read the readable text and title of the currently open browser page. Use after navigating or interacting to see the latest page content.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__browser_click',
        description: 'Click an element on the current browser page. Provide a CSS selector or the visible text of a link/button.',
        parameters: {
          type: 'object',
          required: ['target'],
          properties: {
            target: { type: 'string', description: 'A CSS selector, or the visible text of the link/button to click.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__browser_type',
        description: 'Type text into an input or textarea on the current browser page, identified by a CSS selector. Optionally submit the form.',
        parameters: {
          type: 'object',
          required: ['selector', 'text'],
          properties: {
            selector: { type: 'string', description: 'CSS selector of the input/textarea (e.g. input[name="q"]).' },
            text: { type: 'string', description: 'The text to type.' },
            submit: { type: 'boolean', description: 'Submit the form / press Enter after typing. Defaults to false.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__browser_screenshot',
        description: 'Capture a screenshot of the current browser page and save it locally. Returns the saved file path.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__browser_close',
        description: 'Close the agent browser window when finished.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__browser_back',
        description: 'Navigate back to the previous page in the browser history. Returns the resulting page text.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__browser_forward',
        description: 'Navigate forward in the browser history. Returns the resulting page text.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__browser_reload',
        description: 'Reload the current browser page. Returns the resulting page text.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__browser_scroll',
        description: 'Scroll the current page to reveal more content.',
        parameters: {
          type: 'object',
          properties: {
            direction: { type: 'string', enum: ['down', 'up', 'top', 'bottom'], description: 'Scroll direction. Defaults to down.' },
            amount: { type: 'number', description: 'Pixels to scroll for up/down. Defaults to 800.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__browser_wait',
        description: 'Wait for a number of milliseconds, or until a CSS selector appears on the page (max 15s). Use after actions that trigger loading.',
        parameters: {
          type: 'object',
          required: ['target'],
          properties: {
            target: { type: 'string', description: 'Milliseconds to wait (e.g. "1500"), or a CSS selector to wait for.' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__browser_links',
        description: 'List up to 50 links on the current page with their text and URL. Useful for deciding what to click or navigate to next.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'local__browser_press_key',
        description: 'Press a keyboard key on the current page, optionally focusing a CSS selector first. Useful for Enter, Tab, Escape, ArrowDown, etc.',
        parameters: {
          type: 'object',
          required: ['key'],
          properties: {
            key: { type: 'string', description: 'The key to press, e.g. Enter, Tab, Escape, ArrowDown.' },
            selector: { type: 'string', description: 'Optional CSS selector to focus before pressing the key.' },
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

export function getRagTools(): ToolDefinition[] {
  // Only advertise retrieval when the user has actually indexed documents.
  if (getRagDocumentCount() === 0) return []
  return [
    {
      type: 'function',
      function: {
        name: 'rag__query',
        description: 'Search the user\'s locally indexed knowledge documents (RAG) for passages relevant to a query. Use this when the user asks about the contents of their indexed files or uploaded documents.',
        parameters: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', description: 'What to look for in the indexed documents.' },
            topK: { type: 'number', description: 'Maximum passages to return. Defaults to 5.' },
          },
        },
      },
    },
  ]
}

export function isRagToolName(name: string): boolean {
  return name === 'rag__query'
}

export async function executeRagToolCall(
  toolCall: ToolCall
): Promise<{ role: 'tool'; content: string; toolCallId: string }> {
  let args: Record<string, any> = {}
  try {
    args = JSON.parse(toolCall.arguments || '{}')
  } catch {
    args = {}
  }

  const query = String(args.query ?? '').trim()
  if (!query) {
    return {
      role: 'tool',
      content: JSON.stringify({ error: 'query is required' }),
      toolCallId: toolCall.id,
    }
  }

  try {
    const topK = Math.min(Math.max(Number(args.topK) || 5, 1), 20)
    const results = await queryDocumentsDetailed(query, topK)
    return {
      role: 'tool',
      content: JSON.stringify({ query, results }),
      toolCallId: toolCall.id,
    }
  } catch (err: any) {
    return {
      role: 'tool',
      content: JSON.stringify({ error: err.message ?? 'RAG query failed' }),
      toolCallId: toolCall.id,
    }
  }
}

export function getWebSearchTools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'web__search',
        description: 'Search the web for current or recent information. Use this when the user asks for latest news, current facts, prices, schedules, or anything that may have changed recently.',
        parameters: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', description: 'The web search query.' },
          },
        },
      },
    },
  ]
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

export function isWebSearchToolName(name: string): boolean {
  return name === 'web__search'
}

export async function executeWebSearchToolCall(
  toolCall: ToolCall,
  options?: LocalToolExecutionOptions
): Promise<{ role: 'tool'; content: string; toolCallId: string }> {
  let args: Record<string, any> = {}
  try {
    args = JSON.parse(toolCall.arguments || '{}')
  } catch {
    args = {}
  }

  const query = String(args.query ?? '').trim()
  if (!query) {
    return {
      role: 'tool',
      content: JSON.stringify({ error: 'query is required' }),
      toolCallId: toolCall.id,
    }
  }

  await ensurePermission(toolCall.name, args, undefined, options)
  const result = await searchWeb(query)
  return {
    role: 'tool',
    content: JSON.stringify(result),
    toolCallId: toolCall.id,
  }
}

export async function executeLocalToolCall(
  toolCall: ToolCall,
  workspacePath?: string,
  approvalHandlerOrOptions?: ((toolName: string, args: Record<string, any>, details?: ApprovalDetails) => Promise<boolean>) | LocalToolExecutionOptions
): Promise<{ role: 'tool'; content: string; toolCallId: string }> {
  let args: Record<string, any> = {}
  try {
    args = JSON.parse(toolCall.arguments || '{}')
  } catch {
    args = {}
  }

  const options: LocalToolExecutionOptions =
    typeof approvalHandlerOrOptions === 'function'
      ? { approvalHandler: approvalHandlerOrOptions }
      : (approvalHandlerOrOptions ?? {})

  try {
    await ensurePermission(toolCall.name, args, workspacePath, options)

    if (toolCall.name === 'local__list_files') {
      const workspaceRoot = getWorkspaceRoot(workspacePath)
      const root = resolveWorkspacePath(args.path ?? '.', workspacePath)
      const files = await walkFiles(root, Math.min(Number(args.maxFiles) || 100, 500), workspacePath)
      return { role: 'tool', content: JSON.stringify({ workspaceRoot, files }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__repo_map') {
      const repoMap = await generateRepoMap(workspacePath, Number(args.maxFiles) || 400)
      return { role: 'tool', content: JSON.stringify(repoMap), toolCallId: toolCall.id }
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
      const checkpoint = await checkpointPath(filePath, workspacePath, options.sessionId)
      await fs.mkdir(dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, String(args.content ?? ''), 'utf-8')
      return { role: 'tool', content: JSON.stringify({ path: toWorkspacePath(filePath, workspacePath), bytes: Buffer.byteLength(String(args.content ?? ''), 'utf-8'), checkpoint }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__write_spreadsheet') {
      const filePath = resolveWorkspacePath(String(args.path ?? ''), workspacePath)
      const data = args.data as any[][]
      if (!data || !Array.isArray(data)) throw new Error('data must be a 2D array')
      const checkpoint = await checkpointPath(filePath, workspacePath, options.sessionId)
      const { writeXlsx } = await import('../files/rich-writer')
      await writeXlsx(filePath, data, args.sheetName)
      return { role: 'tool', content: JSON.stringify({ path: toWorkspacePath(filePath, workspacePath), success: true, checkpoint }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__append_spreadsheet') {
      const filePath = resolveWorkspacePath(String(args.path ?? ''), workspacePath)
      const data = args.data as any[][]
      if (!data || !Array.isArray(data)) throw new Error('data must be a 2D array')
      const checkpoint = await checkpointPath(filePath, workspacePath, options.sessionId)
      const { appendXlsx } = await import('../files/rich-writer')
      await appendXlsx(filePath, data, args.sheetName)
      return { role: 'tool', content: JSON.stringify({ path: toWorkspacePath(filePath, workspacePath), success: true, checkpoint }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__write_document') {
      const filePath = resolveWorkspacePath(String(args.path ?? ''), workspacePath)
      const elements = args.elements as any[]
      if (!elements || !Array.isArray(elements)) throw new Error('elements must be an array')
      const checkpoint = await checkpointPath(filePath, workspacePath, options.sessionId)
      const { writeDocx } = await import('../files/rich-writer')
      await writeDocx(filePath, elements)
      return { role: 'tool', content: JSON.stringify({ path: toWorkspacePath(filePath, workspacePath), success: true, checkpoint }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__append_document') {
      const filePath = resolveWorkspacePath(String(args.path ?? ''), workspacePath)
      const elements = args.elements as any[]
      if (!elements || !Array.isArray(elements)) throw new Error('elements must be an array')
      const checkpoint = await checkpointPath(filePath, workspacePath, options.sessionId)
      const { appendDocx } = await import('../files/rich-writer')
      await appendDocx(filePath, elements)
      return { role: 'tool', content: JSON.stringify({ path: toWorkspacePath(filePath, workspacePath), success: true, checkpoint }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__edit_file') {
      const filePath = resolveWorkspacePath(String(args.path ?? ''), workspacePath)
      const oldText = String(args.oldText ?? '')
      const newText = String(args.newText ?? '')
      if (!oldText) throw new Error('oldText is required')
      const current = await fs.readFile(filePath, 'utf-8')
      if (!current.includes(oldText)) throw new Error(`oldText was not found in ${args.path}`)
      const next = args.replaceAll ? current.split(oldText).join(newText) : current.replace(oldText, newText)
      const checkpoint = await checkpointPath(filePath, workspacePath, options.sessionId)
      await fs.writeFile(filePath, next, 'utf-8')
      return {
        role: 'tool',
        content: JSON.stringify({
          path: toWorkspacePath(filePath, workspacePath),
          replacements: args.replaceAll ? current.split(oldText).length - 1 : 1,
          checkpoint,
        }),
        toolCallId: toolCall.id,
      }
    }

    if (toolCall.name === 'local__patch_file') {
      const filePath = resolveWorkspacePath(String(args.path ?? ''), workspacePath)
      const replacements = args.replacements as Array<{ oldText?: string; newText?: string }>
      if (!Array.isArray(replacements) || replacements.length === 0) throw new Error('replacements must be a non-empty array')
      let current = await fs.readFile(filePath, 'utf-8')
      let applied = 0
      for (const replacement of replacements) {
        const oldText = String(replacement.oldText ?? '')
        const newText = String(replacement.newText ?? '')
        if (!oldText) throw new Error('Each replacement requires oldText')
        if (!current.includes(oldText)) throw new Error(`oldText was not found in ${args.path}`)
        current = current.replace(oldText, newText)
        applied++
      }
      const checkpoint = await checkpointPath(filePath, workspacePath, options.sessionId)
      await fs.writeFile(filePath, current, 'utf-8')
      return {
        role: 'tool',
        content: JSON.stringify({ path: toWorkspacePath(filePath, workspacePath), replacements: applied, checkpoint }),
        toolCallId: toolCall.id,
      }
    }

    if (toolCall.name === 'local__delete_path') {
      const targetPath = resolveWorkspacePath(String(args.path ?? ''), workspacePath)
      if (toWorkspacePath(targetPath, workspacePath) === '.') throw new Error('Refusing to delete the workspace root')
      const stats = await fs.stat(targetPath)
      const checkpoint = await checkpointPath(targetPath, workspacePath, options.sessionId)
      await fs.rm(targetPath, { recursive: Boolean(args.recursive) && stats.isDirectory(), force: false })
      return { role: 'tool', content: JSON.stringify({ deleted: toWorkspacePath(targetPath, workspacePath), checkpoint }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__git_status') {
      const workspaceRoot = getWorkspaceRoot(workspacePath)
      const gitCommand = process.platform === 'win32' ? 'git.exe' : 'git'
      const result = await execFileAsync(gitCommand, ['status', '--short'], {
        cwd: workspaceRoot,
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        env: sanitizeProcessEnv(),
      })
      return { role: 'tool', content: JSON.stringify({ stdout: result.stdout, stderr: result.stderr }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__git_diff') {
      const workspaceRoot = getWorkspaceRoot(workspacePath)
      const gitCommand = process.platform === 'win32' ? 'git.exe' : 'git'
      const gitArgs = ['diff']
      if (args.staged) gitArgs.push('--staged')
      if (args.path) gitArgs.push('--', toWorkspacePath(resolveWorkspacePath(String(args.path), workspacePath), workspacePath))
      const result = await execFileAsync(gitCommand, gitArgs, {
        cwd: workspaceRoot,
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        env: sanitizeProcessEnv(),
      })
      return { role: 'tool', content: JSON.stringify({ stdout: result.stdout, stderr: result.stderr }), toolCallId: toolCall.id }
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
        timeout: 120000, // 2 minutes hard limit
        maxBuffer: 1024 * 1024,
        env: sanitizeProcessEnv(),
      })
      return { role: 'tool', content: JSON.stringify({ stdout: result.stdout, stderr: result.stderr }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__run_command') {
      const workspaceRoot = getWorkspaceRoot(workspacePath)
      const command = String(args.command ?? '').trim()
      if (!command) throw new Error('command is required')
      if (/[&|;<>()]/.test(command)) throw new Error('command must be an executable name or path, not a shell expression')
      const commandArgs = Array.isArray(args.args) ? args.args.map((item) => String(item)) : []
      const timeoutMs = Math.min(Math.max(Number(args.timeoutMs) || 120000, 1000), 300000)
      const result = await execFileAsync(command, commandArgs, {
        cwd: workspaceRoot,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        env: sanitizeProcessEnv(),
      })
      return { role: 'tool', content: JSON.stringify({ stdout: result.stdout, stderr: result.stderr }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__open_url') {
      const url = String(args.url ?? '').trim()
      if (!url) throw new Error('url is required')
      if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) URLs are allowed')
      await shell.openExternal(url)
      return { role: 'tool', content: JSON.stringify({ success: true, opened: url }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__launch_app') {
      const command = String(args.command ?? '').trim()
      if (!command) throw new Error('command is required')
      if (/[&|;<>()]/.test(command)) throw new Error('command must be an executable name or path, not a shell expression')
      const appArgs = Array.isArray(args.args) ? args.args.map((item) => String(item)) : []
      const child = spawn(command, appArgs, {
        cwd: getWorkspaceRoot(workspacePath),
        env: sanitizeProcessEnv(),
        detached: true,
        stdio: 'ignore',
      })
      // Surface immediate spawn failures (e.g. executable not found) instead of silently resolving.
      const launchError = await new Promise<string | null>((resolve) => {
        let settled = false
        child.once('error', (err) => {
          if (settled) return
          settled = true
          resolve(err.message)
        })
        setTimeout(() => {
          if (settled) return
          settled = true
          resolve(null)
        }, 400)
      })
      if (launchError) throw new Error(`Failed to launch "${command}": ${launchError}`)
      const pid = child.pid
      child.unref()
      return { role: 'tool', content: JSON.stringify({ success: true, launched: command, args: appArgs, pid }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__browser_open') {
      const url = String(args.url ?? '').trim()
      if (!url) throw new Error('url is required')
      const result = await browserController.navigate(url)
      return { role: 'tool', content: JSON.stringify(result), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__browser_read') {
      const result = await browserController.readPage()
      return { role: 'tool', content: JSON.stringify(result), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__browser_click') {
      const target = String(args.target ?? '').trim()
      if (!target) throw new Error('target is required')
      const result = await browserController.click(target)
      return { role: 'tool', content: JSON.stringify(result), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__browser_type') {
      const selector = String(args.selector ?? '').trim()
      const text = String(args.text ?? '')
      if (!selector) throw new Error('selector is required')
      const result = await browserController.type(selector, text, !!args.submit)
      return { role: 'tool', content: JSON.stringify(result), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__browser_screenshot') {
      const file = await browserController.screenshot()
      return { role: 'tool', content: JSON.stringify({ success: true, path: file }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__browser_close') {
      const closed = browserController.close()
      return { role: 'tool', content: JSON.stringify({ success: true, closed }), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__browser_back') {
      const result = await browserController.goBack()
      return { role: 'tool', content: JSON.stringify(result), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__browser_forward') {
      const result = await browserController.goForward()
      return { role: 'tool', content: JSON.stringify(result), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__browser_reload') {
      const result = await browserController.reload()
      return { role: 'tool', content: JSON.stringify(result), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__browser_scroll') {
      const direction = (['down', 'up', 'top', 'bottom'].includes(args.direction) ? args.direction : 'down') as
        | 'down'
        | 'up'
        | 'top'
        | 'bottom'
      const result = await browserController.scroll(direction, Number(args.amount) || 800)
      return { role: 'tool', content: JSON.stringify(result), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__browser_wait') {
      const target = args.target ?? '1000'
      const result = await browserController.waitFor(target)
      return { role: 'tool', content: JSON.stringify(result), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__browser_links') {
      const result = await browserController.links()
      return { role: 'tool', content: JSON.stringify(result), toolCallId: toolCall.id }
    }

    if (toolCall.name === 'local__browser_press_key') {
      const key = String(args.key ?? '').trim()
      if (!key) throw new Error('key is required')
      const result = await browserController.pressKey(key, args.selector ? String(args.selector) : undefined)
      return { role: 'tool', content: JSON.stringify(result), toolCallId: toolCall.id }
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
