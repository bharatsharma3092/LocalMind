import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { createServer, type IncomingMessage, type Server } from 'http'
import { join } from 'path'
import { homedir } from 'os'
import { app } from 'electron'
import { appStore } from '../settings/app-store'
import { getSecret } from '../settings/secrets'
import { getCustomProvidersFromSettings } from '../llm/providers/custom'

type ProxyModel = {
  id: string
  name?: string
  provider: string
  customProviderId?: string
}

type ProxySettings = {
  enabled?: boolean
  port?: number
  apiKey?: string
  opusModel?: ProxyModel
  sonnetModel?: ProxyModel
  haikuModel?: ProxyModel
}

let proxyProcess: ChildProcessWithoutNullStreams | null = null
let proxyServer: Server | null = null
let lastOutput = ''
let internalLiteLlmPort: number | null = null

const anthropicOnlyRequestKeys = new Set([
  'cache_control',
  'context_management',
  'container',
  'metadata',
  'mcp_servers',
  'output_config',
  'service_tier',
  'thinking',
  'thinking_budget',
])

const standardAliases = {
  opus: [
    'opus',
    'claude-3-opus-20240229',
    'claude-3-opus-latest',
    'claude-3-opus',
  ],
  sonnet: [
    'sonnet',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-20240620',
    'claude-3-5-sonnet-latest',
    'claude-3-5-sonnet',
    'claude-3-sonnet-20240229',
  ],
  haiku: [
    'haiku',
    'claude-3-haiku-20240307',
    'claude-3-5-haiku-20241022',
    'claude-3-haiku-latest',
    'claude-3-haiku',
  ],
}

type ClaudeSettingsEnv = {
  ANTHROPIC_BASE_URL?: string
  ANTHROPIC_AUTH_TOKEN?: string
  ANTHROPIC_DEFAULT_SONNET_MODEL?: string
  ANTHROPIC_DEFAULT_OPUS_MODEL?: string
  ANTHROPIC_DEFAULT_HAIKU_MODEL?: string
  CLAUDE_CODE_SUBAGENT_MODEL?: string
}

type ClaudeSettings = {
  env?: ClaudeSettingsEnv
}

function getClaudeSettings(): { port: number | null; apiKey: string | null; sonnet: string[]; opus: string[]; haiku: string[] } {
  const result: { port: number | null; apiKey: string | null; sonnet: string[]; opus: string[]; haiku: string[] } = {
    port: null,
    apiKey: null,
    sonnet: [],
    opus: [],
    haiku: [],
  }

  const pathsToTry = [
    join(homedir(), '.claude', 'settings.json'),
    'd:\\claude_Code_settings_file\\global_settings\\settings.json',
  ]

  for (const p of pathsToTry) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, 'utf-8')
        const parsed = JSON.parse(raw) as ClaudeSettings
        if (parsed?.env) {
          const env = parsed.env
          if (env.ANTHROPIC_BASE_URL) {
            const match = env.ANTHROPIC_BASE_URL.match(/:(\d+)/)
            if (match?.[1]) {
              result.port = parseInt(match[1], 10)
            }
          }
          if (env.ANTHROPIC_AUTH_TOKEN) {
            result.apiKey = env.ANTHROPIC_AUTH_TOKEN
          }
          if (env.ANTHROPIC_DEFAULT_SONNET_MODEL) {
            result.sonnet.push(env.ANTHROPIC_DEFAULT_SONNET_MODEL)
          }
          if (env.ANTHROPIC_DEFAULT_OPUS_MODEL) {
            result.opus.push(env.ANTHROPIC_DEFAULT_OPUS_MODEL)
          }
          if (env.ANTHROPIC_DEFAULT_HAIKU_MODEL) {
            result.haiku.push(env.ANTHROPIC_DEFAULT_HAIKU_MODEL)
          }
          if (env.CLAUDE_CODE_SUBAGENT_MODEL) {
            result.haiku.push(env.CLAUDE_CODE_SUBAGENT_MODEL)
          }
        }
        break
      } catch (err) {
        console.error('[ClaudeProxy] Failed to parse settings at', p, err)
      }
    }
  }

  return result
}

