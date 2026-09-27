import { cssFont } from './fonts'
import type { Measure, Page, PathCmd } from './types'

function trace(ctx: CanvasRenderingContext2D, d: PathCmd[]) {
  ctx.beginPath()
  for (const c of d) {
    if (c[0] === 'M') ctx.moveTo(c[1], c[2])
    else if (c[0] === 'L') ctx.lineTo(c[1], c[2])
    else if (c[0] === 'C') ctx.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6])
    else ctx.closePath()
  }
}

export function drawPage(ctx: CanvasRenderingContext2D, page: Page) {
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, page.width, page.height)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const p of page.prims) {
    if (p.k === 'text') {
      ctx.font = cssFont(p.face, p.size)
      ctx.fillStyle = p.color
      ctx.textAlign = p.anchor === 'middle' ? 'center' : p.anchor === 'end' ? 'right' : 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(p.text, p.x, p.y)
    } else if (p.k === 'line') {
      ctx.strokeStyle = p.color
      ctx.lineWidth = p.width
      ctx.setLineDash(p.dash ?? [])
      ctx.beginPath()
      ctx.moveTo(p.x1, p.y1)
      ctx.lineTo(p.x2, p.y2)
      ctx.stroke()
      ctx.setLineDash([])
    } else if (p.k === 'rect') {
      ctx.beginPath()
      ctx.roundRect(p.x, p.y, p.w, p.h, p.r ?? 0)
      if (p.fill) {
        ctx.fillStyle = p.fill
        ctx.fill()
      }
      if (p.stroke) {
        ctx.strokeStyle = p.stroke
        ctx.lineWidth = p.width ?? 1
        ctx.stroke()
      }
    } else {
      trace(ctx, p.d)
      if (p.fill) {
        ctx.globalAlpha = p.fillOpacity ?? 1
        ctx.fillStyle = p.fill
        ctx.fill()
        ctx.globalAlpha = 1
      }
      if (p.stroke) {
        ctx.strokeStyle = p.stroke
        ctx.lineWidth = p.width ?? 1
        ctx.stroke()
      }
    }
  }
}

/** Renders pages stacked vertically into one PNG at `dpi` (default 200). */
export async function pagesToPng(pages: Page[], dpi = 200): Promise<Blob> {
  const scale = dpi / 72
  const gap = pages.length > 1 ? 24 : 0
  const width = Math.max(...pages.map((p) => p.width))
  const height = pages.reduce((n, p) => n + p.height, 0) + gap * (pages.length - 1)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#e9e7e1'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  let y = 0
  for (const page of pages) {
    ctx.save()
    ctx.scale(scale, scale)
    ctx.translate(0, y)
    drawPage(ctx, page)
    ctx.restore()
    y += page.height + gap
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'))
}

let measureCtx: CanvasRenderingContext2D | null = null

/** Text measurement with the real (loaded) fonts. */
export const canvasMeasure: Measure = (text, face, size) => {
  measureCtx ??= document.createElement('canvas').getContext('2d')!
  measureCtx.font = cssFont(face, size)
  return measureCtx.measureText(text).width
}
