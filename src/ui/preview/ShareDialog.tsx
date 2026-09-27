import { Copy, Download, Link } from 'lucide-react'
import { useMemo } from 'react'
import { SHARE_URL_HARD_LIMIT, SHARE_URL_SOFT_LIMIT, shareUrl } from '../../doc/share'
import { exportDoc } from '../../state/store'
import { downloadDocFile } from '../exports'
import { Dialog } from '../primitives'
import { toast } from '../toast'

export function ShareDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = open ? exportDoc() : null
  const url = useMemo(() => (doc ? shareUrl(doc, `${location.origin}${location.pathname}`) : ''), [doc])
  const tooLong = url.length > SHARE_URL_HARD_LIMIT
  const long = url.length > SHARE_URL_SOFT_LIMIT

  return (
    <Dialog open={open} onClose={onClose} title="Share this puzzle">
      <div className="space-y-4 p-5">
        <p className="text-sm text-ink-soft">
          The whole puzzle is packed into the link itself. Nothing is uploaded, and anyone who opens it gets exactly this grid.
        </p>
        {!tooLong ? (
          <div>
            <label className="label" htmlFor="share-url">
              <Link size={13} className="mr-1 inline" /> Link
            </label>
            <div className="flex gap-2">
              <input id="share-url" className="field font-mono text-xs" readOnly value={url} onFocus={(e) => e.target.select()} />
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url)
                    toast('Link copied')
                  } catch {
                    toast('Couldn’t copy. Select the link and copy it by hand.', 'error')
                  }
                }}
              >
                <Copy size={16} /> Copy
              </button>
            </div>
            {long && (
              <p className="mt-2 text-sm text-tomato-dark">
                This link is long ({url.length.toLocaleString()} characters). Some email and classroom apps cut long links, so a puzzle file may be safer.
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-xl bg-sun-soft p-3 text-sm">This puzzle is too big for a link. Save it as a file and share that instead.</p>
        )}
        <div className="flex items-center gap-3 border-t-2 border-dashed border-ink/10 pt-4">
          <p className="flex-1 text-sm text-muted">Or save a puzzle file that you can open later with “Open”.</p>
          <button type="button" className="btn" onClick={() => doc && downloadDocFile(doc)}>
            <Download size={16} /> Save file
          </button>
        </div>
      </div>
    </Dialog>
  )
}
