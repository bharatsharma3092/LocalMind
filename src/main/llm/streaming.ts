import { v4 as uuid } from 'uuid'
import { BrowserWindow, ipcMain } from 'electron'
import type { LLMStreamChunk, TokenUsage } from './types'

export function createStreamId(): string {
  return uuid()
}

// ── Chunk buffer ───────────────────────────────────────────────────────────────────────────────
// Problem being solved:
//   1. Slow model cold-load (e.g. gemma4:e4b ~34s) means LLM chunks arrive
//      before the renderer’s ipcRenderer.on listeners are registered.
//   2. The previous fix introduced a NEW race: ipc.ts finally{} called
//      clearStreamBuffer() as soon as the LLM stream ended — but the renderer
//      may not have sent llm:ready yet, so the buffer (including ‘done’) was
//      wiped before replay, leaving the renderer stuck forever.
//
// Solution:
//   • Buffer all events as before.
//   • Track whether the stream has FINISHED producing events (‘streamDone’).
//   • clearStreamBuffer() now only removes the buffer if the stream is already
//     done AND ready has already fired (i.e. replay already happened).
//     If ready hasn’t fired yet, it sets a ‘pendingClear’ flag so the
//     llm:ready handler cleans up after replay instead.
//   • ipc.ts finally{} still calls clearStreamBuffer() — it just becomes a
//     no-op when replay hasn’t happened yet, deferring to the ready handler.
//
// FIX (2026-04-11):
//   Pass the BrowserWindow reference directly into initStreamBuffer instead of
//   relying on BrowserWindow.getAllWindows()[0] inside the ready handler.
//   getAllWindows()[0] can return a DIFFERENT window (e.g. a settings popup)
//   causing the replay to send chunks to the wrong webContents and the chat UI
//   to receive nothing.

interface StreamState {
  buffer: BufferedEvent[]
  ready: boolean       // renderer has fired llm:ready
  done: boolean        // LLM stream has finished (done or error emitted)
  pendingClear: boolean // ipc finally ran before ready — clear after replay
  win: BrowserWindow   // the specific window that started the stream
}

interface BufferedEvent {
  type: 'chunk' | 'done' | 'error'
  payload: LLMStreamChunk | TokenUsage | string
}

const streams = new Map<string, StreamState>()

export function initStreamBuffer(streamId: string, win: BrowserWindow): void {
  streams.set(streamId, { buffer: [], ready: false, done: false, pendingClear: false, win })

  // One-time IPC: renderer fires this after all listeners are attached
  ipcMain.once(`llm:ready:${streamId}`, () => {
    const state = streams.get(streamId)
    if (!state) return

    state.ready = true
    const targetWin = state.win  // use the captured window, not getAllWindows()[0]
    if (targetWin && !targetWin.isDestroyed()) {
      for (const evt of state.buffer) {
        if (evt.type === 'chunk') targetWin.webContents.send(`llm:chunk:${streamId}`, evt.payload)
        else if (evt.type === 'done') targetWin.webContents.send(`llm:done:${streamId}`, evt.payload)
        else if (evt.type === 'error') targetWin.webContents.send(`llm:error:${streamId}`, evt.payload)
      }
    }
    state.buffer = []

    // If ipc.ts finally{} already ran, clean up now
    if (state.pendingClear) {
      streams.delete(streamId)
    }
  })
}

/**
 * Called from ipc.ts finally{}.
 * Safe to call at any time — defers cleanup if replay hasn’t happened yet.
 */
export function clearStreamBuffer(streamId: string): void {
  const state = streams.get(streamId)
  if (!state) return

  if (state.ready) {
    // Ready already fired and replay is done — safe to remove immediately
    streams.delete(streamId)
  } else {
    // Renderer hasn’t signalled ready yet — defer cleanup to the ready handler
    state.pendingClear = true
  }
}

// ── Send helpers ───────────────────────────────────────────────────────────────────────────────

export function sendChunk(win: BrowserWindow, streamId: string, chunk: LLMStreamChunk): void {
  const state = streams.get(streamId)
  if (!state) {
    win.webContents.send(`llm:chunk:${streamId}`, chunk)
    return
  }
  if (state.ready) {
    win.webContents.send(`llm:chunk:${streamId}`, chunk)
  } else {
    state.buffer.push({ type: 'chunk', payload: chunk })
  }
}

export function sendDone(win: BrowserWindow, streamId: string, usage: TokenUsage): void {
  const state = streams.get(streamId)
  if (!state) {
    win.webContents.send(`llm:done:${streamId}`, usage)
    return
  }
  state.done = true
  if (state.ready) {
    win.webContents.send(`llm:done:${streamId}`, usage)
  } else {
    state.buffer.push({ type: 'done', payload: usage })
  }
}

export function sendError(win: BrowserWindow, streamId: string, error: string): void {
  const state = streams.get(streamId)
  if (!state) {
    win.webContents.send(`llm:error:${streamId}`, error)
    return
  }
  state.done = true
  if (state.ready) {
    win.webContents.send(`llm:error:${streamId}`, error)
  } else {
    state.buffer.push({ type: 'error', payload: error })
  }
}
