import { create } from 'zustand'
import { CheckCircle2, AlertTriangle } from 'lucide-react'

interface Toast {
  id: number
  text: string
  tone: 'ok' | 'error'
}

interface ToastState {
  toasts: Toast[]
  push(text: string, tone?: Toast['tone']): void
}

let n = 0
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push(text, tone = 'ok') {
    const id = ++n
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3800)
  },
}))

export const toast = (text: string, tone?: Toast['tone']) => useToasts.getState().push(text, tone)

export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="animate-rise flex items-center gap-2 rounded-xl border-2 border-ink bg-white px-4 py-2.5 font-semibold shadow-[3px_4px_0_0_rgb(31_36_48)]">
          {t.tone === 'ok' ? <CheckCircle2 size={18} className="text-teal" /> : <AlertTriangle size={18} className="text-tomato" />}
          {t.text}
        </div>
      ))}
    </div>
  )
}
