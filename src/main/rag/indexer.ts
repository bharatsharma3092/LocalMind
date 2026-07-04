import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { v4 as uuid } from 'uuid'
import { embedTexts, embedQuery, isEmbeddingAvailable, cosineSimilarity, getEmbeddingModel } from './embeddings'

export interface RAGDocument {
  id: string
  filename: string
  contentHash: string
  chunkCount: number
  createdAt: number
  /** Model that produced this document's chunk embeddings; unset = lexical-only. */
  embeddingModel?: string
}

export interface RAGChunk {
  id: string
  documentId: string
  content: string
  chunkIndex: number
  /** Vector from the local Ollama embedding model; unset = lexical-only chunk. */
  embedding?: number[]
}

export interface RAGQueryResult {
  content: string
  filename: string
  score: number
}

interface RAGIndex {
  documents: Record<string, RAGDocument>
  chunks: RAGChunk[]
}

const INDEX_FILE = 'rag-index.json'
const EMBED_BATCH_SIZE = 16

function getRagDir(): string {
  const dir = join(app.getPath('userData'), 'rag')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

let index: RAGIndex = { documents: {}, chunks: [] }

export function initRagIndex(): void {
  const indexPath = join(getRagDir(), INDEX_FILE)
  if (existsSync(indexPath)) {
    try {
      const data = readFileSync(indexPath, 'utf-8')
      index = JSON.parse(data)
    } catch {
      index = { documents: {}, chunks: [] }
    }
  }
}

function persistIndex(): void {
  const indexPath = join(getRagDir(), INDEX_FILE)
  writeFileSync(indexPath, JSON.stringify(index), 'utf-8')
}

function chunkText(text: string, chunkSize: number = 500, overlap: number = 50): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))
    start += chunkSize - overlap
    if (start >= text.length) break
  }
  return chunks
}

function simpleHash(text: string): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

export async function indexDocument(filename: string, text: string, onProgress?: (pct: number) => void): Promise<RAGDocument> {
  const contentHash = simpleHash(text)
  const textChunks = chunkText(text)

  const doc: RAGDocument = {
    id: uuid(),
    filename,
    contentHash,
    chunkCount: textChunks.length,
    createdAt: Date.now(),
  }

  const chunks: RAGChunk[] = textChunks.map((content, i) => ({
    id: uuid(),
    documentId: doc.id,
    content,
    chunkIndex: i,
  }))

  // Embed chunks in batches via local Ollama. On any failure the document is
  // stored lexical-only and queries fall back to keyword scoring for it.
  let embeddedCount = 0
  const totalBatches = Math.ceil(chunks.length / EMBED_BATCH_SIZE)
  for (let batch = 0; batch < totalBatches; batch++) {
    const slice = chunks.slice(batch * EMBED_BATCH_SIZE, (batch + 1) * EMBED_BATCH_SIZE)
    const vectors = await embedTexts(slice.map((c) => c.content))
    if (vectors === null) break
    for (let i = 0; i < slice.length; i++) {
      slice[i].embedding = vectors[i]
      embeddedCount++
    }
    onProgress?.(Math.round(((batch + 1) / totalBatches) * 100))
  }
  if (embeddedCount === chunks.length && chunks.length > 0) {
    doc.embeddingModel = getEmbeddingModel()
  } else if (embeddedCount < chunks.length) {
    console.warn(`[RAG] Indexed "${filename}" with ${embeddedCount}/${chunks.length} embedded chunks (lexical fallback active for the rest)`)
  }

  index.documents[doc.id] = doc
  index.chunks.push(...chunks)
  persistIndex()

  onProgress?.(100)
  return doc
}

function lexicalScore(chunkContent: string, queryWords: string[]): number {
  const chunkLower = chunkContent.toLowerCase()
  let score = 0
  for (const word of queryWords) {
    score += chunkLower.split(word).length - 1
  }
  return score
}

/**
 * Hybrid retrieval: cosine similarity on embedded chunks blended with
 * normalized lexical keyword score; pure lexical when embeddings are
 * unavailable (Ollama down / model not pulled / legacy index).
 */
export async function queryDocumentsDetailed(queryText: string, topK: number = 5): Promise<RAGQueryResult[]> {
  if (index.chunks.length === 0) return []

  const queryWords = queryText.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  const hasVectors = index.chunks.some((c) => Array.isArray(c.embedding) && c.embedding.length > 0)
  const queryVector = hasVectors ? await embedQuery(queryText) : null

  const lexicalScores = index.chunks.map((chunk) => lexicalScore(chunk.content, queryWords))
  const maxLexical = Math.max(...lexicalScores, 1)

  const scored = index.chunks.map((chunk, i) => {
    const lexical = lexicalScores[i] / maxLexical
    if (queryVector && chunk.embedding && chunk.embedding.length === queryVector.length) {
      // Cosine similarity dominates; keyword hits still nudge exact-term matches up.
      return { chunk, score: 0.7 * cosineSimilarity(queryVector, chunk.embedding) + 0.3 * lexical }
    }
    return { chunk, score: lexical }
  })

  scored.sort((a, b) => b.score - a.score)

  return scored
    .slice(0, topK)
    .filter((s) => s.score > 0)
    .map((s) => ({
      content: s.chunk.content,
      filename: index.documents[s.chunk.documentId]?.filename ?? 'unknown',
      score: Number(s.score.toFixed(4)),
    }))
}

export async function queryDocuments(queryText: string, topK: number = 5): Promise<string[]> {
  return (await queryDocumentsDetailed(queryText, topK)).map((r) => r.content)
}

export async function getRagStatus(): Promise<{
  documentCount: number
  chunkCount: number
  embeddedChunkCount: number
  embeddingModel: string
  embeddingAvailable: boolean
}> {
  return {
    documentCount: Object.keys(index.documents).length,
    chunkCount: index.chunks.length,
    embeddedChunkCount: index.chunks.filter((c) => Array.isArray(c.embedding) && c.embedding.length > 0).length,
    embeddingModel: getEmbeddingModel(),
    embeddingAvailable: await isEmbeddingAvailable(),
  }
}

export function getRagDocumentCount(): number {
  return Object.keys(index.documents).length
}

export function listDocuments(): RAGDocument[] {
  return Object.values(index.documents)
}

export function removeDocument(id: string): void {
  delete index.documents[id]
  index.chunks = index.chunks.filter((c) => c.documentId !== id)
  persistIndex()
}
