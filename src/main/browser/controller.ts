import { BrowserWindow, app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { appStore } from '../settings/app-store'
import { CdpBackend } from './cdp'

/**
 * Agent "browser use" controller.
 *
 * Two interchangeable backends, chosen by settings (`browserMode`):
 *  - 'embedded' (default): a visible Electron Chromium window with an isolated,
 *    persistent profile (`persist:agent-browser`). No access to the user's real
 *    Chrome/Edge logins, but logins persist once signed in.
 *  - 'cdp': drives the user's real Chrome/Edge over the DevTools Protocol, so
 *    their existing logins apply (browser launched with --remote-debugging-port).
 *
 * High-level actions (read/click/type/scroll/links/wait) are backend-agnostic:
 * they run argument-escaped scripts via the backend's evaluate().
 */

const MAX_TEXT = 6000

export interface NavigateResult {
  url: string
  title: string
  text: string
}

export interface ActionResult {
  ok: boolean
  detail: string
  url?: string
}

interface Backend {
  evaluate<T>(expression: string): Promise<T>
  navigate(url: string): Promise<void>
  screenshotPng(): Promise<Buffer>
  pressKey(key: string): Promise<void>
  reload(): Promise<void>
  goHistory(direction: 'back' | 'forward'): Promise<void>
  getUrl(): Promise<string>
  focus(): void
  isAlive(): boolean
  close(): void
}

/** Backend backed by an Electron BrowserWindow (LocalMind's own Chromium). */
class ElectronBackend implements Backend {
  private win: BrowserWindow | null = null

  private ensure(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win
    this.win = new BrowserWindow({
      width: 1100,
      height: 820,
      show: true,
      title: 'LocalMind — Agent Browser',
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'persist:agent-browser',
      },
    })
    this.win.on('closed', () => {
      this.win = null
    })
    return this.win
  }

  private require(): BrowserWindow {
    if (!this.win || this.win.isDestroyed()) throw new Error('No browser is open. Use local__browser_open first.')
    return this.win
  }

  async evaluate<T>(expression: string): Promise<T> {
    return (await this.require().webContents.executeJavaScript(expression, true)) as T
  }

  async navigate(url: string): Promise<void> {
    const win = this.ensure()
    win.focus()
    await win.loadURL(url)
    await new Promise((r) => setTimeout(r, 600))
  }

  async screenshotPng(): Promise<Buffer> {
    const image = await this.require().webContents.capturePage()
    return image.toPNG()
  }

  async pressKey(key: string): Promise<void> {
    const win = this.require()
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key } as any)
    win.webContents.sendInputEvent({ type: 'char', keyCode: key } as any)
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key } as any)
    await new Promise((r) => setTimeout(r, 400))
  }

  async reload(): Promise<void> {
    this.require().webContents.reload()
    await new Promise((r) => setTimeout(r, 800))
  }

  async goHistory(direction: 'back' | 'forward'): Promise<void> {
    const nav = this.require().webContents.navigationHistory
    if (direction === 'back' && nav?.canGoBack()) nav.goBack()
    if (direction === 'forward' && nav?.canGoForward()) nav.goForward()
    await new Promise((r) => setTimeout(r, 700))
  }

  async getUrl(): Promise<string> {
    return this.require().webContents.getURL()
  }

  focus(): void {
    if (this.win && !this.win.isDestroyed()) this.win.focus()
  }

  isAlive(): boolean {
    return !!this.win && !this.win.isDestroyed()
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) this.win.close()
    this.win = null
  }
}

class BrowserController {
  private backend: Backend | null = null
  private backendKind: 'embedded' | 'cdp' | null = null

  /** Resolve (and create if needed) the backend matching current settings. */
  private getOrCreateBackend(): Backend {
    const mode = (appStore.get('browserMode' as any) as 'embedded' | 'cdp' | undefined) ?? 'embedded'
    if (this.backend && this.backend.isAlive() && this.backendKind === mode) return this.backend

    // Mode changed or backend dead — recreate.
    if (this.backend) this.backend.close()
    if (mode === 'cdp') {
      const host = (appStore.get('cdpHost' as any) as string | undefined) || '127.0.0.1'
      const port = Number(appStore.get('cdpPort' as any)) || 9222
      const path = (appStore.get('cdpBrowserPath' as any) as string | undefined) || undefined
      this.backend = new CdpBackend(host, port, path)
    } else {
      this.backend = new ElectronBackend()
    }
    this.backendKind = mode
    return this.backend
  }

  /** Require an already-open backend for actions that act on the current page. */
  private requireBackend(): Backend {
    if (!this.backend || !this.backend.isAlive()) {
      throw new Error('No browser is open. Use local__browser_open first.')
    }
    return this.backend
  }

  async navigate(rawUrl: string): Promise<NavigateResult> {
    let url = String(rawUrl || '').trim()
    if (!url) throw new Error('A URL is required.')
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    const backend = this.getOrCreateBackend()
    backend.focus()
    await backend.navigate(url)
    return this.readPage()
  }

  async readPage(): Promise<NavigateResult> {
    const backend = this.requireBackend()
    const data = await backend.evaluate<{ title: string; text: string }>(
      `(() => ({ title: document.title || '', text: (document.body && document.body.innerText) || '' }))()`
    )
    return {
      url: await backend.getUrl(),
      title: data?.title ?? '',
      text: (data?.text || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT),
    }
  }

