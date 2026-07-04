import { appStore } from '../settings/app-store'

/**
 * Converts text into an embedding vector. Local-first: defaults to an Ollama
 * embedding model so it honors Privacy_Mode. A configured cloud model may be
 * used only when Privacy_Mode is off.
 */
export interface EmbeddingProvider {
  isAvailable(): Promise<boolean>
  isLocal(): boolean
  embed(text: string): Promise<number[]>
  readonly model: string
}

const EMBED_TIMEOUT_MS = 30_000
const DEFAULT_OLLAMA_URL = 'http://localhost:11434'
const DEFAULT_EMBED_MODEL = 'nomic-embed-text'

function getOllamaUrl(): string {
  return (appStore.get('ollamaUrl') as string | undefined)?.trim() || DEFAULT_OLLAMA_URL
}

function getConfiguredModel(): string {
  const cfg = appStore.get('memoryConfig' as any) as { embeddingModel?: string | null } | undefined
  return cfg?.embeddingModel?.trim() || DEFAULT_EMBED_MODEL
}

/** Local Ollama embedding provider (privacy-preserving). */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  constructor(public readonly model: string = getConfiguredModel()) {}

  isLocal(): boolean {
    return true
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${getOllamaUrl()}/api/tags`, { signal: AbortSignal.timeout(2000) })
      return res.ok
    } catch {
      return false
    }
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${getOllamaUrl()}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt: text }),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    })
    if (!res.ok) {
      throw new Error(`Ollama embeddings error ${res.status}: ${await res.text().catch(() => '')}`)
    }
    const data = (await res.json()) as { embedding?: number[] }
    if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
      throw new Error('Ollama returned an empty embedding')
    }
    return data.embedding
  }
}

/**
 * Resolve the active embedding provider, honoring Privacy_Mode.
 * Returns null when no usable provider is available (caller falls back to lexical).
 */
export async function resolveEmbeddingProvider(): Promise<EmbeddingProvider | null> {
  // Phase 1 ships only the local provider. Under Privacy_Mode this is the only
  // permissible option anyway; cloud embedding providers can be added later.
  const provider = new OllamaEmbeddingProvider()
  const available = await provider.isAvailable()
  return available ? provider : null
}
