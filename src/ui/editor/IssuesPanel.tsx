import { AlertTriangle, Info } from 'lucide-react'
import { maxWordLength } from '../../core/directions'
import type { ValidationIssue } from '../../core/types'
import { GRID_MAX } from '../../state/settings'
import { useStore } from '../../state/store'

interface Action {
  label: string
  run: () => void
}

function actionsFor(issue: ValidationIssue): Action[] {
  const s = useStore.getState()
  const { gen } = s
  const word = (id?: string) => gen.words.find((w) => w.id === id)
  const remove = (id: string): Action | null => {
    const w = word(id)
    return w ? { label: `Remove ${w.display}`, run: () => s.removeWords([id]) } : null
  }
  const bigger = (need?: number): Action | null => {
    const target = Math.min(GRID_MAX, Math.max(need ?? 0, Math.max(gen.rows, gen.cols) + 3))
    if (gen.rows >= GRID_MAX && gen.cols >= GRID_MAX) return null
    return { label: `Grid ${target} × ${target}`, run: () => s.setGen({ rows: target, cols: target, autoSize: false }) }
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
    case 'too-long': {
      const w = word(issue.wordIds[0])
      if (w && w.token.length <= GRID_MAX) {
        const fitsNow = maxWordLength(GRID_MAX, GRID_MAX, gen.directions)
        if (w.token.length <= fitsNow) list.push(bigger(w.token.length))
      }
      list.push(remove(issue.wordIds[0]))
      break
    }
    case 'duplicate':
      list.push({ label: 'Remove duplicates', run: () => s.removeWords(issue.wordIds.slice(1)) })
      break
    case 'over-capacity':
      list.push(bigger())
      if (gen.overlap === 'none') list.push({ label: 'Allow overlaps', run: () => s.setGen({ overlap: 'allow' }) })
      if (issue.severity === 'error') list.push({ label: 'Try again', run: () => s.regenerate() })
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

export function IssuesPanel() {
  const issues = useStore((s) => s.issues).filter((i) => i.code !== 'empty')
  const warnings = useStore((s) => s.warnings)
  const hasDoc = useStore((s) => !!s.doc)
  if (issues.length === 0 && warnings.length === 0) return null
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {issues.length > 0 && (
        <div className="rounded-2xl border-2 border-tomato bg-[#fff4f1] p-3.5">
          <p className="mb-2 flex items-center gap-2 font-display font-semibold text-tomato-dark">
            <AlertTriangle size={18} /> {issues.length === 1 ? 'One thing to fix' : `${issues.length} things to fix`}
            {hasDoc && <span className="ml-auto text-xs font-normal text-muted">Showing your last good puzzle</span>}
          </p>
          <ul className="space-y-2.5">
            {issues.slice(0, 6).map((issue, i) => (
              <li key={i} className="text-sm">
                <p>{issue.message}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {actionsFor(issue).map((a) => (
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
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 rounded-2xl border-2 border-sun bg-sun-soft/60 p-3 text-sm">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p className="flex-1">{w.message}</p>
        </div>
      ))}
    </div>
  )
}
