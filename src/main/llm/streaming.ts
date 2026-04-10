import { v4 as uuid } from 'uuid'
import { BrowserWindow } from 'electron'
import type { LLMStreamChunk, TokenUsage } from './types'

export function createStreamId(): string {
  return uuid()
}

export function sendChunk(win: BrowserWindow, streamId: string, chunk: LLMStreamChunk): void {
  win.webContents.send(`llm:chunk:${streamId}`, chunk)
}

export function sendDone(win: BrowserWindow, streamId: string, usage: TokenUsage): void {
  win.webContents.send(`llm:done:${streamId}`, usage)
}

export function sendError(win: BrowserWindow, streamId: string, error: string): void {
  win.webContents.send(`llm:error:${streamId}`, error)
}
