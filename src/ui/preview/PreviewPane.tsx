import { Eye, EyeOff, FileDown, Gamepad2, ImageDown, Printer, RefreshCw, Share2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { docDensity, docHash } from '../../doc/puzzleDoc'
import { PageSvg } from '../../layout/PageSvg'
import type { Page } from '../../layout/types'
import { useStore } from '../../state/store'
import { downloadPdf, downloadPng } from '../exports'
import { toast } from '../toastStore'
import { missingClues, useSheets } from '../useSheets'
import { PrintJob } from './PrintJob'
import { ShareDialog } from './ShareDialog'
import { EmptyState } from './EmptyState'

function TileSpinner() {
  return (
    <div className="flex gap-1" aria-hidden>
      {'MIX'.split('').map((ch, i) => (
        <span
          key={i}
          className="grid size-7 animate-tile place-items-center rounded-md border-2 border-ink bg-sun font-display text-sm font-semibold"
          style={{ animationDelay: `${i * 120}ms` }}
        >
          {ch}
        </span>
      ))}
    </div>
  )
}

export function PreviewPane({ fontsReady }: { fontsReady: boolean }) {
  const doc = useStore((s) => s.doc)
  const style = useStore((s) => s.style)
  const status = useStore((s) => s.status)
  const showSolution = useStore((s) => s.showSolution)
  const { regenerate, setShowSolution, setView } = useStore.getState()
  const sheets = useSheets(doc, style, fontsReady)
  const [busy, setBusy] = useState<string | null>(null)
  const [printPages, setPrintPages] = useState<Page[] | null>(null)
  const [sharing, setSharing] = useState(false)
  const endPrint = useCallback(() => setPrintPages(null), [])

  const missing = missingClues(doc, style)
  const blocked = missing.length > 0 ? `Add clues for ${missing.length} word${missing.length > 1 ? 's' : ''} first (clue mode is on).` : null
  const exportPages = () => (sheets ? [...sheets.puzzle.pages, ...(style.answerKey ? sheets.key.pages : [])] : [])

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    try {
      await fn()
    } catch (e) {
      toast((e as Error).message || 'Something went wrong', 'error')
    } finally {
      setBusy(null)
    }
  }

  const shown = sheets ? (showSolution ? sheets.key : sheets.puzzle) : null

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="card sticky top-3 z-10 flex flex-wrap items-center gap-2 px-3 py-2.5">
        <button type="button" className="btn btn-sun" onClick={regenerate} disabled={!doc && status !== 'error'} title="Same words, new layout">
          <RefreshCw size={17} className={status === 'generating' ? 'animate-spin' : ''} /> Shuffle
        </button>
        <button type="button" className="btn" aria-pressed={showSolution} onClick={() => setShowSolution(!showSolution)} disabled={!doc}>
          {showSolution ? <EyeOff size={17} /> : <Eye size={17} />} {showSolution ? 'Hide answers' : 'Answers'}
        </button>
        <span className="mx-1 hidden h-7 w-0.5 rounded bg-ink/10 sm:block" aria-hidden />
        <button type="button" className="btn" disabled={!sheets || !!blocked} title={blocked ?? 'Print the worksheet' + (style.answerKey ? ' and answer key' : '')} onClick={() => setPrintPages(exportPages())}>
          <Printer size={17} /> Print
        </button>
        <button type="button" className="btn" disabled={!sheets || !!blocked || !!busy} title={blocked ?? 'Download a PDF'} onClick={() => run('pdf', () => downloadPdf(exportPages(), style.title))}>
          <FileDown size={17} /> {busy === 'pdf' ? 'Making PDF…' : 'PDF'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!shown || !!blocked || !!busy}
          title={blocked ?? `Download the ${showSolution ? 'answer key' : 'worksheet'} as an image`}
          onClick={() => shown && run('png', () => downloadPng(shown.pages, style.title, showSolution ? '-answers' : ''))}
        >
          <ImageDown size={17} /> {busy === 'png' ? 'Saving…' : 'PNG'}
        </button>
        <span className="flex-1" />
        <button type="button" className="btn" disabled={!doc} onClick={() => setSharing(true)}>
          <Share2 size={17} /> Share
        </button>
        <button type="button" className="btn btn-teal" disabled={!doc} onClick={() => setView('play')}>
          <Gamepad2 size={17} /> Play
        </button>
      </div>

      {blocked && doc && <p className="rounded-xl border-2 border-sun bg-sun-soft/70 px-3 py-2 text-sm font-semibold">{blocked}</p>}

      <div className="relative">
        {!doc && status !== 'generating' && <EmptyState />}
        {!doc && status === 'generating' && (
          <div className="grid aspect-[8.5/11] place-items-center rounded-sm bg-white shadow-[var(--shadow-sheet)]">
            <TileSpinner />
          </div>
        )}
        {shown && doc && (
          <div className="space-y-6">
            {shown.pages.map((page, i) => (
              <div key={`${docHash(doc)}-${showSolution}-${i}`} className="animate-drop mx-auto max-w-[760px] overflow-hidden rounded-[3px] bg-white shadow-[var(--shadow-sheet)]" style={{ animationDelay: `${i * 80}ms` }}>
                <PageSvg page={page} className="block h-auto w-full" role="img" aria-label={`${showSolution ? 'Answer key' : 'Worksheet'} page ${i + 1}`} />
              </div>
            ))}
          </div>
        )}
        {doc && status === 'generating' && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="rounded-2xl border-2 border-ink bg-white/90 px-4 py-3 shadow-[3px_4px_0_0_rgb(31_36_48)]">
              <TileSpinner />
            </div>
          </div>
        )}
        {doc && status === 'error' && <div className="pointer-events-none absolute inset-0 rounded-sm bg-paper/50" aria-hidden />}
      </div>

      {doc && (
        <p className="text-center font-display text-sm text-muted">
          {doc.rows} × {doc.cols} · {doc.placements.length} words · {Math.round(docDensity(doc) * 100)}% full · puzzle <span className="font-semibold text-ink-soft">{doc.seed}</span>
          {sheets?.puzzle.overflowed && ' · word list continues on page 2'}
        </p>
      )}

      {printPages && <PrintJob pages={printPages} onDone={endPrint} />}
      <ShareDialog open={sharing} onClose={() => setSharing(false)} />
    </div>
  )
}
