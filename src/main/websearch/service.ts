import { getSecret } from '../settings/secrets'
import { appStore } from '../settings/app-store'

export type WebSearchProvider = 'tavily' | 'serper' | 'exa' | 'duckduckgo'

interface SearchResult {
  title: string
  url: string
  snippet: string
}

interface SearchResponse {
  success: boolean
  results: SearchResult[]
  error?: string
}

const log = {
  info: (msg: string, data?: unknown) => console.log(`[WebSearch] ${msg}`, data !== undefined ? data : ''),
  error: (msg: string, data?: unknown) => console.error(`[WebSearch] [ERROR] ${msg}`, data !== undefined ? data : ''),
}

export function getActiveWebSearchProvider(): WebSearchProvider | null {
  const enabled = appStore.get('webSearchEnabled') as boolean | undefined
  if (!enabled) return null
  return (appStore.get('webSearchProvider') as WebSearchProvider | undefined) ?? 'tavily'
}

export async function searchWeb(query: string): Promise<SearchResponse> {
  const provider = getActiveWebSearchProvider()
  if (!provider) {
    return { success: false, results: [], error: 'Web search is not enabled' }
  }

  try {
    switch (provider) {
      case 'tavily':
        return await searchTavily(query)
      case 'serper':
        return await searchSerper(query)
      case 'exa':
        return await searchExa(query)
      case 'duckduckgo':
        return await searchDuckDuckGo(query)
      default:
        return { success: false, results: [], error: `Unknown provider: ${provider}` }
    }
  } catch (err: any) {
    log.error('Search failed', err.message)
    return { success: false, results: [], error: err.message }
  }
}

async function searchTavily(query: string): Promise<SearchResponse> {
  const apiKey = await getSecret('tavily-api-key')
  if (!apiKey) {
    return { success: false, results: [], error: 'Tavily API key not configured. Go to Settings → Web Search.' }
  }

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      max_results: 5,
      include_answer: false,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    return { success: false, results: [], error: `Tavily API error (${res.status}): ${text}` }
  }

  const data = await res.json()
  const results: SearchResult[] = (data.results ?? []).map((r: any) => ({
    title: r.title ?? 'Untitled',
    url: r.url ?? '',
    snippet: r.content ?? r.snippet ?? '',
  }))

  return { success: true, results }
}

async function searchSerper(query: string): Promise<SearchResponse> {
  const apiKey = await getSecret('serper-api-key')
  if (!apiKey) {
    return { success: false, results: [], error: 'Serper API key not configured. Go to Settings → Web Search.' }
  }

  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({ q: query, num: 5 }),
  })

  if (!res.ok) {
    const text = await res.text()
    return { success: false, results: [], error: `Serper API error (${res.status}): ${text}` }
  }

  const data = await res.json()
  const organic = data.organic ?? []
  const results: SearchResult[] = organic.map((r: any) => ({
    title: r.title ?? 'Untitled',
    url: r.link ?? '',
    snippet: r.snippet ?? '',
  }))

  return { success: true, results }
}

async function searchExa(query: string): Promise<SearchResponse> {
  const apiKey = await getSecret('exa-api-key')
  if (!apiKey) {
    return { success: false, results: [], error: 'Exa API key not configured. Go to Settings → Web Search.' }
  }

  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      query,
      numResults: 5,
      useAutoprompt: true,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    return { success: false, results: [], error: `Exa API error (${res.status}): ${text}` }
  }

  const data = await res.json()
  const results: SearchResult[] = (data.results ?? []).map((r: any) => ({
    title: r.title ?? 'Untitled',
    url: r.url ?? '',
    snippet: r.text ?? r.snippet ?? '',
  }))

  return { success: true, results }
}

async function searchDuckDuckGo(query: string): Promise<SearchResponse> {
  // DuckDuckGo HTML scraping fallback (no API key needed)
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (!res.ok) {
      return { success: false, results: [], error: `DuckDuckGo error (${res.status})` }
    }

    const html = await res.text()
    const results: SearchResult[] = []

    // Simple regex-based extraction
    const resultBlocks = html.match(/<a[^>]+class="result__a"[^>]*>.*?<\/a>.*?<\/div>/gs) ?? []
    for (const block of resultBlocks.slice(0, 5)) {
      const titleMatch = block.match(/<a[^>]+class="result__a"[^>]*>(.*?)<\/a>/s)
      const urlMatch = block.match(/href="(.*?)"/)
      const snippetMatch = block.match(/class="result__snippet"[^>]*>(.*?)<\/div>/s)

      if (titleMatch && urlMatch) {
        results.push({
          title: stripHtml(titleMatch[1]),
          url: urlMatch[1].replace(/^\/\/duckduckgo.com\/l\/\?uddg=/, '').replace(/&rut=.*$/, ''),
          snippet: stripHtml(snippetMatch?.[1] ?? ''),
        })
      }
    }

    return { success: true, results }
  } catch (err: any) {
    return { success: false, results: [], error: err.message }
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}
