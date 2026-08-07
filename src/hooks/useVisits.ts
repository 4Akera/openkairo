import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchTodayVisits } from '../lib/visits'
import type { Visit } from '../types'

/**
 * Live view of today's visits (front-desk queue). Reloads on any visits
 * realtime event — the day's queue is small, so a refetch beats patching.
 * Also resolves assigned-physician names into `profileNames`.
 */
export function useVisitQueue() {
  const [visits, setVisits] = useState<Visit[]>([])
  const [profileNames, setProfileNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const rows = await fetchTodayVisits()
    setVisits(rows)
    const ids = [...new Set(rows.map(v => v.assigned_to).filter((id): id is string => !!id))]
    if (ids.length > 0) {
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      if (data) setProfileNames(Object.fromEntries(data.map(p => [p.id, p.full_name ?? ''])))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('visit-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => { void load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  return { visits, profileNames, loading, reload: load }
}
