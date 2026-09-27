import { ALL_DIRECTIONS, DIRECTIONS } from '../../core/directions'
import { PRESETS, type PresetId } from '../../core/presets'
import type { DirectionId, FillerMode, OverlapPolicy } from '../../core/types'
import { currentPreset, useStore } from '../../state/store'
import { Section, Segmented } from '../primitives'

/** 3×3 compass: center is empty, each neighbor toggles the direction pointing that way. */
const PAD: (DirectionId | null)[] = ['NW', 'N', 'NE', 'W', null, 'E', 'SW', 'S', 'SE']
const ARROW_ROTATION: Record<DirectionId, number> = { E: 0, SE: 45, S: 90, SW: 135, W: 180, NW: 225, N: 270, NE: 315 }

function DirectionPad() {
  const dirs = useStore((s) => s.gen.directions)
  const setGen = useStore((s) => s.setGen)
  const toggle = (d: DirectionId) => setGen({ directions: dirs.includes(d) ? dirs.filter((x) => x !== d) : ALL_DIRECTIONS.filter((x) => x === d || dirs.includes(x)) })
  return (
    <div className="flex items-center gap-4">
      <div className="grid grid-cols-3 gap-1 rounded-2xl border-2 border-ink/15 bg-paper p-1.5" role="group" aria-label="Word directions">
        {PAD.map((d, i) =>
          d ? (
            <button
              key={d}
              type="button"
              aria-pressed={dirs.includes(d)}
              aria-label={DIRECTIONS[d].label}
              title={DIRECTIONS[d].label}
              onClick={() => toggle(d)}
              className={`grid size-9 place-items-center rounded-lg border-2 transition-colors ${dirs.includes(d) ? 'border-ink bg-sky text-white' : 'border-transparent bg-white text-ink/25 hover:text-ink/60'}`}
            >
              <svg viewBox="0 0 20 20" className="size-5" style={{ transform: `rotate(${ARROW_ROTATION[d]}deg)` }} aria-hidden>
                <path d="M3 10h12M10 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <span key={i} className="grid size-9 place-items-center font-display text-sm font-semibold text-ink-soft" aria-hidden>
              {dirs.length}
            </span>
          ),
        )}
      </div>
      <div className="flex flex-col items-start gap-1.5 text-sm">
        <button type="button" className="btn btn-sm" onClick={() => setGen({ directions: ['E', 'S'] })}>
          → ↓ only
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setGen({ directions: ['E', 'S', 'SE', 'NE'] })}>
          Forwards
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setGen({ directions: [...ALL_DIRECTIONS] })}>
          All 8
        </button>
      </div>
    </div>
  )
}

const OVERLAP_HINT: Record<OverlapPolicy, string> = {
  none: 'Words never share letters.',
  allow: 'Words can cross and share a letter.',
  prefer: 'Words cross a lot, which makes them harder to spot.',
}

const FILLER_HINT: Record<FillerMode, string> = {
  random: 'Any letter A–Z. Words stand out more.',
  frequency: 'Common English letters, so words blend in.',
  decoy: 'Letters and pieces of your words, so there are lots of near-misses.',
}

export function DifficultySection({ delay }: { delay?: number }) {
  const gen = useStore((s) => s.gen)
  const setGen = useStore((s) => s.setGen)
  const applyPreset = useStore((s) => s.applyPreset)
  const preset = currentPreset(gen)
  return (
    <Section step={2} title="Difficulty" color="var(--color-sky)" delay={delay}>
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Difficulty preset"
            value={preset}
            onChange={(v) => v !== 'custom' && applyPreset(v as PresetId)}
            options={[
              ...(Object.keys(PRESETS) as PresetId[]).map((id) => ({ value: id as PresetId | 'custom', label: PRESETS[id].label, title: PRESETS[id].blurb })),
            ]}
          />
          {preset === 'custom' && <span className="rounded-full bg-sun-soft px-2.5 py-0.5 font-display text-sm font-semibold">Custom</span>}
        </div>
        <p className="mt-1.5 text-sm text-muted">{preset === 'custom' ? 'You’ve tweaked the settings below. Pick a preset to reset them.' : PRESETS[preset].blurb}.</p>
      </div>

      <div>
        <span className="label">Directions</span>
        <DirectionPad />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="label">Overlap</span>
          <Segmented
            label="Overlap"
            value={gen.overlap}
            onChange={(v) => setGen({ overlap: v })}
            options={[
              { value: 'none', label: 'None' },
              { value: 'allow', label: 'Some' },
              { value: 'prefer', label: 'Lots' },
            ]}
          />
          <p className="mt-1.5 text-xs text-muted">{OVERLAP_HINT[gen.overlap]}</p>
        </div>
        <div>
          <span className="label">Filler letters</span>
          <Segmented
            label="Filler letters"
            value={gen.filler}
            onChange={(v) => setGen({ filler: v })}
            options={[
              { value: 'random', label: 'Random' },
              { value: 'frequency', label: 'Natural' },
              { value: 'decoy', label: 'Tricky' },
            ]}
          />
          <p className="mt-1.5 text-xs text-muted">{FILLER_HINT[gen.filler]}</p>
        </div>
      </div>
    </Section>
  )
}
