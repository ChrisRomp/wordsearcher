import { Dialog } from './primitives'

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="About Word Searcher">
      <div className="space-y-4 p-5 text-[0.95rem] leading-relaxed">
        <p>
          A free tool for making printable word search puzzles. Everything runs in your browser: your words and puzzles never leave your
          computer unless you share a link or file yourself.
        </p>
        <div>
          <h3 className="font-display text-lg font-semibold">Kid-safe by design</h3>
          <p className="text-ink-soft">
            The built-in theme packs are hand-written for classrooms. The bigger “Kinds of…” word lists are filtered and reviewed, but please
            read over any puzzle before you hand it out. Random filler letters are checked so they never spell rude words. Words you type
            yourself are never changed or blocked.
          </p>
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold">Credits</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
            <li>
              Dictionary word lists from{' '}
              <a className="font-semibold text-sky underline" href="https://en-word.net/" target="_blank" rel="noreferrer">
                Open English WordNet
              </a>{' '}
              (CC BY 4.0), filtered and modified. Word commonness from{' '}
              <a className="font-semibold text-sky underline" href="http://wordlist.aspell.net/" target="_blank" rel="noreferrer">
                SCOWL
              </a>{' '}
              by Kevin Atkinson.{' '}
              <a className="font-semibold text-sky underline" href={`${import.meta.env.BASE_URL}dict/ATTRIBUTION.md`} target="_blank" rel="noreferrer">
                Full notices
              </a>
              .
            </li>
            <li>
              Filler-letter safety list based on{' '}
              <a className="font-semibold text-sky underline" href="https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words" target="_blank" rel="noreferrer">
                LDNOOBW
              </a>{' '}
              (CC BY 4.0).
            </li>
            <li>Fonts: Fredoka, Nunito, Patrick Hand, Atkinson Hyperlegible, and Bree Serif (SIL Open Font License).</li>
          </ul>
        </div>
      </div>
    </Dialog>
  )
}
