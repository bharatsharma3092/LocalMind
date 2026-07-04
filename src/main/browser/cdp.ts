import WebSocket from 'ws'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/**
 * Minimal Chrome DevTools Protocol client + backend.
 *
 * Lets the agent drive the user's *real* Chrome/Edge (so their existing logins
 * apply) by attaching to a browser launched with --remote-debugging-port.
 * Implemented over the already-present `ws` package — no Puppeteer dependency.
 */

interface PendingCommand {
  resolve: (value: any) => void
  reject: (err: Error) => void
}

class CdpClient {
  private ws: WebSocket
  private id = 0
  private pending = new Map<number, PendingCommand>()
  private events = new Map<string, Array<(params: any) => void>>()

  private constructor(ws: WebSocket) {
    this.ws = ws
    this.ws.on('message', (data) => {
      let msg: any
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return
      }
      if (typeof msg.id === 'number' && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!
        this.pending.delete(msg.id)
        if (msg.error) p.reject(new Error(msg.error.message ?? 'CDP error'))
        else p.resolve(msg.result)
      } else if (msg.method) {
        for (const cb of this.events.get(msg.method) ?? []) cb(msg.params)
      }
    })
  }

  static async connect(wsUrl: string): Promise<CdpClient> {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 })
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve())
      ws.once('error', (e) => reject(e))
    })
    return new CdpClient(ws)
  }

  send<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.id
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP command timed out: ${method}`))
        }
      }, 30000)
    })
  }

  on(method: string, cb: (params: any) => void): void {
    const list = this.events.get(method) ?? []
    list.push(cb)
    this.events.set(method, list)
  }

  once(method: string): Promise<any> {
    return new Promise((resolve) => {
      const handler = (params: any) => {
        const list = this.events.get(method) ?? []
        this.events.set(method, list.filter((h) => h !== handler))
        resolve(params)
      }
      this.on(method, handler)
    })
  }

  get isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN
  }

  close(): void {
    try {
      this.ws.close()
    } catch {
      /* ignore */
    }
  }
}

const WIN_KEY_MAP: Record<string, { keyCode: number; key: string; code: string; text?: string }> = {
  Enter: { keyCode: 13, key: 'Enter', code: 'Enter', text: '\r' },
  Tab: { keyCode: 9, key: 'Tab', code: 'Tab' },
  Escape: { keyCode: 27, key: 'Escape', code: 'Escape' },
  Backspace: { keyCode: 8, key: 'Backspace', code: 'Backspace' },
  ArrowDown: { keyCode: 40, key: 'ArrowDown', code: 'ArrowDown' },
  ArrowUp: { keyCode: 38, key: 'ArrowUp', code: 'ArrowUp' },
  ArrowLeft: { keyCode: 37, key: 'ArrowLeft', code: 'ArrowLeft' },
  ArrowRight: { keyCode: 39, key: 'ArrowRight', code: 'ArrowRight' },
}

async function discoverPageWsUrl(host: string, port: number): Promise<string> {
  const base = `http://${host}:${port}`
  let list: any[] = []
  try {
    list = await (await fetch(`${base}/json`)).json()
  } catch {
    throw new Error(`Cannot reach a debuggable browser at ${base}. Launch Chrome/Edge with --remote-debugging-port=${port}.`)
  }
  let page = list.find(
    (t) => t.type === 'page' && t.webSocketDebuggerUrl && !String(t.url).startsWith('devtools://')
  )
  if (!page) {
    // Create a fresh tab (newer Chrome requires PUT).
    for (const method of ['PUT', 'GET'] as const) {
      try {
        const created = await (await fetch(`${base}/json/new?about:blank`, { method })).json()
        if (created?.webSocketDebuggerUrl) {
          page = created
          break
        }
      } catch {
        /* try next */
      }
    }
  }
  if (!page?.webSocketDebuggerUrl) throw new Error('No CDP page target available in the running browser.')
  return page.webSocketDebuggerUrl
}