async function syncWithClaudeCodeSettings(settings: ProxySettings) {
  const pathsToSync = [
    join(homedir(), '.claude', 'settings.json'),
    'd:\\claude_Code_settings_file\\global_settings\\settings.json',
  ]

  for (const p of pathsToSync) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, 'utf-8')
        const parsed = JSON.parse(raw) as any
        
        if (!parsed.env) {
          parsed.env = {}
        }
        
        // Sync port / URL to match whichever port was set in the LocalMind UI
        parsed.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${settings.port ?? 4000}`
        
        // Sync Auth Token
        if (settings.apiKey) {
          parsed.env.ANTHROPIC_AUTH_TOKEN = settings.apiKey
        }
        
        // Sync Model names with the dynamic selected model IDs from LocalMind UI
        if (settings.opusModel?.id) {
          parsed.env.ANTHROPIC_DEFAULT_OPUS_MODEL = settings.opusModel.id
        }
        if (settings.sonnetModel?.id) {
          parsed.env.ANTHROPIC_DEFAULT_SONNET_MODEL = settings.sonnetModel.id
        }
        if (settings.haikuModel?.id) {
          parsed.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = settings.haikuModel.id
          parsed.env.CLAUDE_CODE_SUBAGENT_MODEL = settings.haikuModel.id
        }

        writeFileSync(p, JSON.stringify(parsed, null, 2), 'utf-8')
        console.log('[ClaudeProxy] Successfully synced config with', p)
      } catch (err) {
        console.error('[ClaudeProxy] Failed to sync config with', p, err)
      }
    }
  }
}

function quoteYaml(value: string): string {
  return JSON.stringify(value)
}

function getConfigPath(): string {
  const dir = join(app.getPath('userData'), 'claude-code-proxy')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'litellm-config.yaml')
}

function execFileQuiet(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
      resolve(error ? `${stdout ?? ''}${stderr ?? ''}` : stdout)
    })
  })
}

async function stopProcessListeningOnPort(port: number) {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return

  if (process.platform === 'win32') {
    const script = [
      `$connections = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue`,
      '$connections | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {',
      `  if ($_ -ne ${process.pid}) {`,
      '    try { Stop-Process -Id $_ -Force -ErrorAction Stop } catch {}',
      '  }',
      '}',
    ].join('; ')
    await execFileQuiet('powershell.exe', ['-NoProfile', '-Command', script])
    return
  }

  const pids = (await execFileQuiet('sh', ['-c', `lsof -ti tcp:${port} -sTCP:LISTEN 2>/dev/null || true`]))
    .split(/\s+/)
    .map((item) => Number(item))
    .filter((pid) => Number.isInteger(pid) && pid > 0)
  for (const pid of pids) {
    try { process.kill(pid, 'SIGTERM') } catch {}
  }
}

function stripAnthropicOnlyRequestFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripAnthropicOnlyRequestFields)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const next: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (anthropicOnlyRequestKeys.has(key)) continue
    next[key] = stripAnthropicOnlyRequestFields(child)
  }
  return next
}

function sanitizeAnthropicBetaHeader(value: string): string | null {
  const next = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item && !item.toLowerCase().includes('prompt-caching'))
  return next.length > 0 ? next.join(',') : null
}

function getForwardHeaders(req: IncomingMessage, bodyLength: number): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    const lowerKey = key.toLowerCase()
    if (['host', 'connection', 'content-length', 'transfer-encoding'].includes(lowerKey)) continue
    if (value == null) continue

    const headerValue = Array.isArray(value) ? value.join(', ') : value
    if (lowerKey === 'anthropic-beta') {
      const sanitized = sanitizeAnthropicBetaHeader(headerValue)
      if (sanitized) headers[key] = sanitized
      continue
    }
    headers[key] = headerValue
  }

  if (bodyLength > 0) {
    headers['content-length'] = String(bodyLength)
  }
  return headers
}

function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function stopProcessTree(child: ChildProcessWithoutNullStreams) {
  const pid = child.pid
  if (!pid) {
    child.kill()
    return
  }

  if (process.platform === 'win32') {
    await execFileQuiet('taskkill.exe', ['/PID', String(pid), '/T', '/F'])
    return
  }

  try { child.kill('SIGTERM') } catch {}
}

function sanitizeRequestBody(req: IncomingMessage, body: Buffer): Buffer {
  if (body.length === 0) return body
  const contentType = String(req.headers['content-type'] ?? '')
  if (!contentType.toLowerCase().includes('application/json')) return body

  try {
    const parsed = JSON.parse(body.toString('utf-8'))
    return Buffer.from(JSON.stringify(stripAnthropicOnlyRequestFields(parsed)), 'utf-8')
  } catch {
    return body
  }
}

async function startSanitizingProxy(publicPort: number, targetPort: number) {
  proxyServer = createServer(async (req, res) => {
    try {
      const rawBody = await readRequestBody(req)
      const body = sanitizeRequestBody(req, rawBody)
      const targetUrl = `http://127.0.0.1:${targetPort}${req.url ?? '/'}`
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: getForwardHeaders(req, body.length),
        body: body.length > 0 ? body : undefined,
      })

      res.statusCode = response.status
      res.statusMessage = response.statusText
      response.headers.forEach((value, key) => {
        if (['connection', 'content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) return
        res.setHeader(key, value)
      })

      if (!response.body) {
        res.end()
        return
      }

      for await (const chunk of response.body as any) {
        res.write(chunk)
      }
      res.end()
    } catch (err: any) {
      const message = [
        err?.message ?? String(err),
        lastOutput ? `LiteLLM output:\n${lastOutput}` : '',
      ].filter(Boolean).join('\n')
      lastOutput = `${lastOutput}\nClaude Code proxy error: ${message}`.slice(-4000)
      if (!res.headersSent) {
        res.statusCode = 502
        res.setHeader('content-type', 'application/json')
      }
      res.end(JSON.stringify({ error: message || 'Claude Code proxy failed' }))
    }
  })

  await new Promise<void>((resolve, reject) => {
    const server = proxyServer
    if (!server) {
      reject(new Error('Proxy server was not initialized'))
      return
    }
    const onError = (err: Error) => {
      server.off('listening', onListening)
      reject(err)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(publicPort, '127.0.0.1')
  })
}