  async click(target: string): Promise<ActionResult> {
    const backend = this.requireBackend()
    const arg = JSON.stringify(String(target ?? ''))
    const script = `(() => {
      const target = ${arg};
      let el = null;
      try { el = document.querySelector(target); } catch (e) {}
      if (!el) {
        const candidates = Array.from(document.querySelectorAll('a, button, [role=button], input[type=submit], input[type=button]'));
        const lower = target.toLowerCase();
        el = candidates.find((n) => (n.innerText || n.value || '').trim().toLowerCase().includes(lower));
      }
      if (!el) return { ok: false, detail: 'No matching element for: ' + target };
      el.scrollIntoView({ block: 'center' });
      el.click();
      return { ok: true, detail: 'Clicked: ' + ((el.innerText || el.value || el.tagName) + '').trim().slice(0, 80) };
    })()`
    const result = await backend.evaluate<ActionResult>(script)
    await new Promise((r) => setTimeout(r, 500))
    result.url = await backend.getUrl()
    return result
  }

  async type(selector: string, text: string, submit = false): Promise<ActionResult> {
    const backend = this.requireBackend()
    const sel = JSON.stringify(String(selector ?? ''))
    const val = JSON.stringify(String(text ?? ''))
    const doSubmit = submit ? 'true' : 'false'
    const script = `(() => {
      const el = document.querySelector(${sel});
      if (!el) return { ok: false, detail: 'No input matched selector: ' + ${sel} };
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(el.__proto__, 'value');
      if (setter && setter.set) setter.set.call(el, ${val}); else el.value = ${val};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (${doSubmit}) {
        const form = el.form || el.closest('form');
        if (form) { form.requestSubmit ? form.requestSubmit() : form.submit(); }
        else { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
      }
      return { ok: true, detail: 'Typed into ' + ${sel} + (${doSubmit} ? ' and submitted' : '') };
    })()`
    const result = await backend.evaluate<ActionResult>(script)
    if (submit) await new Promise((r) => setTimeout(r, 700))
    return result
  }

  async screenshot(): Promise<string> {
    const backend = this.requireBackend()
    const png = await backend.screenshotPng()
    const dir = join(app.getPath('userData'), 'browser-shots')
    await fs.mkdir(dir, { recursive: true })
    const file = join(dir, `shot-${Date.now()}.png`)
    await fs.writeFile(file, png)
    return file
  }

  async goBack(): Promise<NavigateResult> {
    await this.requireBackend().goHistory('back')
    return this.readPage()
  }

  async goForward(): Promise<NavigateResult> {
    await this.requireBackend().goHistory('forward')
    return this.readPage()
  }

  async reload(): Promise<NavigateResult> {
    await this.requireBackend().reload()
    return this.readPage()
  }

  async scroll(direction: 'down' | 'up' | 'top' | 'bottom', amount = 800): Promise<ActionResult> {
    const backend = this.requireBackend()
    const dir = JSON.stringify(direction)
    const amt = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 800
    const script = `(() => {
      const d = ${dir};
      if (d === 'top') window.scrollTo({ top: 0 });
      else if (d === 'bottom') window.scrollTo({ top: document.body.scrollHeight });
      else if (d === 'up') window.scrollBy({ top: -${amt} });
      else window.scrollBy({ top: ${amt} });
      return { ok: true, detail: 'Scrolled ' + d };
    })()`
    return backend.evaluate<ActionResult>(script)
  }

  async waitFor(target: string | number): Promise<ActionResult> {
    const backend = this.requireBackend()
    if (typeof target === 'number' || /^\d+$/.test(String(target))) {
      const ms = Math.min(Math.max(Number(target), 0), 15000)
      await new Promise((r) => setTimeout(r, ms))
      return { ok: true, detail: `Waited ${ms}ms` }
    }
    const sel = JSON.stringify(String(target))
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      const found = await backend.evaluate<boolean>(`!!document.querySelector(${sel})`)
      if (found) return { ok: true, detail: `Element appeared: ${target}` }
      await new Promise((r) => setTimeout(r, 400))
    }
    return { ok: false, detail: `Timed out waiting for: ${target}` }
  }

  async links(): Promise<{ links: Array<{ text: string; href: string }> }> {
    const backend = this.requireBackend()
    const script = `(() => {
      const out = []; const seen = new Set();
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.href; const text = (a.innerText || '').trim();
        if (!href || seen.has(href)) continue;
        seen.add(href);
        out.push({ text: text.slice(0, 100), href });
        if (out.length >= 50) break;
      }
      return out;
    })()`
    const result = await backend.evaluate<Array<{ text: string; href: string }>>(script)
    return { links: result ?? [] }
  }

  async pressKey(key: string, selector?: string): Promise<ActionResult> {
    const backend = this.requireBackend()
    if (selector) {
      const sel = JSON.stringify(selector)
      await backend.evaluate(`(() => { const el = document.querySelector(${sel}); if (el) el.focus(); })()`)
    }
    await backend.pressKey(key)
    await new Promise((r) => setTimeout(r, 400))
    return { ok: true, detail: `Pressed ${key}`, url: await backend.getUrl() }
  }

  current(): { url: string; title: string } | null {
    return this.backend && this.backend.isAlive() ? { url: '', title: '' } : null
  }

  close(): boolean {
    if (this.backend && this.backend.isAlive()) {
      this.backend.close()
      this.backend = null
      this.backendKind = null
      return true
    }
    return false
  }
}

export const browserController = new BrowserController()
