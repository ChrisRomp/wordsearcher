import { ArrowLeft, Check, Search, Shuffle, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { maxWordLength } from '../../core/directions'
import { createRng, randomSeed } from '../../core/rng'
import type { Level } from '../../core/types'
import type { ThemeRef } from '../../state/settings'
import { useStore } from '../../state/store'
import { CURATED_PACKS, loadThemeWords, toEntry, type ThemeInfo, type ThemeWord } from '../../words/themes'
import { Dialog } from '../primitives'

const LEVEL_LABELS: Record<ThemeRef['kind'], Record<Level, string>> = {
  curated: { 1: 'Easy', 2: 'Medium', 3: 'Hard' },
  dict: { 1: 'Common', 2: 'Less common', 3: 'Rare' },
}

const sameRef = (a: ThemeRef, b: ThemeRef) => a.kind === b.kind && a.id === b.id

function ThemeCard({ theme, onOpen, active }: { theme: ThemeInfo; onOpen: () => void; active: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative flex items-center gap-3 rounded-2xl border-2 bg-white p-3 text-left transition-[transform,border-color] hover:-translate-y-0.5 hover:border-ink ${active ? 'border-teal' : 'border-ink/15'}`}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-paper text-2xl" aria-hidden>
        {theme.emoji}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-display font-semibold">{theme.name}</span>
        <span className="block text-xs text-muted">
          {theme.count} words{theme.description ? ` · ${theme.description}` : ''}
        </span>
      </span>
      {active && (
        <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full border-2 border-ink bg-teal text-white" title="Used for auto-fill">
          <Sparkles size={12} />
        </span>
      )}
    </button>
  )
}

function ThemeDetail({ theme, onBack, onDone }: { theme: ThemeInfo; onBack: () => void; onDone: () => void }) {
  const gen = useStore((s) => s.gen)
  const { addEntries, clearWords, toggleTheme, setGen, retitleForTheme } = useStore.getState()
  const [words, setWords] = useState<ThemeWord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [levels, setLevels] = useState<Level[]>(gen.levels)
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [replace, setReplace] = useState(true)
  const listSize = gen.words.length
  const replacing = replace && listSize > 0
  const maxFit = Math.min(gen.maxLen, maxWordLength(gen.rows, gen.cols, gen.directions.length ? gen.directions : ['E']))
  const inList = useMemo(() => new Set(gen.words.map((w) => w.token)), [gen.words])
  const active = gen.themes.some((t) => sameRef(t, theme.ref))

  useEffect(() => {
    let alive = true
    loadThemeWords(theme.ref)
      .then((w) => alive && setWords(w))
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [theme.ref])

  const candidates = useMemo(
    () => (words ?? []).filter((w) => levels.includes(w.level) && w.token.length >= gen.minLen && w.token.length <= maxFit),
    [words, levels, gen.minLen, maxFit],
  )
  // Words already in the list only matter when adding to it; when replacing, the list is cleared first.
  const visible = useMemo(() => (replacing ? candidates : candidates.filter((w) => !inList.has(w.token))), [candidates, replacing, inList])
  const suggested = Math.max(5, Math.min(visible.length, Math.round((gen.rows * gen.cols * gen.density) / 6.5)))

  useEffect(() => {
    if (!words) return
    const rng = createRng(`${theme.ref.id}|${randomSeed()}`)
    setSelected(new Set(rng.shuffle([...visible]).slice(0, suggested).map((w) => w.token)))
    // Re-pick when the filters change, but keep the picks when toggling "replace".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates])

  const chosen = visible.filter((w) => selected?.has(w.token))
  const toggle = (token: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(token)) next.delete(token)
      else next.add(token)
      return next
    })

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b-2 border-ink/10 bg-white/60 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <button type="button" className="btn btn-sm" onClick={onBack}>
            <ArrowLeft size={15} /> All themes
          </button>
          <span className="text-2xl" aria-hidden>
            {theme.emoji}
          </span>
          <h3 className="font-display text-lg font-semibold">{theme.name}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-ink-soft">{theme.ref.kind === 'curated' ? 'Reading level' : 'How common'}:</span>
          {([1, 2, 3] as Level[]).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={levels.includes(l)}
              onClick={() => setLevels((ls) => (ls.includes(l) ? (ls.length > 1 ? ls.filter((x) => x !== l) : ls) : [...ls, l].sort()))}
              className={`rounded-full border-2 px-2.5 py-0.5 font-semibold transition-colors ${levels.includes(l) ? 'border-ink bg-sun-soft' : 'border-ink/15 bg-white text-muted'}`}
            >
              {LEVEL_LABELS[theme.ref.kind][l]}
            </button>
          ))}
          <span className="ml-auto text-muted">
            {gen.minLen}–{maxFit} letters fit your grid
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {error && <p className="text-tomato-dark">{error}</p>}
        {!words && !error && <p className="animate-pulse text-muted">Loading words…</p>}
        {words && visible.length === 0 && <p className="text-muted">No words match these filters.</p>}
        {words && visible.length > 0 && (
          <>
            <div className="mb-3 flex items-center gap-3 text-sm">
              <span className="font-semibold">
                {chosen.length} of {visible.length} selected
              </span>
              <button type="button" className="font-semibold text-sky hover:underline" onClick={() => setSelected(new Set(visible.map((w) => w.token)))}>
                All
              </button>
              <button type="button" className="font-semibold text-sky hover:underline" onClick={() => setSelected(new Set())}>
                None
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 font-semibold text-sky hover:underline"
                onClick={() => {
                  const rng = createRng(randomSeed())
                  setSelected(new Set(rng.shuffle([...visible]).slice(0, suggested).map((w) => w.token)))
                }}
              >
                <Shuffle size={13} /> Pick {suggested} for me
              </button>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {visible.map((w) => {
                const on = selected?.has(w.token) ?? false
                return (
                  <li key={w.token}>
                    <button
                      type="button"
                      aria-pressed={on}
                      title={w.clue}
                      onClick={() => toggle(w.token)}
                      className={`inline-flex items-center gap-1 rounded-full border-2 px-2.5 py-1 text-sm font-semibold transition-colors ${on ? 'border-ink bg-teal-soft' : 'border-ink/10 bg-white text-muted hover:border-ink/40'}`}
                    >
                      {on && <Check size={13} strokeWidth={3} />}
                      {w.display}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t-2 border-ink/10 bg-white px-5 py-3">
        <button
          type="button"
          className={`btn btn-sm ${active ? 'btn-teal' : ''}`}
          onClick={() => {
            toggleTheme(theme.ref, !active)
            if (!active) {
              setGen({ autoFill: true })
              // The theme is the whole puzzle when there are no other words.
              if (listSize === 0) retitleForTheme(theme.name)
            }
          }}
          title="Fill leftover space with random words from this theme each time you regenerate"
        >
          <Sparkles size={14} /> {active ? 'Using for auto-fill' : 'Use for auto-fill'}
        </button>
        <span className="flex-1" />
        {listSize > 0 && (
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink-soft select-none">
            <input
              type="checkbox"
              className="size-4 cursor-pointer accent-[var(--color-tomato)]"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />
            Replace my current list ({listSize} {listSize === 1 ? 'word' : 'words'})
          </label>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={chosen.length === 0}
          onClick={() => {
            if (replacing) clearWords()
            addEntries(chosen.map((w) => toEntry(w, theme.ref)))
            retitleForTheme(theme.name)
            onDone()
          }}
        >
          {replacing ? `Replace list with ${chosen.length} words` : `Add ${chosen.length} words to my list`}
        </button>
      </footer>
    </div>
  )
}

export function ThemeBrowser({ open, onClose, themes }: { open: boolean; onClose: () => void; themes: ThemeInfo[] }) {
  const [tab, setTab] = useState<ThemeRef['kind']>('curated')
  const [query, setQuery] = useState('')
  const [openTheme, setOpenTheme] = useState<ThemeInfo | null>(null)
  const activeThemes = useStore((s) => s.gen.themes)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = themes.filter((t) => t.ref.kind === tab)
    if (!q) return list
    return list.filter((t) => {
      if (t.name.toLowerCase().includes(q) || t.group.toLowerCase().includes(q)) return true
      if (t.keywords?.some((k) => k.toLowerCase().includes(q))) return true
      if (t.ref.kind === 'curated') return CURATED_PACKS.find((p) => p.id === t.ref.id)?.words.some((w) => w.w.toLowerCase().includes(q))
      return false
    })
  }, [themes, tab, query])

  const groups = useMemo(() => {
    const m = new Map<string, ThemeInfo[]>()
    for (const t of filtered) m.set(t.group, [...(m.get(t.group) ?? []), t])
    return [...m.entries()]
  }, [filtered])

  const hasDict = themes.some((t) => t.ref.kind === 'dict')
  const close = () => {
    setOpenTheme(null)
    onClose()
  }

  return (
    <Dialog open={open} onClose={close} title="Pick a theme" wide>
      <div className="h-[70dvh]">
        {openTheme ? (
          <ThemeDetail theme={openTheme} onBack={() => setOpenTheme(null)} onDone={close} />
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-3 border-b-2 border-ink/10 bg-white/60 px-5 py-3.5">
              <div className="seg" role="tablist" aria-label="Word sources">
                <button type="button" role="tab" aria-selected={tab === 'curated'} aria-pressed={tab === 'curated'} onClick={() => setTab('curated')}>
                  Theme packs
                </button>
                <button type="button" role="tab" aria-selected={tab === 'dict'} aria-pressed={tab === 'dict'} onClick={() => setTab('dict')} disabled={!hasDict}>
                  Kinds of…
                </button>
              </div>
              <label className="relative min-w-48 flex-1">
                <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                <span className="sr-only">Search themes</span>
                <input className="field py-1.5 pl-9" placeholder={tab === 'curated' ? 'Search themes or words, e.g. “shark”' : 'Search lists, e.g. “dog”'} value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {tab === 'dict' && (
                <p className="mb-4 rounded-xl bg-sky-soft/60 px-3 py-2 text-sm text-ink-soft">
                  Big word lists from an English dictionary (Open English WordNet), grouped by “kind of thing.” Filtered for kids, but review the words before printing.
                </p>
              )}
              {groups.length === 0 && <p className="text-muted">Nothing matches “{query}”.</p>}
              {groups.map(([group, list]) => (
                <div key={group} className="mb-5">
                  <h3 className="mb-2 font-display text-sm font-semibold tracking-wide text-muted uppercase">{group}</h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((t) => (
                      <ThemeCard key={t.ref.id} theme={t} onOpen={() => setOpenTheme(t)} active={activeThemes.some((a) => sameRef(a, t.ref))} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
