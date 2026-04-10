import { useNotificationStore } from '../../stores/notificationStore'

const icons = { success: '\u2713', error: '\u2717', warning: '\u26a0', info: '\u2139' }
const colors = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  warning: 'bg-amber-500',
  info: 'bg-blue-600',
}

export function ToastContainer() {
  const { toasts, remove } = useNotificationStore()
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg text-white shadow-lg text-sm ${colors[t.type]}`}
        >
          <span>{icons[t.type]}</span>
          <span className="flex-1">{t.message}</span>
          <button onClick={() => remove(t.id)} className="opacity-70 hover:opacity-100">
            \u2717
          </button>
        </div>
      ))}
    </div>
  )
}
