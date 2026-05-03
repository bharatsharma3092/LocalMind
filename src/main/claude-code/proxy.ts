import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
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
let lastOutput = ''

const aliases = {
  opus: 'claude-3-opus-20240229',
  sonnet: 'claude-3-5-sonnet-20241022',
  haiku: 'claude-3-haiku-20240307',
}

function quoteYaml(value: string): string {
  return JSON.stringify(value)
}

function getConfigPath(): string {
  const dir = join(app.getPath('userData'), 'claude-code-proxy')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'litellm-config.yaml')
}

async function toLiteLlmParams(model?: ProxyModel): Promise<Record<string, string> | null> {
  if (!model?.id || !model.provider) return null

  if (model.provider === 'ollama') {
    const baseUrl = (appStore.get('ollamaUrl' as any) as string | undefined) ?? 'http://localhost:11434'
    return { model: `ollama_chat/${model.id}`, api_base: baseUrl }
  }

  if (model.provider === 'openai') {
    const key = await getSecret('openai-api-key')
    return { model: model.id, ...(key ? { api_key: key } : {}) }
  }

  if (model.provider === 'openrouter') {
    const key = await getSecret('openrouter-api-key')
    return {
      model: `openrouter/${model.id}`,
      api_base: 'https://openrouter.ai/api/v1',
      ...(key ? { api_key: key } : {}),
    }
  }

  if (model.provider === 'google') {
    const key = await getSecret('google-api-key')
    return { model: `gemini/${model.id}`, ...(key ? { api_key: key } : {}) }
  }

  if (model.provider === 'custom') {
    const provider = getCustomProvidersFromSettings().find((item) => item.id === model.customProviderId)
    const key = model.customProviderId ? await getSecret(`custom-provider-${model.customProviderId}-api-key`) : await getSecret('custom-api-key')
    return {
      model: `openai/${model.id}`,
      api_base: provider?.baseUrl ?? 'http://localhost:8080/v1',
      ...(key ? { api_key: key } : {}),
    }
  }

  return { model: model.id }
}

async function buildConfig(settings: ProxySettings): Promise<string> {
  const entries = [
    ['opus', settings.opusModel],
    ['sonnet', settings.sonnetModel],
    ['haiku', settings.haikuModel],
  ] as const

  const lines = ['model_list:']
  for (const [role, model] of entries) {
    const params = await toLiteLlmParams(model)
    if (!params) continue
    lines.push(`  - model_name: ${quoteYaml(aliases[role])}`)
    lines.push('    litellm_params:')
    for (const [key, value] of Object.entries(params)) {
      lines.push(`      ${key}: ${quoteYaml(value)}`)
    }
  }

  lines.push('general_settings:')
  lines.push('  master_key: ' + quoteYaml(settings.apiKey || 'localmind-proxy-key'))
  return `${lines.join('\n')}\n`
}

export async function saveClaudeCodeProxySettings(settings: ProxySettings) {
  const next: ProxySettings = {
    enabled: false,
    port: 4000,
    apiKey: 'localmind-proxy-key',
    ...(appStore.get('claudeCodeProxy' as any) as ProxySettings | undefined),
    ...settings,
  }
  appStore.set('claudeCodeProxy' as any, next)
  const configPath = getConfigPath()
  writeFileSync(configPath, await buildConfig(next), 'utf-8')
  return { ...next, configPath, baseUrl: `http://localhost:${next.port}` }
}

export function getClaudeCodeProxySettings() {
  const settings = {
    enabled: false,
    port: 4000,
    apiKey: 'localmind-proxy-key',
    ...((appStore.get('claudeCodeProxy' as any) as ProxySettings | undefined) ?? {}),
  }
  return { ...settings, configPath: getConfigPath(), baseUrl: `http://localhost:${settings.port}` }
}

export async function startClaudeCodeProxy() {
  const settings = await saveClaudeCodeProxySettings({ enabled: true })
  stopClaudeCodeProxy()
  lastOutput = ''

  proxyProcess = spawn('litellm', ['--config', settings.configPath, '--port', String(settings.port), '--host', '127.0.0.1'], {
    windowsHide: true,
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
  })

  return getClaudeCodeProxyStatus()
}

export function stopClaudeCodeProxy() {
  if (proxyProcess) {
    proxyProcess.kill()
    proxyProcess = null
  }
  return getClaudeCodeProxyStatus()
}

export function getClaudeCodeProxyStatus() {
  const settings = getClaudeCodeProxySettings()
  return {
    running: !!proxyProcess,
    pid: proxyProcess?.pid ?? null,
    output: lastOutput,
    ...settings,
  }
}
