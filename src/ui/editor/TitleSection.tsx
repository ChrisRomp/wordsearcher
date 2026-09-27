import { FACES, GRID_FONTS, TITLE_FONTS } from '../../layout/fonts'
import { TITLE_COLORS, type GridFontId, type TitleFontId } from '../../state/settings'
import { useStore } from '../../state/store'
import { Section, Segmented } from '../primitives'

export function TitleSection({ delay }: { delay?: number }) {
  const style = useStore((s) => s.style)
  const setStyle = useStore((s) => s.setStyle)
  return (
    <Section step={4} title="Title & look" color="var(--color-tomato)" delay={delay}>
      <div>
        <label className="label" htmlFor="title">
          Title
        </label>
        <input
          id="title"
          className="field font-display text-lg"
          value={style.title}
          maxLength={120}
          placeholder="Untitled word search"
          onChange={(e) => setStyle({ title: e.target.value })}
        />
      </div>

      <div>
        <span className="label">Title font</span>
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Title font">
          {(Object.keys(TITLE_FONTS) as TitleFontId[]).map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={style.titleFont === id}
              title={TITLE_FONTS[id].label}
              onClick={() => setStyle({ titleFont: id })}
              className={`rounded-xl border-2 px-1 py-2 text-center transition-colors ${style.titleFont === id ? 'border-ink bg-sun-soft' : 'border-ink/10 bg-white hover:border-ink/40'}`}
            >
              <span className="block text-xl leading-none" style={{ fontFamily: `"${FACES[TITLE_FONTS[id].face].family}"`, color: style.titleColor }}>
                Abc
              </span>
              <span className="mt-1 block truncate text-[0.68rem] font-semibold text-muted">{TITLE_FONTS[id].label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div>
          <span className="label">Color</span>
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Title color">
            {TITLE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={style.titleColor.toLowerCase() === c}
                aria-label={`Color ${c}`}
                onClick={() => setStyle({ titleColor: c })}
                className={`size-7 rounded-full border-2 transition-transform hover:scale-110 ${style.titleColor.toLowerCase() === c ? 'scale-110 border-ink ring-2 ring-ink ring-offset-2' : 'border-ink/20'}`}
                style={{ background: c }}
              />
            ))}
            <label className="relative ml-1 size-7 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-ink/40" title="Custom color">
              <span className="sr-only">Custom color</span>
              <input
                type="color"
                value={style.titleColor}
                onChange={(e) => setStyle({ titleColor: e.target.value })}
                className="absolute inset-[-6px] size-[calc(100%+12px)] cursor-pointer opacity-0"
              />
              <span className="grid size-full place-items-center text-sm font-bold text-ink-soft" aria-hidden>
                +
              </span>
            </label>
          </div>
        </div>
        <div>
          <span className="label">Size</span>
          <Segmented
            label="Title size"
            value={style.titleSize}
            onChange={(v) => setStyle({ titleSize: v })}
            options={[
              { value: 'sm', label: 'S' },
              { value: 'md', label: 'M' },
              { value: 'lg', label: 'L' },
            ]}
          />
        </div>
      </div>

      <div>
        <span className="label">Grid letters</span>
        <Segmented
          label="Grid letter font"
          value={style.gridFont}
          onChange={(v: GridFontId) => setStyle({ gridFont: v })}
          options={(Object.keys(GRID_FONTS) as GridFontId[]).map((id) => ({
            value: id,
            label: <span style={{ fontFamily: `"${FACES[GRID_FONTS[id].face].family}"` }}>{GRID_FONTS[id].label}</span>,
          }))}
        />
      </div>
    </Section>
  )
}
