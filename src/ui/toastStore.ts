import { create } from 'zustand'

export interface ToastAction {
  label: string
  run: () => void
}

interface Toast {
  id: number
  text: string
  tone: 'ok' | 'error'
  action?: ToastAction
}

interface ToastState {
  toasts: Toast[]
  push(text: string, tone?: Toast['tone'], action?: ToastAction): void
  dismiss(id: number): void
}

let n = 0
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push(text, tone = 'ok', action) {
    const id = ++n
    set((s) => ({ toasts: [...s.toasts, { id, text, tone, action }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), action ? 10_000 : 3800)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = (text: string, tone?: Toast['tone'], action?: ToastAction) => useToasts.getState().push(text, tone, action)
