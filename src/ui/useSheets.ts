import { useEffect, useMemo, useState } from 'react'
import { puzzleId, type PuzzleDoc } from '../doc/puzzleDoc'
import { registerFonts } from '../layout/fonts'
import { canvasMeasure } from '../layout/renderCanvas'
import { layoutSheet, type SheetDoc, type SheetLayout } from '../layout/sheet'
import type { StyleSettings } from '../state/settings'

export function toSheetDoc(doc: PuzzleDoc): SheetDoc {
  return {
    rows: doc.rows,
    cols: doc.cols,
    grid: doc.grid,
    placements: doc.placements,
    id: puzzleId(doc),
    directions: doc.settings.directions,
  }
}

export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    registerFonts()
      .catch(() => undefined)
      .then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])
  return ready
}

export interface SheetSet {
  puzzle: SheetLayout
  key: SheetLayout
}

export function buildSheets(doc: PuzzleDoc, style: StyleSettings): SheetSet {
  const sheet = toSheetDoc(doc)
  return {
    puzzle: layoutSheet(sheet, style, canvasMeasure),
    key: layoutSheet(sheet, style, canvasMeasure, { answerKey: true }),
  }
}

export function useSheets(doc: PuzzleDoc | null, style: StyleSettings, fontsReady: boolean): SheetSet | null {
  return useMemo(() => (doc && fontsReady ? buildSheets(doc, style) : null), [doc, style, fontsReady])
}

/** Words that still need a clue before a clue-mode worksheet can be exported. */
export function missingClues(doc: PuzzleDoc | null, style: StyleSettings): string[] {
  if (!doc || !style.clueMode) return []
  return doc.placements.filter((p) => !p.clue?.trim()).map((p) => p.display)
}
