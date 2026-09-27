import { ArrowLeft, Check, Hand, Minus, Plus, RotateCcw, Timer } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { pathCells } from '../../core/directions'
import { docGrid, docHash, type PuzzleDoc } from '../../doc/puzzleDoc'
import { pathData } from '../../layout/path'
import { FACES, GRID_FONTS, TITLE_FONTS } from '../../layout/fonts'
import { ANSWER_COLORS, applyCase, capsule, letterHint, sortedWords } from '../../layout/sheet'
import { usePlayStore } from '../../state/playStore'
import type { StyleSettings } from '../../state/settings'
import { useStore } from '../../state/store'
import { formatTime, matchSelection, snapSelection, type Cell } from './selection'

const CELL = 44

function Capsule({ cells, color, opacity, width = 2.5, className, style, slim }: { cells: Cell[]; color: string; opacity: number; width?: number; className?: string; style?: React.CSSProperties; slim?: boolean }) {
  const a = cells[0]
  const b = cells[cells.length - 1]
  const d = capsule((a.c + 0.5) * CELL, (a.r + 0.5) * CELL, (b.c + 0.5) * CELL, (b.r + 0.5) * CELL, CELL * (slim ? 0.27 : 0.4))
  return <path d={pathData(d)} fill={color} fillOpacity={opacity} stroke={color} strokeWidth={width} strokeLinejoin="round" className={className} style={style} pathLength={1} />
}

function placementCells(p: { r: number; c: number; dir: Parameters<typeof pathCells>[2]; token: string }): Cell[] {
  return pathCells(p.r, p.c, p.dir, p.token.length).map(([r, c]) => ({ r, c }))
}

function Celebration({ count, ms, onAgain, onBack }: { count: number; ms: number; onAgain: () => void; onBack: () => void }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center rounded-[18px] bg-paper/85 p-6 backdrop-blur-[2px]">
      <div className="animate-drop max-w-sm text-center">
        <div className="mb-4 flex justify-center gap-1" aria-hidden>
          {'YAY!'.split('').map((ch, i) => (
            <span key={i} className="animate-rise grid size-12 place-items-center rounded-xl border-2 border-ink bg-sun font-display text-2xl font-semibold shadow-[0_3px_0_0_rgb(31_36_48)]" style={{ animationDelay: `${150 + i * 90}ms`, rotate: `${[-6, 4, -3, 7][i]}deg` }}>
              {ch}
            </span>
          ))}
        </div>
        <h2 className="font-display text-3xl font-semibold">You found all {count}!</h2>
        <p className="mt-1 text-lg text-ink-soft">
          Time: <span className="font-display font-semibold text-ink">{formatTime(ms)}</span>
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={onAgain}>
            <RotateCcw size={17} /> Play again
          </button>
          <button type="button" className="btn" onClick={onBack}>
            Back to editor
          </button>
        </div>
      </div>
    </div>
  )
}

