import type { WorkerRequest, WorkerResponse } from '../core/worker'
import type { GenerateInput, GenerateResult } from '../core/types'

export class CancelledError extends Error {}

let worker: Worker | null = null
let nextId = 1
let pending: { id: number; resolve: (r: GenerateResult) => void; reject: (e: Error) => void } | null = null

function spawn(): Worker {
  const w = new Worker(new URL('../core/worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent<WorkerResponse>) => {
    if (pending && e.data.id === pending.id) {
      pending.resolve(e.data.result)
      pending = null
    }
  }
  w.onerror = (e) => {
    pending?.reject(new Error(e.message || 'Generator crashed'))
    pending = null
    worker?.terminate()
    worker = null
  }
  return w
}

/** Runs the generator off the main thread. Starting a new run cancels the previous one. */
export function runGenerate(input: GenerateInput, autoSize: boolean): Promise<GenerateResult> {
  if (pending) {
    worker?.terminate()
    worker = null
    pending.reject(new CancelledError())
    pending = null
  }
  worker ??= spawn()
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending = { id, resolve, reject }
    worker!.postMessage({ id, input, autoSize } satisfies WorkerRequest)
  })
}
