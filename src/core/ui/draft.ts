// One row open at a time, its draft held against what was loaded so the editor can say what changed. Moved as it was from
// screens/settings/parts.tsx (design-system.md §4.3), so a pack's settings page edits the same way.
import { useEffect, useState } from 'react'

export function useDraft<T>() {
  const [s, setS] = useState<{ id: string; isNew: boolean; initial: T; draft: T } | null>(null)
  const dirty = !!s && JSON.stringify(s.initial) !== JSON.stringify(s.draft)
  useEffect(() => { if (!dirty) return; const k = (e: BeforeUnloadEvent) => e.preventDefault(); window.addEventListener('beforeunload', k); return () => window.removeEventListener('beforeunload', k) }, [dirty])
  const leave = () => !dirty || confirm('Discard your unsaved changes?')
  return {
    id: s?.id ?? null, isNew: !!s?.isNew, draft: s?.draft ?? null, initial: s?.initial ?? null, dirty,
    /** open a row (or a new one); the open row again closes it */
    toggle: (id: string, initial: T, isNew = false) => { if (!leave()) return; setS(s?.id === id ? null : { id, isNew, initial, draft: initial }) },
    set: (p: Partial<T>) => setS((x) => x && { ...x, draft: { ...x.draft, ...p } }),
    changed: (k: keyof T) => !!s && !s.isNew && JSON.stringify(s.initial[k]) !== JSON.stringify(s.draft[k]),
    cancel: () => { if (leave()) setS(null) },
    done: () => setS(null),
    /** the open row's rows changed elsewhere (a setup applied): a clean draft starts again from them; one with edits is left alone */
    refresh: (initial: T) => setS((x) => x && !x.isNew && JSON.stringify(x.initial) === JSON.stringify(x.draft) ? { ...x, initial, draft: initial } : x),
  }
}
