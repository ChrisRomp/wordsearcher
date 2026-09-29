/// <reference lib="webworker" />
import { generateWithFit } from './fit'
import type { GenerateInput, GenerateResult } from './types'

export interface WorkerRequest {
  id: number
  input: GenerateInput
  autoSize: boolean
}

export interface WorkerResponse {
  id: number
  result: GenerateResult
}

const ctx = self as unknown as { onmessage: (e: MessageEvent<WorkerRequest>) => void; postMessage: (m: WorkerResponse) => void }

ctx.onmessage = (e) => {
  const { id, input, autoSize } = e.data
  const result = generateWithFit(input, autoSize)
  ctx.postMessage({ id, result })
}