function findBrowserExecutable(configured?: string): string | null {
  if (configured && existsSync(configured)) return configured
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

/** Ensure a debuggable browser is reachable; auto-launch one (dedicated profile) if not. */
export async function ensureDebuggableBrowser(host: string, port: number, browserPath?: string): Promise<void> {
  const base = `http://${host}:${port}`
  const reachable = async () => {
    try {
      const r = await fetch(`${base}/json/version`, { signal: AbortSignal.timeout(1500) })
      return r.ok
    } catch {
      return false
    }
  }
  if (await reachable()) return

  const exe = findBrowserExecutable(browserPath)
  if (!exe) {
    throw new Error(
      `No debuggable browser running on ${base} and no Chrome/Edge executable found. ` +
        `Set the browser path in Settings, or launch Chrome with --remote-debugging-port=${port}.`
    )
  }
  // Dedicated profile so it doesn't clash with the user's primary running browser,
  // and so logins persist across runs once signed in.
  const profileDir = join(app.getPath('userData'), 'cdp-profile')
  const child = spawn(
    exe,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { detached: true, stdio: 'ignore' }
  )
  child.unref()

  // Poll until the debugging endpoint is up (~10s).
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (await reachable()) return
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`Launched a browser but its debugging endpoint did not come up on ${base}.`)
}

/** Attempt to ensure + attach to a debuggable browser; returns a human-readable status. */
export async function testCdpConnection(
  host: string,
  port: number,
  browserPath?: string
): Promise<{ ok: boolean; message: string }> {
  try {
    await ensureDebuggableBrowser(host, port, browserPath)
    const wsUrl = await discoverPageWsUrl(host, port)
    const client = await CdpClient.connect(wsUrl)
    try {
      await client.send('Runtime.enable')
      const res = await client.send<{ result: { value: string } }>('Runtime.evaluate', {
        expression: 'location.href',
        returnByValue: true,
      })
      const url = res?.result?.value || 'about:blank'
      return { ok: true, message: `Connected to ${host}:${port}. Active tab: ${url}` }
    } finally {
      client.close()
    }
  } catch (err: any) {
    return { ok: false, message: err?.message ?? 'Failed to connect to a debuggable browser.' }
  }
}

/** Backend that drives a real Chrome/Edge tab over CDP. */
export class CdpBackend {
  private client: CdpClient | null = null

  constructor(
    private host: string,
    private port: number,
    private browserPath?: string
  ) {}

  private async ensureClient(): Promise<CdpClient> {
    if (this.client && this.client.isOpen) return this.client
    await ensureDebuggableBrowser(this.host, this.port, this.browserPath)
    const wsUrl = await discoverPageWsUrl(this.host, this.port)
    this.client = await CdpClient.connect(wsUrl)
    await this.client.send('Page.enable')
    await this.client.send('Runtime.enable')
    return this.client
  }

  isAlive(): boolean {
    return !!this.client && this.client.isOpen
  }

  async evaluate<T>(expression: string): Promise<T> {
    const client = await this.ensureClient()
    const res = await client.send<{ result: { value: T }; exceptionDetails?: any }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? 'Page evaluation failed')
    }
    return res.result?.value as T
  }

  async navigate(url: string): Promise<void> {
    const client = await this.ensureClient()
    const loaded = client.once('Page.loadEventFired')
    await client.send('Page.navigate', { url })
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 8000))])
    await new Promise((r) => setTimeout(r, 500))
  }

  async screenshotPng(): Promise<Buffer> {
    const client = await this.ensureClient()
    const res = await client.send<{ data: string }>('Page.captureScreenshot', { format: 'png' })
    return Buffer.from(res.data, 'base64')
  }

  async pressKey(key: string): Promise<void> {
    const client = await this.ensureClient()
    const def = WIN_KEY_MAP[key]
    if (def) {
      await client.send('Input.dispatchKeyEvent', { type: 'keyDown', ...def })
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: def.key, code: def.code, keyCode: def.keyCode })
    } else if (key.length === 1) {
      await client.send('Input.dispatchKeyEvent', { type: 'char', text: key })
    }
  }

  async reload(): Promise<void> {
    const client = await this.ensureClient()
    const loaded = client.once('Page.loadEventFired')
    await client.send('Page.reload')
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 8000))])
  }

  async goHistory(direction: 'back' | 'forward'): Promise<void> {
    const client = await this.ensureClient()
    const hist = await client.send<{ currentIndex: number; entries: any[] }>('Page.getNavigationHistory')
    const targetIndex = direction === 'back' ? hist.currentIndex - 1 : hist.currentIndex + 1
    const entry = hist.entries[targetIndex]
    if (entry) {
      await client.send('Page.navigateToHistoryEntry', { entryId: entry.id })
      await new Promise((r) => setTimeout(r, 700))
    }
  }

  async getUrl(): Promise<string> {
    try {
      return (await this.evaluate<string>('location.href')) ?? ''
    } catch {
      return ''
    }
  }

  focus(): void {
    /* CDP browser is its own window; nothing to focus from here */
  }

  close(): void {
    this.client?.close()
    this.client = null
  }
}
