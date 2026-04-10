import { create } from 'zustand'
import { v4 as uuid } from 'uuid'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  message: string
  duration: number
}

interface NotificationStore {
  toasts: Toast[]
  add: (type: ToastType, message: string, duration?: number) => void
  remove: (id: string) => void
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  toasts: [],
  add: (type, message, duration = 4000) => {
    const id = uuid()
    set((s) => ({ toasts: [...s.toasts, { id, type, message, duration }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), duration)
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
