import type { FaceId } from './fonts'

export type PathCmd = ['M', number, number] | ['L', number, number] | ['C', number, number, number, number, number, number] | ['Z']

export type Prim =
  | {
      k: 'text'
      x: number
      y: number
      text: string
      face: FaceId
      size: number
      color: string
      anchor: 'start' | 'middle' | 'end'
    }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dash?: number[] }
  | { k: 'rect'; x: number; y: number; w: number; h: number; r?: number; stroke?: string; fill?: string; width?: number }
  | { k: 'path'; d: PathCmd[]; stroke?: string; fill?: string; width?: number; fillOpacity?: number }

/** One printed page in points (1/72 in). */
export interface Page {
  width: number
  height: number
  prims: Prim[]
}

export type Measure = (text: string, face: FaceId, size: number) => number
