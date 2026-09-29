import { Link2, Link2Off } from 'lucide-react'
import { useState } from 'react'
import { docDensity } from '../../doc/puzzleDoc'
import { GRID_MAX, GRID_MIN } from '../../state/settings'
import { useStore } from '../../state/store'
import { Section, Stepper, Toggle } from '../primitives'

export function GridSection({ delay }: { delay?: number }) {
  const gen = useStore((s) => s.gen)
  const doc = useStore((s) => s.doc)
  const setGen = useStore((s) => s.setGen)
  const [linked, setLinked] = useState(gen.rows === gen.cols)
  const pct = Math.round(gen.density * 100)
  const fixedSize = !gen.autoSize
  const docCovered = doc ? Math.round(docDensity(doc) * 100) : null

  return (
    <Section step={3} title="Grid" color="var(--color-sun)" delay={delay}>
      <div className="flex flex-wrap items-center gap-3">
        <div className={`flex items-center gap-2 ${gen.autoSize ? 'pointer-events-none opacity-40' : ''}`}>
          <Stepper label="rows" value={gen.rows} min={GRID_MIN} max={GRID_MAX} onChange={(v) => setGen(linked ? { rows: v, cols: v } : { rows: v })} />
          <button
            type="button"
            className="btn btn-ghost p-1.5 text-muted"
            aria-pressed={linked}
            title={linked ? 'Square grid (click to unlink rows and columns)' : 'Link rows and columns'}
            onClick={() => {
              if (!linked) setGen({ cols: gen.rows })
              setLinked(!linked)
            }}
          >
            {linked ? <Link2 size={18} /> : <Link2Off size={18} />}
          </button>
          <Stepper label="columns" value={gen.cols} min={GRID_MIN} max={GRID_MAX} onChange={(v) => setGen(linked ? { rows: v, cols: v } : { cols: v })} />
        </div>
        {gen.autoSize && doc && (
          <span className="font-display text-sm font-semibold text-ink-soft">
            Now {doc.rows} × {doc.cols}
          </span>
        )}
      </div>
      <Toggle checked={gen.autoSize} onChange={(v) => setGen({ autoSize: v })} label="Pick the size for me" hint="Chooses the smallest square grid that fits your words at the fill level below." />

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <label className="label mb-0" htmlFor="density">
            How full
          </label>
          <span className="font-display text-sm font-semibold tabular-nums">
            {fixedSize ? (docCovered !== null ? `${docCovered}% full` : '—') : `aim for ${pct}%`}
          </span>
        </div>
        <input
          id="density"
          type="range"
          min={20}
          max={85}
          step={5}
          value={pct}
          disabled={fixedSize}
          onChange={(e) => setGen({ density: Number(e.target.value) / 100 })}
          className="w-full accent-[var(--color-sun)] disabled:opacity-40"
        />
        <p className="mt-1 text-xs text-muted">
          {fixedSize
            ? 'Your words and grid size set how full the puzzle is. Turn on “Pick the size for me” to aim for a target.'
            : `Share of squares covered by words.${!fixedSize && docCovered !== null ? ` Current puzzle: ${docCovered}%.` : ''} More filler letters make a puzzle harder.`}
        </p>
      </div>
    </Section>
  )
}
