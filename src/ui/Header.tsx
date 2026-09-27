import { FilePlus2, FolderOpen, Info, Save } from 'lucide-react'
import { useRef } from 'react'
import { DocError } from '../doc/puzzleDoc'
import { docFromFile } from '../doc/share'
import { exportDoc, useStore } from '../state/store'
import { downloadDocFile } from './exports'
import { toast } from './toastStore'

function Logo() {
  const letters = 'WORD'.split('')
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex gap-[3px] px-1" aria-hidden>
        <span className="absolute inset-x-0 top-1/2 h-7 -translate-y-1/2 -rotate-2 rounded-full bg-sun/70 sm:h-9" />
        {letters.map((ch, i) => (
          <span key={i} className="relative grid size-6 place-items-center rounded-md border-2 border-ink bg-white font-display text-sm font-semibold sm:size-8 sm:rounded-lg sm:text-lg" style={{ rotate: `${[-4, 3, -2, 4][i]}deg` }}>
            {ch}
          </span>
        ))}
      </div>
      <span className="hidden font-display text-2xl font-semibold tracking-tight min-[480px]:inline">
        searcher
      </span>
    </div>
  )
}

export function Header({ onAbout }: { onAbout: () => void }) {
  const view = useStore((s) => s.view)
  const hasDoc = useStore((s) => !!s.doc)
  const { setView, loadDoc, reset } = useStore.getState()
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <header className="mx-auto flex max-w-[1500px] items-center gap-x-2 gap-y-3 px-4 pt-4 pb-2 sm:gap-x-5 sm:px-6">
      <h1>
        <span className="sr-only">Word Searcher</span>
        <Logo />
      </h1>
      <nav className="seg sm:ml-2" aria-label="Mode">
        <button type="button" aria-pressed={view === 'edit'} onClick={() => setView('edit')}>
          Make
        </button>
        <button type="button" aria-pressed={view === 'play'} onClick={() => hasDoc && setView('play')} disabled={!hasDoc}>
          Play
        </button>
      </nav>
      <div className="ml-auto flex shrink-0 items-center sm:gap-1">
        <button
          type="button"
          className="btn btn-ghost btn-sm px-1.5 sm:px-2.5"
          aria-label="New puzzle"
          onClick={() => {
            if (confirm('Start a new puzzle? Your current words and settings will be cleared.')) reset()
          }}
        >
          <FilePlus2 size={16} /> <span className="hidden sm:inline">New</span>
        </button>
        <button type="button" className="btn btn-ghost btn-sm px-1.5 sm:px-2.5" onClick={() => fileRef.current?.click()} aria-label="Open puzzle file">
          <FolderOpen size={16} /> <span className="hidden sm:inline">Open</span>
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm px-1.5 sm:px-2.5"
          aria-label="Save puzzle file"
          disabled={!hasDoc}
          onClick={() => {
            const doc = exportDoc()
            if (doc) downloadDocFile(doc)
          }}
        >
          <Save size={16} /> <span className="hidden sm:inline">Save</span>
        </button>
        <button type="button" className="btn btn-ghost btn-sm px-1.5 sm:px-2.5" onClick={onAbout} aria-label="About">
          <Info size={16} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              loadDoc(await docFromFile(file))
              toast(`Opened “${file.name}”`)
            } catch (err) {
              toast(err instanceof DocError ? err.message : 'Couldn’t open that file', 'error')
            }
          }}
        />
      </div>
    </header>
  )
}
