import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Section({
  step,
  title,
  color,
  children,
  aside,
  delay = 0,
}: {
  step: number
  title: string
  color: string
  children: ReactNode
  aside?: ReactNode
  delay?: number
}) {
  return (
    <section className="animate-rise border-b-2 border-dashed border-ink/10 px-5 py-5 last:border-b-0" style={{ animationDelay: `${delay}ms` }}>
      <header className="mb-3.5 flex items-center gap-2.5">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-ink font-display text-sm font-semibold text-white"
          style={{ background: color }}
          aria-hidden
        >
          {step}
        </span>
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        {aside && <div className="ml-auto">{aside}</div>}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className = '',
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  label: string
  className?: string
}) {
  return (
    <div className={`seg ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  hint?: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className={`flex items-start gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full border-2 border-ink transition-colors ${checked ? 'bg-teal' : 'bg-paper'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full border-2 border-ink bg-white transition-transform ${checked ? 'translate-x-4' : ''}`}
        />
      </button>
      <label htmlFor={id} className="cursor-pointer text-[0.95rem] leading-snug">
        <span className="font-semibold">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </label>
    </div>
  )
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto max-h-[88dvh] w-[calc(100%-2rem)] overflow-hidden rounded-[22px] border-2 border-ink bg-paper p-0 text-ink shadow-[6px_8px_0_0_rgb(31_36_48)] ${wide ? 'max-w-4xl' : 'max-w-lg'}`}
    >
      {open && (
        <div className="flex max-h-[88dvh] flex-col">
          <header className="flex items-center gap-3 border-b-2 border-ink bg-white px-5 py-3.5">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <button type="button" className="btn btn-ghost ml-auto -mr-2 p-1.5" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      )}
    </dialog>
  )
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  label: string
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <div className="inline-flex items-center overflow-hidden rounded-xl border-2 border-ink/15 bg-white">
      <button type="button" className="px-2.5 py-1.5 font-display text-lg leading-none hover:bg-ink/5 disabled:opacity-30" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        className="w-11 border-x-2 border-ink/10 py-1.5 text-center font-display font-medium tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number.parseInt(e.target.value, 10)
          if (Number.isFinite(v)) onChange(clamp(v))
        }}
      />
      <button type="button" className="px-2.5 py-1.5 font-display text-lg leading-none hover:bg-ink/5 disabled:opacity-30" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>
        +
      </button>
    </div>
  )
}
