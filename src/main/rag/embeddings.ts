import { appStore } from '../settings/app-store'

/**
 * Local embedding support for the RAG layer, backed by Ollama's /api/embed.
 * Privacy-first: embeddings never leave the machine. When Ollama (or the
 * configured embedding model) is unavailable, callers fall back to lexical
 * scoring — the app keeps working, just without semantic recall.
 */

const OLLAMA_BASE_URL = 'http://localhost:11434'
const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text'
const PROBE_CACHE_MS = 60_000

export function getEmbeddingModel(): string {
  return (appStore.get('ragEmbeddingModel') as string | undefined)?.trim() || DEFAULT_EMBEDDING_MODEL
}

/**
 * Embed a batch of texts via Ollama. Returns null on any failure (Ollama not
 * running, model not pulled, malformed response) so callers can degrade to
 * lexical search instead of surfacing an error.
 */
export async function embedTexts(texts: string[], signal?: AbortSignal): Promise<number[][] | null> {
  if (texts.length === 0) return []
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: getEmbeddingModel(), input: texts }),
      signal,
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.warn(`[RAG][Embeddings] Ollama embed failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ''}`)
      return null
    }
    const data = await response.json()
    const embeddings = data?.embeddings
    if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
      console.warn('[RAG][Embeddings] Unexpected embed response shape from Ollama')
      return null
    }
    return embeddings as number[][]
  } catch (err: any) {
    console.warn('[RAG][Embeddings] Ollama unreachable, falling back to lexical search:', err?.message ?? err)
    return null
  }
}

export async function embedQuery(text: string, signal?: AbortSignal): Promise<number[] | null> {
  const result = await embedTexts([text], signal)
  return result?.[0] ?? null
}

let lastProbe: { at: number; available: boolean } | null = null

/** Cached availability probe so status calls don't hammer Ollama. */
export async function isEmbeddingAvailable(force = false): Promise<boolean> {
  if (!force && lastProbe && Date.now() - lastProbe.at < PROBE_CACHE_MS) {
    return lastProbe.available
  }
  const result = await embedTexts(['ping'])
  lastProbe = { at: Date.now(), available: result !== null }
  return lastProbe.available
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
