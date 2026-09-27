// What /design reads from the page as drawn (computed colours, sizes, durations), and the column a sample sits in.
// A reading is taken again when what it depends on changes: the app's theme and the system's contrast and motion settings.
// The element that takes the ref also takes the key, so a change draws it anew and the ref reads it again.
import { createContext, useCallback, useContext, useState, useSyncExternalStore } from 'react'
import { useTheme } from '../../ui'

export function useMedia(query: string) {
  const subscribe = useCallback((f: () => void) => { const m = window.matchMedia(query); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [query])
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}

export function useLive<T>(read: (el: HTMLElement) => T, initial: T) {
  const { resolved } = useTheme()
  const more = useMedia('(prefers-contrast: more)'); const still = useMedia('(prefers-reduced-motion: reduce)')
  const [value, setValue] = useState(initial)
  const ref = useCallback((el: HTMLElement | null) => { if (el) setValue(read(el)) }, [read])
  return { ref, value, key: `${resolved}${more ? '.more' : ''}${still ? '.still' : ''}` }
}

/** the theme column a sample sits in: a menu opens inside it (root), so it takes that column's theme */
export type Column = { theme: 'light' | 'dark' | null; root: HTMLElement | null }
export const ColumnContext = createContext<Column>({ theme: null, root: null })
export const useColumn = () => useContext(ColumnContext)
