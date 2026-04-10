export type { IPCResponse } from '@shared/types/localmind-api'
import type { IPCResponse } from '@shared/types/localmind-api'

export function ok<T>(data: T): IPCResponse<T> {
  return { success: true, data }
}

export function fail(error: string): IPCResponse {
  return { success: false, error }
}

export function safeHandle<T>(fn: (...args: any[]) => Promise<T>) {
  return async (...args: any[]): Promise<IPCResponse<T>> => {
    try {
      const data = await fn(...args)
      return ok(data)
    } catch (err: any) {
      return fail(err.message ?? 'Unknown error')
    }
  }
}
