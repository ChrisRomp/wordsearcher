import type { PuzzleDoc } from '../doc/puzzleDoc'
import { FILE_EXTENSION, docToFile } from '../doc/share'
import { pagesToPng } from '../layout/renderCanvas'
import { pagesToPdf } from '../layout/renderPdf'
import type { Page } from '../layout/types'

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function fileStem(title: string): string {
  const stem = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return stem || 'word-search'
}

export async function downloadPdf(pages: Page[], title: string) {
  downloadBlob(await pagesToPdf(pages), `${fileStem(title)}.pdf`)
}

export async function downloadPng(pages: Page[], title: string, suffix = '') {
  downloadBlob(await pagesToPng(pages), `${fileStem(title)}${suffix}.png`)
}

export function downloadDocFile(doc: PuzzleDoc) {
  downloadBlob(docToFile(doc), `${fileStem(doc.style.title)}${FILE_EXTENSION}`)
}
