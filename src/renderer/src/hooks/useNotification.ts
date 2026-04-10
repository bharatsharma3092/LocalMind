import { useNotificationStore } from '../stores/notificationStore'

export function useNotification() {
  const add = useNotificationStore((s) => s.add)
  return {
    success: (msg: string) => add('success', msg),
    error: (msg: string) => add('error', msg),
    warning: (msg: string) => add('warning', msg),
    info: (msg: string) => add('info', msg),
  }
}
