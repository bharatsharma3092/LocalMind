import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { v4 as uuid } from 'uuid'

export interface RAGDocument {
  id: string
  filename: string
  contentHash: string
  chunkCount: number
  createdAt: number
}

export interface RAGChunk {
  id: string
  documentId: string
  content: string
  chunkIndex: number
}

interface RAGIndex {
  documents: Record<string, RAGDocument>
  chunks: RAGChunk[]
}

const INDEX_FILE = 'rag-index.json'

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

  index.documents[doc.id] = doc
  index.chunks.push(...chunks)
  persistIndex()

  onProgress?.(100)
  return doc
}

export async function queryDocuments(queryText: string, topK: number = 5): Promise<string[]> {
  const queryLower = queryText.toLowerCase()
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2)

  const scored = index.chunks.map((chunk) => {
    const chunkLower = chunk.content.toLowerCase()
    let score = 0
    for (const word of queryWords) {
      const matches = chunkLower.split(word).length - 1
      score += matches
    }
    return { chunk, score }
  })

  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, topK).filter((s) => s.score > 0).map((s) => s.chunk.content)
}

export function getRagStatus(): { documentCount: number; chunkCount: number } {
  return {
    documentCount: Object.keys(index.documents).length,
    chunkCount: index.chunks.length,
  }
}

export function listDocuments(): RAGDocument[] {
  return Object.values(index.documents)
}

export function removeDocument(id: string): void {
  delete index.documents[id]
  index.chunks = index.chunks.filter((c) => c.documentId !== id)
  persistIndex()
}
