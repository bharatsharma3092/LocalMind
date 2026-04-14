import { describe, it, expect } from 'vitest'
import { ok, fail, safeHandle } from './ipc-response'

describe('ok', () => {
  it('returns success response with data', () => {
    const result = ok('hello')
    expect(result).toEqual({ success: true, data: 'hello' })
  })

  it('returns success response with object data', () => {
    const result = ok({ id: 1, name: 'test' })
    expect(result).toEqual({ success: true, data: { id: 1, name: 'test' } })
  })

  it('returns success response with null data', () => {
    const result = ok(null)
    expect(result).toEqual({ success: true, data: null })
  })
})

describe('fail', () => {
  it('returns failure response with error message', () => {
    const result = fail('Something went wrong')
    expect(result).toEqual({ success: false, error: 'Something went wrong' })
  })
})

describe('safeHandle', () => {
  it('wraps successful function in ok response', async () => {
    const handler = safeHandle(async (x: number) => x * 2)
    const result = await handler(5)
    expect(result).toEqual({ success: true, data: 10 })
  })

  it('wraps thrown error in fail response', async () => {
    const handler = safeHandle(async () => {
      throw new Error('Boom!')
    })
    const result = await handler()
    expect(result).toEqual({ success: false, error: 'Boom!' })
  })

  it('handles non-Error throws', async () => {
    const handler = safeHandle(async () => {
      throw 'string error'
    })
    const result = await handler()
    expect(result.success).toBe(false)
    expect(result.error).toBe('Unknown error')
  })

  it('passes all arguments to the wrapped function', async () => {
    const handler = safeHandle(async (a: number, b: number, c: number) => a + b + c)
    const result = await handler(1, 2, 3)
    expect(result).toEqual({ success: true, data: 6 })
  })
})
