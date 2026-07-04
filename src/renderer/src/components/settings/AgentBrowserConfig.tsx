import { useState, useEffect } from 'react'

type BrowserMode = 'embedded' | 'cdp'

/**
 * Configure the agent "browser use" backend:
 *  - Embedded: LocalMind's own Chromium window (isolated, persistent profile).
 *  - CDP: drive your real Chrome/Edge over the DevTools Protocol so your logins apply.
 */
export function AgentBrowserConfig() {
  const [mode, setMode] = useState<BrowserMode>('embedded')
  const [port, setPort] = useState('9222')
  const [browserPath, setBrowserPath] = useState('')
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    window.localmind.settings.get('browserMode').then((r) => {
      if (r.success && (r.data === 'embedded' || r.data === 'cdp')) setMode(r.data)
    })
    window.localmind.settings.get('cdpPort').then((r) => {
      if (r.success && r.data) setPort(String(r.data))
    })
    window.localmind.settings.get('cdpBrowserPath').then((r) => {
      if (r.success && r.data) setBrowserPath(r.data)
    })
  }, [])

  const save = async () => {
    await window.localmind.settings.set('browserMode', mode)
    await window.localmind.settings.set('cdpPort', parseInt(port, 10) || 9222)
    await window.localmind.settings.set('cdpBrowserPath', browserPath.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await window.localmind.browser.testCdp({
        host: '127.0.0.1',
        port: parseInt(port, 10) || 9222,
        browserPath: browserPath.trim() || undefined,
      })
      if (r.success && r.data) {
        setTestResult(r.data)
      } else {
        setTestResult({ ok: false, message: r.error || 'Connection test failed.' })
      }
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <section>
      <h3 className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px] text-primary">travel_explore</span>
        Agent Browser
      </h3>

      <div className="space-y-3">
        <label
          className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
            mode === 'embedded' ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-container-low'
          }`}
        >
          <input type="radio" checked={mode === 'embedded'} onChange={() => setMode('embedded')} className="mt-1 accent-[var(--color-primary)]" />
          <span>
            <span className="block text-sm font-semibold text-on-surface">Embedded browser (default)</span>
            <span className="block text-xs text-on-surface-variant mt-0.5">
              LocalMind's own Chromium window with an isolated, persistent profile. Does not use your existing Chrome/Edge logins, but stays logged in once you sign in inside it.
            </span>
          </span>
        </label>

        <label
          className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
            mode === 'cdp' ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-container-low'
          }`}
        >
          <input type="radio" checked={mode === 'cdp'} onChange={() => setMode('cdp')} className="mt-1 accent-[var(--color-primary)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-on-surface">Your Chrome / Edge (CDP)</span>
            <span className="block text-xs text-on-surface-variant mt-0.5">
              Drives a real Chrome/Edge over the DevTools Protocol so your logins apply. LocalMind launches a debuggable browser with a dedicated profile (sign in once; it persists).
            </span>

            {mode === 'cdp' && (
              <div className="mt-3 space-y-2">
                <div>
                  <label className="text-[11px] text-on-surface-variant">Debugging port</label>
                  <input
                    value={port}
                    onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ''))}
                    className="mt-1 w-32 rounded-lg border border-outline-variant bg-surface-container px-3 py-1.5 text-sm text-on-surface outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-on-surface-variant">Browser executable path (optional — auto-detected if blank)</label>
                  <input
                    value={browserPath}
                    onChange={(e) => setBrowserPath(e.target.value)}
                    placeholder="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
                    className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-1.5 text-sm text-on-surface outline-none focus:border-primary font-mono"
                  />
                </div>
                <p className="text-[11px] text-on-surface-variant/80 leading-5">
                  Note: Chrome/Edge can't be debugged on your <em>primary</em> running profile, so LocalMind uses a separate
                  profile (<code className="font-mono">cdp-profile</code>). Sign in to your accounts there once and they persist.
                  Close your normal browser is not required — the dedicated profile runs alongside it.
                </p>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      testConnection()
                    }}
                    disabled={testing}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container px-3 py-1.5 text-xs font-semibold text-on-surface hover:bg-surface-container-high disabled:opacity-60"
                  >
                    <span className={`material-symbols-outlined text-[15px] ${testing ? 'animate-spin' : ''}`}>
                      {testing ? 'progress_activity' : 'cable'}
                    </span>
                    {testing ? 'Testing…' : 'Test connection'}
                  </button>
                </div>

                {testResult && (
                  <div
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-5 ${
                      testResult.ok
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px] mt-px">
                      {testResult.ok ? 'check_circle' : 'error'}
                    </span>
                    <span className="min-w-0 break-words">{testResult.message}</span>
                  </div>
                )}
              </div>
            )}
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              saved ? 'bg-emerald-500 text-white' : 'bg-primary-container text-on-primary-container hover:opacity-90'
            }`}
          >
            {saved ? 'Saved' : 'Save browser settings'}
          </button>
        </div>
      </div>
    </section>
  )
}
