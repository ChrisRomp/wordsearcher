import { useEffect, useState } from 'react'
import { DocError } from './doc/puzzleDoc'
import { docFromHash } from './doc/share'
import { useStore } from './state/store'
import { AboutDialog } from './ui/AboutDialog'
import { EditorPanel } from './ui/editor/EditorPanel'
import { IssuesPanel } from './ui/editor/IssuesPanel'
import { Header } from './ui/Header'
import { PlayView } from './ui/play/PlayView'
import { PreviewPane } from './ui/preview/PreviewPane'
import { Toasts, toast } from './ui/toast'
import { useFontsReady } from './ui/useSheets'

/** Regenerates (debounced) whenever generator settings change. */
function useAutoGenerate() {
  const gen = useStore((s) => s.gen)
  useEffect(() => {
    const t = setTimeout(() => void useStore.getState().generateNow(), 220)
    return () => clearTimeout(t)
  }, [gen])
}

/** Opens a puzzle shared via "#p=…" and then cleans the URL. */
function useSharedDoc() {
  useEffect(() => {
    const open = () => {
      try {
        const doc = docFromHash(location.hash)
        if (!doc) return
        useStore.getState().loadDoc(doc)
        useStore.getState().setView('play')
        toast('Opened a shared puzzle')
      } catch (e) {
        toast(e instanceof DocError ? `Couldn’t open link: ${e.message}` : 'Couldn’t open that link', 'error')
      }
      history.replaceState(null, '', location.pathname + location.search)
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  }, [])
}

export default function App() {
  const fontsReady = useFontsReady()
  const view = useStore((s) => s.view)
  const [about, setAbout] = useState(false)
  useSharedDoc()
  useAutoGenerate()

  return (
    <>
      <Header onAbout={() => setAbout(true)} />
      {view === 'play' ? (
        <PlayView />
      ) : (
        <main className="mx-auto grid max-w-[1500px] items-start gap-6 px-4 pt-3 pb-16 sm:px-6 lg:grid-cols-[minmax(380px,460px)_minmax(0,1fr)]">
          <div className="space-y-4 lg:sticky lg:top-3 lg:max-h-[calc(100dvh-1.5rem)] lg:overflow-y-auto lg:pr-2 lg:pb-3">
            <IssuesPanel />
            <EditorPanel />
          </div>
          <PreviewPane fontsReady={fontsReady} />
        </main>
      )}
      <AboutDialog open={about} onClose={() => setAbout(false)} />
      <Toasts />
    </>
  )
}
