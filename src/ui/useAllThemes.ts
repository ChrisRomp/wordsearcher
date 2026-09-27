import { useEffect, useMemo, useState } from 'react'
import { curatedThemes, dictThemes, type ThemeInfo } from '../words/themes'

export function useAllThemes(): ThemeInfo[] {
  const [dict, setDict] = useState<ThemeInfo[]>([])
  useEffect(() => {
    let alive = true
    dictThemes().then((t) => alive && setDict(t))
    return () => {
      alive = false
    }
  }, [])
  return useMemo(() => [...curatedThemes(), ...dict], [dict])
}