function stopSanitizingProxy() {
  if (proxyServer) {
    proxyServer.close()
    proxyServer = null
  }
}

function getAvailableLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port)
        } else {
          reject(new Error('Could not allocate an internal proxy port'))
        }
      })
    })
  })
}

async function waitForLiteLlmReady(port: number, timeoutMs = 20000): Promise<void> {
  const startedAt = Date.now()
  let lastError = ''

  while (Date.now() - startedAt < timeoutMs) {
    if (!proxyProcess) {
      throw new Error(`LiteLLM exited before it was ready.${lastOutput ? `\n${lastOutput}` : ''}`)
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health/liveliness`)
      if (response.status < 500) return
    } catch (err: any) {
      lastError = err?.message ?? String(err)
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(
    [
      `LiteLLM did not become reachable on internal port ${port}.`,
      lastError ? `Last connection error: ${lastError}` : '',
      lastOutput ? `LiteLLM output:\n${lastOutput}` : '',
    ].filter(Boolean).join('\n'),
  )
}

async function toLiteLlmParams(model?: ProxyModel): Promise<Record<string, string> | null> {
  if (!model?.id || !model.provider) return null

  if (model.provider === 'ollama') {
    const baseUrl = (appStore.get('ollamaUrl' as any) as string | undefined) ?? 'http://localhost:11434'
    return {
      model: model.id,
      custom_llm_provider: 'ollama_chat',
      api_base: baseUrl,
    }
  }

  if (model.provider === 'openai') {
    const key = await getSecret('openai-api-key')
    return {
      model: model.id,
      custom_llm_provider: 'openai',
      api_base: 'https://api.openai.com/v1',
      ...(key ? { api_key: key } : {}),
    }
  }

  if (model.provider === 'openrouter') {
    const key = await getSecret('openrouter-api-key')
    return {
      model: model.id,
      custom_llm_provider: 'openrouter',
      api_base: 'https://openrouter.ai/api/v1',
      ...(key ? { api_key: key } : {}),
    }
  }

  if (model.provider === 'google') {
    const key = await getSecret('google-api-key')
    return {
      model: model.id.replace(/^models\//, ''),
      custom_llm_provider: 'gemini',
      ...(key ? { api_key: key } : {}),
    }
  }

  if (model.provider === 'custom') {
    const provider = getCustomProvidersFromSettings().find((item) => item.id === model.customProviderId)
    const key = model.customProviderId ? await getSecret(`custom-provider-${model.customProviderId}-api-key`) : await getSecret('custom-api-key')
    const isAnthropic = provider?.apiFormat === 'anthropic'
    return {
      model: model.id,
      custom_llm_provider: isAnthropic ? 'anthropic' : 'openai',
      api_base: provider?.baseUrl ?? 'http://localhost:8080/v1',
      ...(key ? { api_key: key } : {}),
    }
  }

  return { model: model.id }
}

async function buildConfig(settings: ProxySettings): Promise<string> {
  const claudeSettings = getClaudeSettings()

  const roleMappings = {
    opus: new Set<string>([...standardAliases.opus, ...claudeSettings.opus]),
    sonnet: new Set<string>([...standardAliases.sonnet, ...claudeSettings.sonnet]),
    haiku: new Set<string>([...standardAliases.haiku, ...claudeSettings.haiku]),
  }

  if (settings.opusModel?.id) roleMappings.opus.add(settings.opusModel.id)
  if (settings.sonnetModel?.id) roleMappings.sonnet.add(settings.sonnetModel.id)
  if (settings.haikuModel?.id) roleMappings.haiku.add(settings.haikuModel.id)

  const entries = [
    ['opus', settings.opusModel, roleMappings.opus],
    ['sonnet', settings.sonnetModel, roleMappings.sonnet],
    ['haiku', settings.haikuModel, roleMappings.haiku],
  ] as const

  const lines = ['model_list:']
  for (const [role, model, names] of entries) {
    const params = await toLiteLlmParams(model)
    if (!params) continue
    for (const name of names) {
      lines.push(`  - model_name: ${quoteYaml(name)}`)
      lines.push('    litellm_params:')
      for (const [key, value] of Object.entries(params)) {
        lines.push(`      ${key}: ${quoteYaml(value)}`)
      }
    }
  }

  lines.push('general_settings:')
  lines.push('  master_key: ' + quoteYaml(settings.apiKey || claudeSettings.apiKey || 'localmind-proxy-key'))
  lines.push('litellm_settings:')
  lines.push('  drop_params: true')
  return `${lines.join('\n')}\n`
}

export async function saveClaudeCodeProxySettings(settings: ProxySettings) {
  const claudeSettings = getClaudeSettings()
  const next: ProxySettings = {
    enabled: false,
    port: settings.port ?? claudeSettings.port ?? 4000,
    apiKey: settings.apiKey ?? claudeSettings.apiKey ?? 'localmind-proxy-key',
    ...(appStore.get('claudeCodeProxy' as any) as ProxySettings | undefined),
    ...settings,
  }
  appStore.set('claudeCodeProxy' as any, next)
  const configPath = getConfigPath()
  writeFileSync(configPath, await buildConfig(next), 'utf-8')
  
  // Sync the updated selected models and ports directly to the Claude settings.json!
  await syncWithClaudeCodeSettings(next)

  return { ...next, configPath, baseUrl: `http://localhost:${next.port}` }
}

export function getClaudeCodeProxySettings() {
  const claudeSettings = getClaudeSettings()
  const defaultPort = claudeSettings.port ?? 4000
  const defaultApiKey = claudeSettings.apiKey ?? 'localmind-proxy-key'
  const settings = {
    enabled: false,
    port: defaultPort,
    apiKey: defaultApiKey,
    ...((appStore.get('claudeCodeProxy' as any) as ProxySettings | undefined) ?? {}),
  }
  return { ...settings, configPath: getConfigPath(), baseUrl: `http://localhost:${settings.port}` }
}

export async function startClaudeCodeProxy() {
  const settings = await saveClaudeCodeProxySettings({ enabled: true })
  await stopClaudeCodeProxy()
  const publicPort = settings.port ?? 4000
  const internalPort = await getAvailableLoopbackPort()
  internalLiteLlmPort = internalPort
  await stopProcessListeningOnPort(publicPort)
  lastOutput = ''

  proxyProcess = spawn('litellm', ['--config', settings.configPath, '--port', String(internalPort), '--host', '127.0.0.1'], {
    windowsHide: true,
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
    },
  })

  proxyProcess.stdout.on('data', (chunk) => {
    lastOutput = `${lastOutput}${chunk.toString()}`.slice(-4000)
  })
  proxyProcess.stderr.on('data', (chunk) => {
    lastOutput = `${lastOutput}${chunk.toString()}`.slice(-4000)
  })
  proxyProcess.on('error', (err) => {
    lastOutput = `${lastOutput}\n${err.message}`.slice(-4000)
    proxyProcess = null
  })
  proxyProcess.on('exit', () => {
    proxyProcess = null
    stopSanitizingProxy()
  })

  try {
    await waitForLiteLlmReady(internalPort)
  } catch (err) {
    await stopClaudeCodeProxy()
    throw err
  }

  await startSanitizingProxy(publicPort, internalPort)

  return getClaudeCodeProxyStatus()
}

export async function stopClaudeCodeProxy() {
  stopSanitizingProxy()
  if (proxyProcess) {
    const child = proxyProcess
    proxyProcess = null
    await stopProcessTree(child)
  }
  if (internalLiteLlmPort) {
    await stopProcessListeningOnPort(internalLiteLlmPort)
    internalLiteLlmPort = null
  }
  return getClaudeCodeProxyStatus()
}

export function getClaudeCodeProxyStatus() {
  const settings = getClaudeCodeProxySettings()
  return {
    running: !!proxyProcess && !!proxyServer,
    pid: proxyProcess?.pid ?? null,
    internalPort: internalLiteLlmPort,
    output: lastOutput,
    ...settings,
  }
}
