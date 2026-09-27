import type { ListOrder } from '../../state/settings'
import { useStore } from '../../state/store'
import { missingClues } from '../useSheets'
import { Section, Segmented, Toggle } from '../primitives'

export function SheetSection({ delay }: { delay?: number }) {
  const style = useStore((s) => s.style)
  const doc = useStore((s) => s.doc)
  const setStyle = useStore((s) => s.setStyle)
  const missing = missingClues(doc, { ...style, clueMode: true })
  return (
    <Section step={5} title="Worksheet" color="var(--color-berry)" delay={delay}>
      <div>
        <span className="label">Word list</span>
        <Segmented
          label="Word list order"
          value={style.listOrder}
          onChange={(v: ListOrder) => setStyle({ listOrder: v })}
          options={[
            { value: 'alpha', label: 'A–Z' },
            { value: 'entered', label: 'As entered' },
            { value: 'length', label: 'By length' },
            { value: 'hidden', label: 'Hidden', title: 'Don’t show the words (extra hard)' },
          ]}
        />
      </div>

      <Toggle
        checked={style.clueMode}
        onChange={(v) => setStyle({ clueMode: v })}
        label="Clue mode"
        hint={
          style.clueMode && missing.length > 0 ? (
            <span className="text-tomato-dark">
              {missing.length} word{missing.length > 1 ? 's need' : ' needs'} a clue: {missing.slice(0, 4).join(', ')}
              {missing.length > 4 ? '…' : ''}. Click a word to add one.
            </span>
          ) : (
            'Show clues instead of the words, and kids work out what to find.'
          )
        }
      />

      <div className="flex flex-wrap gap-x-6 gap-y-4">
        <div>
          <span className="label">Letters</span>
          <Segmented
            label="Letter case"
            value={style.letterCase}
            onChange={(v) => setStyle({ letterCase: v })}
            options={[
              { value: 'upper', label: 'ABC' },
              { value: 'lower', label: 'abc' },
            ]}
          />
        </div>
        <div>
          <span className="label">Paper</span>
          <Segmented
            label="Paper size"
            value={style.pageSize}
            onChange={(v) => setStyle({ pageSize: v })}
            options={[
              { value: 'letter', label: 'Letter' },
              { value: 'a4', label: 'A4' },
            ]}
          />
        </div>
        <div>
          <span className="label">Layout</span>
          <Segmented
            label="Orientation"
            value={style.orientation}
            onChange={(v) => setStyle({ orientation: v })}
            options={[
              { value: 'portrait', label: 'Tall' },
              { value: 'landscape', label: 'Wide' },
            ]}
          />
        </div>
      </div>

      <div className="space-y-3">
        <Toggle checked={style.showInstructions} onChange={(v) => setStyle({ showInstructions: v })} label="Instructions line" hint="“Find the 20 words… Words go across, down…”" />
        <Toggle checked={style.nameDate} onChange={(v) => setStyle({ nameDate: v })} label="Name & date lines" />
        <Toggle checked={style.answerKey} onChange={(v) => setStyle({ answerKey: v })} label="Include answer key" hint="Adds a page with every word circled to PDFs and prints." />
      </div>
    </Section>
  )
}
