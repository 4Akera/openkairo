import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Does the org run wards at all? Creating the first ward IS the feature
 * toggle — no settings flag. One head-count on mount; the answer changes
 * rarely enough that navigation re-mounts cover it.
 */
export function useHasWards(): boolean {
  const [hasWards, setHasWards] = useState(false)
  useEffect(() => {
    let cancelled = false
    supabase
      .from('departments')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'ward')
      .eq('active', true)
      .then(({ count }) => {
        if (!cancelled) setHasWards((count ?? 0) > 0)
      })
    return () => { cancelled = true }
  }, [])
  return hasWards
}
