import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSend, mockIpcMainOnce } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockIpcMainOnce: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: undefined,
  ipcMain: { once: mockIpcMainOnce },
}))

vi.mock('uuid', () => ({ v4: () => 'test-stream-id' }))

import { initStreamBuffer, clearStreamBuffer, sendChunk, sendDone, sendError } from './streaming'

function createMockWin() {
  return { webContents: { send: mockSend }, isDestroyed: () => false } as any
}

describe('streaming buffer', () => {
  let mockWin: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockWin = createMockWin()
  })

  it('initStreamBuffer registers a ready listener', () => {
    initStreamBuffer('stream-1', mockWin)
    expect(mockIpcMainOnce).toHaveBeenCalledWith('llm:ready:stream-1', expect.any(Function))
  })

  it('sendChunk sends directly when ready', () => {
    initStreamBuffer('stream-2', mockWin)

    const readyCallback = mockIpcMainOnce.mock.calls.find(
      (c: any[]) => c[0] === 'llm:ready:stream-2'
    )?.[1]
    if (readyCallback) readyCallback()

    sendChunk(mockWin, 'stream-2', { type: 'text', content: 'hello' })
    expect(mockSend).toHaveBeenCalledWith('llm:chunk:stream-2', { type: 'text', content: 'hello' })
  })

  it('sendChunk buffers when not ready', () => {
    initStreamBuffer('stream-3', mockWin)
    sendChunk(mockWin, 'stream-3', { type: 'text', content: 'buffered' })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('sendDone sends directly when ready', () => {
    initStreamBuffer('stream-4', mockWin)

    const readyCallback = mockIpcMainOnce.mock.calls.find(
      (c: any[]) => c[0] === 'llm:ready:stream-4'
    )?.[1]
    if (readyCallback) readyCallback()

    sendDone(mockWin, 'stream-4', { promptTokens: 10, completionTokens: 5 })
    expect(mockSend).toHaveBeenCalledWith('llm:done:stream-4', { promptTokens: 10, completionTokens: 5 })
  })

  it('sendDone buffers when not ready', () => {
    initStreamBuffer('stream-5', mockWin)
    sendDone(mockWin, 'stream-5', { promptTokens: 10, completionTokens: 5 })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('sendError buffers error when not ready', () => {
    initStreamBuffer('stream-6', mockWin)
    sendError(mockWin, 'stream-6', 'Something failed')
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('clearStreamBuffer removes stream when ready', () => {
    initStreamBuffer('stream-7', mockWin)

    const readyCallback = mockIpcMainOnce.mock.calls.find(
      (c: any[]) => c[0] === 'llm:ready:stream-7'
    )?.[1]
    if (readyCallback) readyCallback()

    clearStreamBuffer('stream-7')
  })

  it('clearStreamBuffer defers removal when not ready', () => {
    initStreamBuffer('stream-8', mockWin)
    clearStreamBuffer('stream-8')
  })

  it('replays buffered chunks on ready', () => {
    initStreamBuffer('stream-9', mockWin)
    sendChunk(mockWin, 'stream-9', { type: 'text', content: 'chunk1' })
    sendChunk(mockWin, 'stream-9', { type: 'text', content: 'chunk2' })

    const readyCallback = mockIpcMainOnce.mock.calls.find(
      (c: any[]) => c[0] === 'llm:ready:stream-9'
    )?.[1]
    expect(readyCallback).toBeDefined()
    readyCallback!()

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockSend).toHaveBeenCalledWith('llm:chunk:stream-9', { type: 'text', content: 'chunk1' })
    expect(mockSend).toHaveBeenCalledWith('llm:chunk:stream-9', { type: 'text', content: 'chunk2' })
  })

  it('sends done after buffered chunks on replay', () => {
    initStreamBuffer('stream-10', mockWin)
    sendChunk(mockWin, 'stream-10', { type: 'text', content: 'hello' })
    sendDone(mockWin, 'stream-10', { promptTokens: 5, completionTokens: 3 })

    const readyCallback = mockIpcMainOnce.mock.calls.find(
      (c: any[]) => c[0] === 'llm:ready:stream-10'
    )?.[1]
    readyCallback!()

    expect(mockSend).toHaveBeenCalledWith('llm:chunk:stream-10', { type: 'text', content: 'hello' })
    expect(mockSend).toHaveBeenCalledWith('llm:done:stream-10', { promptTokens: 5, completionTokens: 3 })
  })

  it('sendError sends directly when ready', () => {
    initStreamBuffer('stream-11', mockWin)

    const readyCallback = mockIpcMainOnce.mock.calls.find(
      (c: any[]) => c[0] === 'llm:ready:stream-11'
    )?.[1]
    if (readyCallback) readyCallback()

    sendError(mockWin, 'stream-11', 'Error occurred')
    expect(mockSend).toHaveBeenCalledWith('llm:error:stream-11', 'Error occurred')
  })
})
