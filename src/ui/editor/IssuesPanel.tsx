import { AlertTriangle, Info } from 'lucide-react'
import { useState } from 'react'
import type { FitSuggestion, ValidationIssue, WordEntry } from '../../core/types'
import { GRID_MAX } from '../../state/settings'
import { currentFit, useStore } from '../../state/store'
import { Dialog } from '../primitives'

interface Action {
  label: string
  run: () => void
}

/** Another shuffle can rescue a near miss (or a failed filler cleanup), but not a big miss. */
const NEAR_MISS = 2

const plural = (n: number) => `${n} ${n === 1 ? 'word' : 'words'}`

interface FitContext {
  fit: FitSuggestion | null
  /** This issue carries the fit suggestion (only the first size-related issue does). */
  showFit: boolean
  trimWords: WordEntry[]
  confirmTrim: () => void
}

function actionsFor(issue: ValidationIssue, ctx: FitContext): Action[] {
  const s = useStore.getState()
  const { gen, failure } = s
  const word = (id?: string) => gen.words.find((w) => w.id === id)
  const remove = (id: string): Action | null => {
    const w = word(id)
    return w ? { label: `Remove ${w.display}`, run: () => s.removeWords([id]) } : null
  }
  const fitAction = (): Action | null => {
    const { fit } = ctx
    if (!ctx.showFit || !fit) return null
    if (fit.kind === 'grow') return { label: `Grid ${fit.rows} × ${fit.cols}`, run: () => s.applyFit() }
    return ctx.trimWords.length ? { label: `Remove ${plural(ctx.trimWords.length)}…`, run: ctx.confirmTrim } : null
  }
  const list: (Action | null)[] = []
  switch (issue.code) {
    case 'contained': {
      const w = word(issue.wordIds[0])
      const host = word(issue.hostId)
      if (w && host && issue.nestable) list.push({ label: `Hide ${w.token} inside ${host.token}`, run: () => s.allowNested(w.token) })
      list.push(remove(issue.wordIds[0]))
      break
    }
    case 'reverse-conflict':
      list.push(...issue.wordIds.slice(0, 2).map(remove))
      list.push({ label: 'No backwards words', run: () => s.setGen({ directions: gen.directions.filter((d) => ['E', 'S', 'SE', 'NE'].includes(d)) }) })
      break
    case 'too-long':
      // Only a verified size; none is offered while other errors block the search.
      list.push(fitAction())
      list.push(remove(issue.wordIds[0]))
      break
    case 'duplicate':
      list.push({ label: 'Remove duplicates', run: () => s.removeWords(issue.wordIds.slice(1)) })
      break
    case 'over-capacity':
      list.push(fitAction())
      if (gen.overlap === 'none') list.push({ label: 'Allow overlaps', run: () => s.setGen({ overlap: 'allow' }) })
      if (failure === 'budget-exhausted' && issue.wordIds.length <= NEAR_MISS) list.push({ label: 'Try again', run: () => s.regenerate() })
      break
    case 'no-directions':
      list.push({ label: 'Use → and ↓', run: () => s.setGen({ directions: ['E', 'S'] }) })
      break
    case 'too-short':
      list.push(remove(issue.wordIds[0]))
      break
    default:
      break
  }
  return list.filter((a): a is Action => !!a)
}

function TrimDialog({ open, fit, words, onClose }: { open: boolean; fit: FitSuggestion | null; words: WordEntry[]; onClose: () => void }) {
  const gen = useStore((s) => s.gen)
  const applyFit = useStore((s) => s.applyFit)
  const resize = fit?.kind === 'trim' && !gen.autoSize && (gen.rows !== fit.rows || gen.cols !== fit.cols)
  const kept = gen.words.length - words.length
  return (
    <Dialog open={open} onClose={onClose} title={`Remove ${plural(words.length)}?`}>
      <div className="space-y-4 p-5">
        <p className="text-sm">
          We couldn’t fit all {plural(gen.words.length)}, even in the largest grid ({GRID_MAX} × {GRID_MAX}). We checked that the other{' '}
          {plural(kept)} fit without {words.length === 1 ? 'this one' : 'these'}.
          {resize && ` The grid will change to ${fit.rows} × ${fit.cols}.`}
        </p>
        <ul aria-label="Words to remove" className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
          {words.map((w) => (
            <li key={w.id} className="rounded-lg border-2 border-ink/15 bg-white px-2 py-0.5 text-sm">
              {w.display}
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              applyFit()
              onClose()
            }}
          >
            Remove {plural(words.length)}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

export function IssuesPanel() {
  const issues = useStore((s) => s.issues).filter((i) => i.code !== 'empty')
  const warnings = useStore((s) => s.warnings)
  const hasDoc = useStore((s) => !!s.doc)
  const fit = useStore(currentFit)
  const words = useStore((s) => s.gen.words)
  // The fit being confirmed; a newer run replaces `fit`, which closes the dialog instead of reusing it.
  const [confirming, setConfirming] = useState<FitSuggestion | null>(null)
  if (issues.length === 0 && warnings.length === 0) return null

  const shown = issues.slice(0, 6)
  const capIndex = shown.findIndex((i) => i.code === 'over-capacity')
  const fitIndex = capIndex >= 0 ? capIndex : shown.findIndex((i) => i.code === 'too-long')
  const trimIds = new Set(fit?.kind === 'trim' ? fit.removeIds : [])
  const trimWords = words.filter((w) => trimIds.has(w.id))
  const ctx = (i: number): FitContext => ({ fit, showFit: i === fitIndex, trimWords, confirmTrim: () => setConfirming(fit) })
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {issues.length > 0 && (
        <div className="rounded-2xl border-2 border-tomato bg-[#fff4f1] p-3.5">
          <p className="mb-2 flex items-center gap-2 font-display font-semibold text-tomato-dark">
            <AlertTriangle size={18} /> {issues.length === 1 ? 'One thing to fix' : `${issues.length} things to fix`}
            {hasDoc && <span className="ml-auto text-xs font-normal text-muted">Showing your last good puzzle</span>}
          </p>
          <ul className="space-y-2.5">
            {shown.map((issue, i) => (
              <li key={i} className="text-sm">
                <p>{issue.message}</p>
                {i === fitIndex && fit?.kind === 'trim' && trimWords.length > 0 && (
                  <p className="mt-1 text-muted">
                    We couldn’t fit all {plural(words.length)}, even in the largest grid ({GRID_MAX} × {GRID_MAX}). We checked that removing{' '}
                    {trimWords.length} of them lets the rest fit.
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {actionsFor(issue, ctx(i)).map((a) => (
                    <button key={a.label} type="button" className="btn btn-sm" onClick={a.run}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
            {issues.length > 6 && <li className="text-sm text-muted">…and {issues.length - 6} more.</li>}
          </ul>
        </div>
      )}
      <TrimDialog open={!!fit && confirming === fit && trimWords.length > 0} fit={fit} words={trimWords} onClose={() => setConfirming(null)} />
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 rounded-2xl border-2 border-sun bg-sun-soft/60 p-3 text-sm">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p className="flex-1">{w.message}</p>
        </div>
      ))}
    </div>
  )
}
