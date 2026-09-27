import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { PageSvg } from '../../layout/PageSvg'
import type { Page } from '../../layout/types'

/** Renders pages into #print-root, opens the print dialog, then cleans up. */
export function PrintJob({ pages, onDone }: { pages: Page[]; onDone: () => void }) {
  useEffect(() => {
    const done = () => onDone()
    window.addEventListener('afterprint', done, { once: true })
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('afterprint', done)
    }
  }, [onDone])

  const root = document.getElementById('print-root')
  if (!root || pages.length === 0) return null
  const { width, height } = pages[0]
  return createPortal(
    <>
      <style>{`@page { size: ${width}pt ${height}pt; margin: 0; }`}</style>
      {pages.map((page, i) => (
        <div key={i} className="print-page" style={{ width: `${page.width}pt`, height: `${page.height}pt` }}>
          <PageSvg page={page} width="100%" height="100%" />
        </div>
      ))}
    </>,
    root,
  )
}
