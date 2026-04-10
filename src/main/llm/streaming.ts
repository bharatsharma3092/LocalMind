import { v4 as uuid } from 'uuid'
import { BrowserWindow, ipcMain } from 'electron'
import type { LLMStreamChunk, TokenUsage } from './types'

export function createStreamId(): string {
  return uuid()
}

// ── Chunk buffer ──────────────────────────────────────────────────────────────
// When a model is cold-loading (e.g. gemma4:e4b takes ~34s to start), the LLM
// stream can produce chunks BEFORE the renderer has had a chance to register its
// ipcRenderer.on listeners.  We buffer every event per-stream and replay them
// as soon as the renderer signals it is ready via 'llm:ready:<streamId>'.

interface BufferedEvent {
  type: 'chunk' | 'done' | 'error'
  payload: LLMStreamChunk | TokenUsage | string
}

const streamBuffers = new Map<string, BufferedEvent[]>()
const readyStreams = new Set<string>()

export function initStreamBuffer(streamId: string): void {
  streamBuffers.set(streamId, [])
  readyStreams.delete(streamId)

  // One-time IPC: renderer calls this once its listeners are attached
  ipcMain.once(`llm:ready:${streamId}`, (_event, _sid: string) => {
    readyStreams.add(streamId)
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    const buffered = streamBuffers.get(streamId) ?? []
    for (const evt of buffered) {
      if (evt.type === 'chunk') win.webContents.send(`llm:chunk:${streamId}`, evt.payload)
      else if (evt.type === 'done') win.webContents.send(`llm:done:${streamId}`, evt.payload)
      else if (evt.type === 'error') win.webContents.send(`llm:error:${streamId}`, evt.payload)
    }
    streamBuffers.delete(streamId)
  })
}

export function clearStreamBuffer(streamId: string): void {
  streamBuffers.delete(streamId)
  readyStreams.delete(streamId)
}

// ── Send helpers ──────────────────────────────────────────────────────────────

export function sendChunk(win: BrowserWindow, streamId: string, chunk: LLMStreamChunk): void {
  if (readyStreams.has(streamId)) {
    win.webContents.send(`llm:chunk:${streamId}`, chunk)
  } else {
    const buf = streamBuffers.get(streamId)
    if (buf) buf.push({ type: 'chunk', payload: chunk })
    else win.webContents.send(`llm:chunk:${streamId}`, chunk) // fallback: no buffer registered
  }
}

export function sendDone(win: BrowserWindow, streamId: string, usage: TokenUsage): void {
  if (readyStreams.has(streamId)) {
    win.webContents.send(`llm:done:${streamId}`, usage)
  } else {
    const buf = streamBuffers.get(streamId)
    if (buf) buf.push({ type: 'done', payload: usage })
    else win.webContents.send(`llm:done:${streamId}`, usage)
  }
}

export function sendError(win: BrowserWindow, streamId: string, error: string): void {
  if (readyStreams.has(streamId)) {
    win.webContents.send(`llm:error:${streamId}`, error)
  } else {
    const buf = streamBuffers.get(streamId)
    if (buf) buf.push({ type: 'error', payload: error })
    else win.webContents.send(`llm:error:${streamId}`, error)
  }
}
