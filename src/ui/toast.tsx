import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useToasts } from './toastStore'

export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="animate-rise flex items-center gap-2 rounded-xl border-2 border-ink bg-white px-4 py-2.5 font-semibold shadow-[3px_4px_0_0_rgb(31_36_48)]">
          {t.tone === 'ok' ? <CheckCircle2 size={18} className="text-teal" /> : <AlertTriangle size={18} className="text-tomato" />}
          {t.text}
          {t.action && (
            <button
              type="button"
              className="btn btn-sm pointer-events-auto ml-2"
              onClick={() => {
                t.action!.run()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
