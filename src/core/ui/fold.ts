// A section's fold, remembered in this browser (design-system.md §4.3 Section). A private window starts every section open.
// The key moved from settings.fold.* to oc.fold.*, so folds open once after the move (harmless).
import { useEffect, useState } from 'react'

export function useFold(key: string, start = true) {
  const k = `oc.fold.${key}`
  const [open, setOpen] = useState(() => { try { const v = localStorage.getItem(k); return v === null ? start : v === '1' } catch { return start } })
  useEffect(() => { try { localStorage.setItem(k, open ? '1' : '0') } catch { /* storage blocked */ } }, [k, open])
  return [open, setOpen] as const
}