function PlayBoard({ doc, style }: { doc: PuzzleDoc; style: StyleSettings }) {
  const hash = useMemo(() => docHash(doc), [doc])
  const grid = useMemo(() => docGrid(doc), [doc])
  const { rows, cols, placements } = doc
  const saved = useMemo(() => usePlayStore.getState().get(hash), [hash])
  const [found, setFound] = useState<Set<number>>(() => new Set(saved.found.filter((i) => i < placements.length)))
  const [order, setOrder] = useState<number[]>(() => saved.found.filter((i) => i < placements.length))
  const [elapsed, setElapsed] = useState(saved.elapsedMs)
  const [anchor, setAnchor] = useState<Cell | null>(null)
  const [hover, setHover] = useState<Cell | null>(null)
  const [cursor, setCursor] = useState<Cell>({ r: 0, c: 0 })
  const [focused, setFocused] = useState(false)
  const [miss, setMiss] = useState<Cell[] | null>(null)
  const [fresh, setFresh] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [panMode, setPanMode] = useState(false)
  const [announce, setAnnounce] = useState('')
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const tapAnchor = useRef(false)
  const done = found.size === placements.length && placements.length > 0
  const setView = useStore((s) => s.setView)

  useEffect(() => {
    if (done) return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') setElapsed((e) => e + 1000)
    }, 1000)
    return () => clearInterval(t)
  }, [done])

  const save = usePlayStore((s) => s.save)
  useEffect(() => {
    save(hash, { found: order, done })
  }, [hash, order, done, save])
  useEffect(() => {
    if (elapsed % 5000 === 0 || done) save(hash, { elapsedMs: elapsed })
  }, [hash, elapsed, done, save])
  const elapsedRef = useRef(elapsed)
  useEffect(() => {
    elapsedRef.current = elapsed
  }, [elapsed])
  useEffect(() => () => usePlayStore.getState().save(hash, { elapsedMs: elapsedRef.current }), [hash])

  const finish = useCallback(
    (a: Cell, b: Cell) => {
      const cells = snapSelection(a, b, rows, cols)
      const idx = matchSelection(cells, placements, found)
      if (idx >= 0) {
        setFound((f) => new Set(f).add(idx))
        setOrder((o) => [...o, idx])
        setFresh(idx)
        const n = found.size + 1
        setAnnounce(`Found ${placements[idx].display}! ${n} of ${placements.length}.`)
      } else if (cells.length > 1) {
        setMiss(cells)
        setTimeout(() => setMiss(null), 550)
        setAnnounce('Not a hidden word. Try again.')
      }
      setAnchor(null)
      setHover(null)
    },
    [rows, cols, placements, found],
  )

  const cellAt = (e: PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect()
    const c = Math.min(cols - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * cols)))
    const r = Math.min(rows - 1, Math.max(0, Math.floor(((e.clientY - rect.top) / rect.height) * rows)))
    return { r, c }
  }

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (panMode || done || e.button > 0) return
    e.preventDefault()
    const cell = cellAt(e)
    if (anchor && tapAnchor.current) {
      tapAnchor.current = false
      finish(anchor, cell)
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
    setAnchor(cell)
    setHover(cell)
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (dragging.current) setHover(cellAt(e))
  }
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!dragging.current || !anchor) return
    dragging.current = false
    const cell = cellAt(e)
    if (cell.r === anchor.r && cell.c === anchor.c) {
      // A tap: keep the start and wait for a second tap on the last letter.
      tapAnchor.current = true
      setAnnounce('First letter picked. Now tap the last letter.')
      return
    }
    finish(anchor, cell)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    if (moves[e.key]) {
      e.preventDefault()
      const [dr, dc] = moves[e.key]
      const next = { r: Math.min(rows - 1, Math.max(0, cursor.r + dr)), c: Math.min(cols - 1, Math.max(0, cursor.c + dc)) }
      setCursor(next)
      if (anchor) setHover(next)
      else setAnnounce(`${grid[next.r][next.c]}, row ${next.r + 1}, column ${next.c + 1}`)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (done) return
      if (!anchor) {
        setAnchor(cursor)
        setHover(cursor)
        setAnnounce(`Starting at ${grid[cursor.r][cursor.c]}. Move to the last letter and press Enter.`)
      } else finish(anchor, cursor)
    } else if (e.key === 'Escape') {
      setAnchor(null)
      setHover(null)
      tapAnchor.current = false
    }
  }

  const restart = () => {
    setFound(new Set())
    setOrder([])
    setElapsed(0)
    setFresh(null)
    usePlayStore.getState().clear(hash)
  }

  const colorOf = (idx: number) => ANSWER_COLORS[idx % ANSWER_COLORS.length]
  const selection = anchor && hover ? snapSelection(anchor, hover, rows, cols) : null
  const gFace = FACES[GRID_FONTS[style.gridFont].face]
  const listWords = sortedWords(placements, style.listOrder === 'hidden' ? 'alpha' : style.listOrder)
  const indexOf = new Map(placements.map((p, i) => [p, i]))
  const pct = placements.length ? Math.round((found.size / placements.length) * 100) : 0

  return (
    <main className="mx-auto grid max-w-[1500px] items-start gap-6 px-4 pt-3 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="card relative p-3 sm:p-4" aria-label="Puzzle">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-sm" onClick={() => setView('edit')}>
            <ArrowLeft size={15} /> Editor
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-paper px-2.5 py-1 font-display font-semibold tabular-nums" aria-label={`Time ${formatTime(elapsed)}`}>
            <Timer size={16} /> {formatTime(elapsed)}
          </span>
          <span className="flex-1" />
          <div className="flex items-center gap-1" role="group" aria-label="Zoom">
            <button type="button" className="btn btn-sm px-2" onClick={() => setZoom((z) => Math.max(1, z - 0.25))} disabled={zoom <= 1} aria-label="Zoom out">
              <Minus size={15} />
            </button>
            <span className="w-12 text-center font-display text-sm font-semibold tabular-nums">{Math.round(zoom * 100)}%</span>
            <button type="button" className="btn btn-sm px-2" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} disabled={zoom >= 3} aria-label="Zoom in">
              <Plus size={15} />
            </button>
          </div>
          {zoom > 1 && (
            <button type="button" className={`btn btn-sm ${panMode ? 'btn-sun' : ''}`} aria-pressed={panMode} onClick={() => setPanMode(!panMode)} title="Drag to move around instead of selecting">
              <Hand size={15} /> Move
            </button>
          )}
        </div>

        <div className="max-h-[78dvh] overflow-auto rounded-2xl bg-paper/60 p-2">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${cols * CELL} ${rows * CELL}`}
            className="mx-auto block touch-none select-none outline-none"
            style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? `${Math.max(cols * 46, 320)}px` : undefined, touchAction: panMode ? 'pan-x pan-y' : 'none' }}
            role="application"
            aria-label={`Word search grid, ${rows} rows by ${cols} columns. Use arrow keys to move, Enter on the first and last letters of a word.`}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              dragging.current = false
              setAnchor(null)
              setHover(null)
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          >
            <rect width={cols * CELL} height={rows * CELL} rx={14} fill="#fff" />
            {order.map((idx) => (
              <Capsule
                key={idx}
                cells={placementCells(placements[idx])}
                slim={!!placements[idx].nestedIn}
                color={colorOf(idx)}
                opacity={0.22}
                className={idx === fresh ? '[animation:swipe_0.45s_cubic-bezier(0.22,1,0.36,1)_both]' : undefined}
                style={idx === fresh ? ({ strokeDasharray: 1, '--len': 1 } as React.CSSProperties) : undefined}
              />
            ))}
            {selection && <Capsule cells={selection} color="#2f6fdb" opacity={0.18} width={2} />}
            {miss && <Capsule cells={miss} color="#e8553d" opacity={0.15} width={2} className="animate-pulse" />}
            {focused && (
              <rect x={cursor.c * CELL + 3} y={cursor.r * CELL + 3} width={CELL - 6} height={CELL - 6} rx={8} fill="none" stroke="#1f2430" strokeWidth={2} strokeDasharray="4 3" />
            )}
            {grid.map((row, r) =>
              row.map((ch, c) =>
                ch ? (
                  <text
                    key={`${r}-${c}`}
                    x={(c + 0.5) * CELL}
                    y={(r + 0.5) * CELL + (gFace.cap * CELL * 0.56) / 2}
                    textAnchor="middle"
                    fontFamily={`"${gFace.family}"`}
                    fontSize={CELL * 0.56}
                    fill="#1f2430"
                  >
                    {style.letterCase === 'lower' ? ch.toLowerCase() : ch}
                  </text>
                ) : null,
              ),
            )}
          </svg>
        </div>
        <p className="mt-2 text-center text-xs text-muted">Drag across a word, or tap its first and last letters. Keyboard: arrows + Enter.</p>
        <p className="sr-only" aria-live="assertive">
          {announce}
        </p>
        {done && <Celebration count={placements.length} ms={elapsed} onAgain={restart} onBack={() => setView('edit')} />}
      </section>

      <aside className="card p-5 lg:sticky lg:top-3" aria-label="Words to find">
        <h2 className="font-display text-2xl leading-tight font-semibold" style={{ color: style.titleColor, fontFamily: `"${FACES[TITLE_FONTS[style.titleFont].face].family}"` }}>
          {style.title || 'Word search'}
        </h2>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-ink bg-paper" role="progressbar" aria-valuemin={0} aria-valuemax={placements.length} aria-valuenow={found.size} aria-label="Words found">
            <div className="h-full bg-teal transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-display font-semibold tabular-nums">
            {found.size}/{placements.length}
          </span>
        </div>

        <ul className={`mt-4 ${style.clueMode ? 'space-y-2' : 'grid grid-cols-2 gap-x-3 gap-y-1.5'}`}>
          {listWords.map((p, n) => {
            const idx = indexOf.get(p)!
            const isFound = found.has(idx)
            if (style.listOrder === 'hidden' && !isFound) return null
            return (
              <li key={p.wordId} className="flex items-start gap-2">
                <span
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border-2 transition-colors ${isFound ? 'border-ink text-white' : 'border-ink/25'}`}
                  style={isFound ? { background: colorOf(idx) } : undefined}
                  aria-hidden
                >
                  {isFound && <Check size={13} strokeWidth={3.5} />}
                </span>
                <span className={`min-w-0 font-semibold ${isFound ? 'text-muted line-through decoration-2' : ''}`} style={isFound ? { textDecorationColor: colorOf(idx) } : undefined}>
                  {style.clueMode ? (
                    <>
                      <span className="text-ink-soft">{n + 1}.</span> {p.clue || '(no clue)'} <span className="text-muted">{letterHint(p.display)}</span>
                      {isFound && <span className="ml-1 font-display text-ink no-underline">→ {applyCase(p.display, style.letterCase)}</span>}
                    </>
                  ) : (
                    applyCase(p.display, style.letterCase)
                  )}
                  <span className="sr-only">{isFound ? ' (found)' : ' (not found yet)'}</span>
                </span>
              </li>
            )
          })}
        </ul>
        {style.listOrder === 'hidden' && found.size < placements.length && (
          <p className="mt-3 text-sm text-muted">{placements.length - found.size} hidden words left to find.</p>
        )}
        <div className="mt-5 border-t-2 border-dashed border-ink/10 pt-4">
          <button type="button" className="btn btn-sm" onClick={() => (found.size === 0 || confirm('Start over? Your found words will be cleared.')) && restart()}>
            <RotateCcw size={14} /> Start over
          </button>
        </div>
      </aside>
    </main>
  )
}

export function PlayView() {
  const doc = useStore((s) => s.doc)
  const style = useStore((s) => s.style)
  const setView = useStore((s) => s.setView)
  if (!doc) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="mb-4 font-display text-xl">Make a puzzle first, then come back to play it.</p>
        <button type="button" className="btn btn-primary" onClick={() => setView('edit')}>
          Go to the editor
        </button>
      </main>
    )
  }
  return <PlayBoard key={docHash(doc)} doc={doc} style={style} />
}
