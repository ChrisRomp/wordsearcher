import { PencilLine } from 'lucide-react'
import { useStore } from '../../state/store'
import { CURATED_PACKS, loadThemeWords, toEntry } from '../../words/themes'
import { createRng } from '../../core/rng'

const STARTERS = ['outer-space', 'farm-animals', 'ocean-life', 'autumn']

async function startWith(packId: string) {
  const pack = CURATED_PACKS.find((p) => p.id === packId)
  if (!pack) return
  const { gen, addEntries, setStyle } = useStore.getState()
  const ref = { kind: 'curated' as const, id: packId }
  const words = (await loadThemeWords(ref)).filter((w) => gen.levels.includes(w.level) && w.token.length <= Math.min(gen.rows, gen.cols))
  const pick = createRng(`${packId}|${gen.seed}`).shuffle(words).slice(0, 15)
  addEntries(pick.map((w) => toEntry(w, ref)))
  setStyle({ title: `${pack.name} Word Search` })
}

export function EmptyState() {
  return (
    <div className="mx-auto grid aspect-[8.5/11] max-w-[760px] place-items-center rounded-[3px] bg-white p-8 shadow-[var(--shadow-sheet)]">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-6 grid w-fit grid-cols-5 gap-1" aria-hidden>
          {'HUNTZWORDSFINDQ'.split('').map((ch, i) => (
            <span
              key={i}
              className={`grid size-9 place-items-center rounded-md border-2 font-display text-lg font-semibold ${i >= 5 && i < 9 ? 'border-ink bg-sun-soft' : 'border-ink/15 text-ink/40'}`}
            >
              {ch}
            </span>
          ))}
        </div>
        <h2 className="font-display text-2xl font-semibold">Let’s make a word search</h2>
        <p className="mt-2 text-ink-soft">Add your own words on the left, or start from a ready-made theme:</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {STARTERS.map((id) => {
            const p = CURATED_PACKS.find((x) => x.id === id)
            return p ? (
              <button key={id} type="button" className="btn btn-sm" onClick={() => void startWith(id)}>
                <span aria-hidden>{p.emoji}</span> {p.name}
              </button>
            ) : null
          })}
        </div>
        <button type="button" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-teal hover:underline" onClick={() => document.getElementById('add-words')?.focus()}>
          <PencilLine size={15} /> Type my own words
        </button>
      </div>
    </div>
  )
}
