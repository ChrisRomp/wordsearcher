import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export interface Progress {
  /** Indices into doc.placements that have been found. */
  found: number[]
  elapsedMs: number
  done: boolean
  updatedAt: number
}

const MAX_ENTRIES = 30

interface PlayState {
  progress: Record<string, Progress>
  get(hash: string): Progress
  save(hash: string, patch: Partial<Progress>): void
  clear(hash: string): void
}

const empty = (): Progress => ({ found: [], elapsedMs: 0, done: false, updatedAt: Date.now() })

export const usePlayStore = create<PlayState>()(
  persist(
    (set, get) => ({
      progress: {},
      get: (hash) => get().progress[hash] ?? empty(),
      save(hash, patch) {
        set((s) => {
          const next = { ...s.progress, [hash]: { ...(s.progress[hash] ?? empty()), ...patch, updatedAt: Date.now() } }
          const keys = Object.keys(next)
          if (keys.length > MAX_ENTRIES) {
            keys.sort((a, b) => next[a].updatedAt - next[b].updatedAt)
            for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete next[k]
          }
          return { progress: next }
        })
      },
      clear(hash) {
        set((s) => {
          const next = { ...s.progress }
          delete next[hash]
          return { progress: next }
        })
      },
    }),
    {
      name: 'wordsearcher:play:v1',
      storage: createJSONStorage(() => localStorage),
      merge(persisted, current) {
        const raw = (persisted as { progress?: unknown })?.progress
        const progress: Record<string, Progress> = {}
        if (raw && typeof raw === 'object')
          for (const [k, v] of Object.entries(raw as Record<string, Partial<Progress>>)) {
            if (!v || !Array.isArray(v.found)) continue
            progress[k.slice(0, 40)] = {
              found: v.found.filter((n): n is number => Number.isInteger(n) && n >= 0).slice(0, 200),
              elapsedMs: typeof v.elapsedMs === 'number' && v.elapsedMs >= 0 ? v.elapsedMs : 0,
              done: v.done === true,
              updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : 0,
            }
          }
        return { ...current, progress }
      },
    },
  ),
)
