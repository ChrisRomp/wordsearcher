/// <reference lib="webworker" />
import { generate, generateAutoSize } from './generator'
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
  const result = autoSize ? generateAutoSize(input) : generate(input)
  ctx.postMessage({ id, result })
}
