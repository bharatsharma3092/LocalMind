import https from 'https'
import http from 'http'

export async function fetchUrlContent(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http

    client.get(url, { headers: { 'User-Agent': 'LocalMind/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrlContent(res.headers.location).then(resolve).catch(reject)
        return
      }

      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 400)) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }

      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        const text = stripHtml(data)
        resolve(text)
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

function stripHtml(html: string): string {
  let text = html
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '')
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '')
  text = text.replace(/<head[\s\S]*?<\/head>/gi, '')
  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/&nbsp;/g, ' ')
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#39;/g, "'")
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.trim()
  return text
}
