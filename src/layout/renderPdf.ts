import type { jsPDF as JsPdf } from 'jspdf'
import { FACES, type FaceId } from './fonts'
import type { Page, PathCmd } from './types'

export type FontLoader = (face: FaceId) => Promise<ArrayBuffer>

export const fetchFont: FontLoader = async (face) => {
  const res = await fetch(`${import.meta.env.BASE_URL}fonts/${FACES[face].file}.ttf`)
  if (!res.ok) throw new Error(`Couldn't load font ${face}`)
  return res.arrayBuffer()
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function trace(pdf: JsPdf, d: PathCmd[]) {
  for (const c of d) {
    if (c[0] === 'M') pdf.moveTo(c[1], c[2])
    else if (c[0] === 'L') pdf.lineTo(c[1], c[2])
    else if (c[0] === 'C') pdf.curveTo(c[1], c[2], c[3], c[4], c[5], c[6])
    else pdf.close()
  }
}

/** Vector PDF with embedded fonts (text stays selectable and prints crisply). */
export async function pagesToPdf(pages: Page[], loadFont: FontLoader = fetchFont): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const first = pages[0]
  const orient = (p: Page) => (p.width > p.height ? 'landscape' : 'portrait')
  const pdf = new jsPDF({ unit: 'pt', format: [first.width, first.height], orientation: orient(first), compress: true })

  const faces = new Set<FaceId>()
  for (const page of pages) for (const p of page.prims) if (p.k === 'text') faces.add(p.face)
  await Promise.all(
    [...faces].map(async (face) => {
      const b64 = toBase64(await loadFont(face))
      pdf.addFileToVFS(`${face}.ttf`, b64)
      pdf.addFont(`${face}.ttf`, face, 'normal')
    }),
  )

  const opaque = new pdf.GState({ opacity: 1 })
  pdf.setLineCap('round')
  pdf.setLineJoin('round')
  pages.forEach((page, i) => {
    if (i > 0) pdf.addPage([page.width, page.height], orient(page))
    for (const p of page.prims) {
      if (p.k === 'text') {
        pdf.setFont(p.face, 'normal')
        pdf.setFontSize(p.size)
        pdf.setTextColor(p.color)
        pdf.text(p.text, p.x, p.y, {
          align: p.anchor === 'middle' ? 'center' : p.anchor === 'end' ? 'right' : 'left',
          baseline: 'alphabetic',
        })
      } else if (p.k === 'line') {
        pdf.setDrawColor(p.color)
        pdf.setLineWidth(p.width)
        pdf.setLineDashPattern(p.dash ?? [], 0)
        pdf.line(p.x1, p.y1, p.x2, p.y2)
        pdf.setLineDashPattern([], 0)
      } else if (p.k === 'rect') {
        if (p.fill) pdf.setFillColor(p.fill)
        if (p.stroke) {
          pdf.setDrawColor(p.stroke)
          pdf.setLineWidth(p.width ?? 1)
        }
        const style = p.fill && p.stroke ? 'FD' : p.fill ? 'F' : 'S'
        if (p.r) pdf.roundedRect(p.x, p.y, p.w, p.h, p.r, p.r, style)
        else pdf.rect(p.x, p.y, p.w, p.h, style)
      } else {
        if (p.fill) {
          pdf.setGState(new pdf.GState({ opacity: p.fillOpacity ?? 1 }))
          pdf.setFillColor(p.fill)
          trace(pdf, p.d)
          pdf.fill()
          pdf.setGState(opaque)
        }
        if (p.stroke) {
          pdf.setDrawColor(p.stroke)
          pdf.setLineWidth(p.width ?? 1)
          trace(pdf, p.d)
          pdf.stroke()
        }
      }
    }
  })
  return pdf.output('blob')
}
