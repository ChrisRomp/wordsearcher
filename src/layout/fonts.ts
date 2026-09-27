import type { GridFontId, TitleFontId } from '../state/settings'

export type FaceId =
  | 'fredoka-500'
  | 'fredoka-600'
  | 'nunito-400'
  | 'nunito-700'
  | 'nunito-800'
  | 'patrick-hand-400'
  | 'atkinson-hyperlegible-400'
  | 'atkinson-hyperlegible-700'
  | 'bree-serif-400'

interface Face {
  /** CSS family name used by all renderers (one family per file keeps metrics identical). */
  family: string
  /** File stem in public/fonts (both .woff2 and .ttf exist). */
  file: FaceId
  /** Cap height as a fraction of the em (from the font's OS/2 table). */
  cap: number
}

const face = (file: FaceId, cap: number): Face => ({ family: `ws-${file}`, file, cap })

export const FACES: Record<FaceId, Face> = {
  'fredoka-500': face('fredoka-500', 0.7),
  'fredoka-600': face('fredoka-600', 0.7),
  'nunito-400': face('nunito-400', 0.705),
  'nunito-700': face('nunito-700', 0.705),
  'nunito-800': face('nunito-800', 0.705),
  'patrick-hand-400': face('patrick-hand-400', 0.661),
  'atkinson-hyperlegible-400': face('atkinson-hyperlegible-400', 0.668),
  'atkinson-hyperlegible-700': face('atkinson-hyperlegible-700', 0.668),
  'bree-serif-400': face('bree-serif-400', 0.665),
}

export const TITLE_FONTS: Record<TitleFontId, { label: string; face: FaceId }> = {
  fredoka: { label: 'Playful Rounded', face: 'fredoka-600' },
  nunito: { label: 'Friendly Sans', face: 'nunito-800' },
  patrick: { label: 'Handwritten', face: 'patrick-hand-400' },
  atkinson: { label: 'Extra Readable', face: 'atkinson-hyperlegible-700' },
  bree: { label: 'Storybook Slab', face: 'bree-serif-400' },
}

export const GRID_FONTS: Record<GridFontId, { label: string; face: FaceId }> = {
  atkinson: { label: 'Extra Readable', face: 'atkinson-hyperlegible-400' },
  nunito: { label: 'Friendly Sans', face: 'nunito-700' },
  fredoka: { label: 'Playful Rounded', face: 'fredoka-500' },
}

export const BODY_FACE: FaceId = 'nunito-400'
export const BODY_BOLD_FACE: FaceId = 'nunito-700'

export function cssFont(id: FaceId, size: number): string {
  return `${size}px "${FACES[id].family}"`
}

export function fontUrl(id: FaceId, ext: 'woff2' | 'ttf'): string {
  return `${import.meta.env.BASE_URL}fonts/${FACES[id].file}.${ext}`
}

/** UI families (weights of the same files) for app chrome, registered alongside the renderer faces. */
const UI_FAMILIES: { family: string; file: FaceId; weight: string }[] = [
  { family: 'Fredoka', file: 'fredoka-500', weight: '500' },
  { family: 'Fredoka', file: 'fredoka-600', weight: '600' },
  { family: 'Nunito', file: 'nunito-400', weight: '400' },
  { family: 'Nunito', file: 'nunito-700', weight: '700' },
  { family: 'Nunito', file: 'nunito-800', weight: '800' },
]

let registered: Promise<void> | null = null

/** Registers every face with the document and resolves once all are loaded. */
export function registerFonts(): Promise<void> {
  if (registered) return registered
  const all: FontFace[] = [
    ...Object.values(FACES).map((f) => new FontFace(f.family, `url(${fontUrl(f.file, 'woff2')}) format("woff2")`)),
    ...UI_FAMILIES.map(
      (u) => new FontFace(u.family, `url(${fontUrl(u.file, 'woff2')}) format("woff2")`, { weight: u.weight }),
    ),
  ]
  for (const f of all) document.fonts.add(f)
  registered = Promise.all(all.map((f) => f.load())).then(() => undefined)
  return registered
}
