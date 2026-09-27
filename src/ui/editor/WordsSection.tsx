import { BookOpen, Pin, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { normalizeWord } from '../../core/normalize'
import type { WordEntry } from '../../core/types'
import { useStore } from '../../state/store'
import { curatedThemes, dictThemes, themeName, type ThemeInfo } from '../../words/themes'
import { Dialog, Section, Stepper, Toggle } from '../primitives'
import { ThemeBrowser } from './ThemeBrowser'

const SOURCE_STYLE: Record<WordEntry['source'], string> = {
  custom: 'bg-white',
  curated: 'bg-teal-soft',
  dict: 'bg-sky-soft',
}

export function useAllThemes(): ThemeInfo[] {
  const [dict, setDict] = useState<ThemeInfo[]>([])
  useEffect(() => {
    let alive = true
    dictThemes().then((t) => alive && setDict(t))
    return () => {
      alive = false
    }
  }, [])
  return useMemo(() => [...curatedThemes(), ...dict], [dict])
}

function WordEditDialog({ word, onClose }: { word: WordEntry | null; onClose: () => void }) {
  const updateWord = useStore((s) => s.updateWord)
  const removeWords = useStore((s) => s.removeWords)
  const [display, setDisplay] = useState(word?.display ?? '')
  const [clue, setClue] = useState(word?.clue ?? '')
  const n = normalizeWord(display)
  return (
    <Dialog open={!!word} onClose={onClose} title="Edit word">
      {word && (
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (n.error) return
            updateWord(word.id, display !== word.display ? { display, clue } : { clue })
            onClose()
          }}
        >
          <div>
            <label className="label" htmlFor="edit-word">
              Word
            </label>
            <input id="edit-word" className="field font-display text-lg" value={display} maxLength={60} onChange={(e) => setDisplay(e.target.value)} autoFocus />
            <p className={`mt-1.5 text-sm ${n.error ? 'text-tomato-dark' : 'text-muted'}`}>
              {n.error ?? (
                <>
                  In the grid: <span className="font-display font-semibold tracking-[0.2em] text-ink">{n.token}</span>
                </>
              )}
            </p>
          </div>
          <div>
            <label className="label" htmlFor="edit-clue">
              Clue <span className="normal-case tracking-normal text-muted">(used in clue mode)</span>
            </label>
            <textarea
              id="edit-clue"
              className="field min-h-20"
              value={clue}
              maxLength={200}
              placeholder="e.g. A glowing ball of gas in the night sky"
              onChange={(e) => setClue(e.target.value)}
            />
            {clue && n.token && clue.toUpperCase().replace(/[^A-Z]/g, '').includes(n.token) && (
              <p className="mt-1 text-sm text-tomato-dark">Heads up: this clue gives away the answer.</p>
            )}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              className="btn btn-ghost text-tomato-dark"
              onClick={() => {
                removeWords([word.id])
                onClose()
              }}
            >
              <Trash2 size={16} /> Remove
            </button>
            <button type="button" className="btn ml-auto" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!!n.error}>
              Save
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

export function WordsSection({ delay }: { delay?: number }) {
  const gen = useStore((s) => s.gen)
  const doc = useStore((s) => s.doc)
  const issues = useStore((s) => s.issues)
  const inputErrors = useStore((s) => s.inputErrors)
  const clueMode = useStore((s) => s.style.clueMode)
  const { addWordsFromText, removeWords, clearWords, dismissInputErrors, setGen, toggleTheme, pinPoolWords } = useStore.getState()
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<WordEntry | null>(null)
  const [browser, setBrowser] = useState(false)
  const themes = useAllThemes()

  const flagged = useMemo(() => new Set(issues.flatMap((i) => i.wordIds)), [issues])
  const poolCount = doc?.placements.filter((p) => p.fromPool).length ?? 0

  const submit = () => {
    if (!text.trim()) return
    addWordsFromText(text)
    setText('')
  }

  return (
    <Section
      step={1}
      title="Words"
      color="var(--color-teal)"
      delay={delay}
      aside={
        <button type="button" className="btn btn-sm btn-sun" onClick={() => setBrowser(true)}>
          <BookOpen size={15} /> Themes
        </button>
      }
    >
      <div>
        <label className="label" htmlFor="add-words">
          Add words
        </label>
        <div className="flex gap-2">
          <textarea
            id="add-words"
            rows={1}
            className="field min-h-[2.75rem] resize-y"
            placeholder="Type or paste words…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
          />
          <button type="button" className="btn btn-primary self-start" onClick={submit} disabled={!text.trim()}>
            <Plus size={17} /> Add
          </button>
        </div>
        <p className="mt-1.5 text-xs text-muted">Separate words with commas or new lines (Shift+Enter). “Black Hole” stays one word.</p>
        {inputErrors.length > 0 && (
          <div className="mt-2 rounded-xl border-2 border-tomato/40 bg-tomato/5 p-2.5 text-sm" role="alert">
            <div className="flex items-start gap-2">
              <ul className="flex-1 space-y-0.5">
                {inputErrors.map((e) => (
                  <li key={e.text}>
                    <span className="font-semibold">“{e.text}”</span> — {e.error}
                  </li>
                ))}
              </ul>
              <button type="button" className="text-muted hover:text-ink" onClick={dismissInputErrors} aria-label="Dismiss">
                <X size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center">
          <span className="label mb-0">Your list ({gen.words.length})</span>
          {gen.words.length > 0 && (
            <button
              type="button"
              className="ml-auto text-sm font-semibold text-muted underline-offset-2 hover:text-tomato-dark hover:underline"
              onClick={() => confirm('Remove all words from your list?') && clearWords()}
            >
              Clear all
            </button>
          )}
        </div>
        {gen.words.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-ink/15 px-4 py-5 text-center text-sm text-muted">
            No words yet. Add your own, or pick a <button type="button" className="font-semibold text-teal underline underline-offset-2" onClick={() => setBrowser(true)}>theme</button>.
          </div>
        ) : (
          <ul className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto pr-1" aria-label="Words in your list">
            {gen.words.map((w) => (
              <li key={w.id} className="animate-pop">
                <span
                  className={`group inline-flex items-center rounded-full border-2 text-sm font-semibold ${flagged.has(w.id) ? 'border-tomato bg-tomato/10' : `border-ink/15 ${SOURCE_STYLE[w.source]}`}`}
                >
                  <button type="button" className="py-1 pr-1 pl-3 hover:underline" onClick={() => setEditing(w)} title={w.clue ? `Clue: ${w.clue}` : 'Click to edit'}>
                    {w.display}
                    {clueMode && !w.clue && <span className="ml-1 text-tomato-dark" title="Needs a clue">•</span>}
                  </button>
                  <button type="button" className="rounded-full p-1 pr-2 text-muted hover:text-tomato-dark" onClick={() => removeWords([w.id])} aria-label={`Remove ${w.display}`}>
                    <X size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border-2 border-ink/10 bg-paper/70 p-3.5">
        <Toggle
          checked={gen.autoFill && gen.themes.length > 0}
          disabled={gen.themes.length === 0}
          onChange={(v) => setGen({ autoFill: v })}
          label={
            <span className="inline-flex items-center gap-1.5">
              <Sparkles size={15} className="text-sun" /> Auto-fill with theme words
            </span>
          }
          hint={gen.themes.length === 0 ? 'Choose a theme to fill empty space with extra words.' : `Adds words until the grid is about ${Math.round(gen.density * 100)}% full.`}
        />
        {gen.themes.length > 0 && (
          <div className="mt-3 space-y-3 pl-[3.25rem]">
            <div className="flex flex-wrap gap-1.5">
              {gen.themes.map((t) => (
                <span key={`${t.kind}:${t.id}`} className="inline-flex items-center gap-1 rounded-full border-2 border-ink/15 bg-white py-0.5 pr-1 pl-2.5 text-sm font-semibold">
                  {themeName(t, themes)}
                  <button type="button" className="rounded-full p-0.5 text-muted hover:text-tomato-dark" onClick={() => toggleTheme(t, false)} aria-label={`Stop using ${themeName(t, themes)}`}>
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold text-ink-soft">At most</span>
              <Stepper label="words" value={gen.maxWords} min={1} max={150} onChange={(v) => setGen({ maxWords: v })} />
              <span className="text-muted">words total</span>
            </div>
            {poolCount > 0 && gen.autoFill && (
              <button type="button" className="btn btn-sm" onClick={pinPoolWords} title="Move the auto-filled words into your list so they stay put">
                <Pin size={14} /> Keep these {poolCount} theme words
              </button>
            )}
          </div>
        )}
      </div>

      <WordEditDialog key={editing?.id ?? 'none'} word={editing} onClose={() => setEditing(null)} />
      <ThemeBrowser open={browser} onClose={() => setBrowser(false)} themes={themes} />
    </Section>
  )
}
