import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchTodayVisits, fetchCarriedOverVisits } from '../lib/visits'
import type { Visit } from '../types'

/**
 * Live view of a day's visits (front-desk queue; defaults to today).
 * Reloads on any visits realtime event — the day's queue is small, so a
 * refetch beats patching. Resolves assigned-physician names too.
 */
export function useVisitQueue(dateKey?: string) {
  const [visits, setVisits] = useState<Visit[]>([])
  const [carriedOver, setCarriedOver] = useState<Visit[]>([])
  const [profileNames, setProfileNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const viewDate = dateKey ? new Date(`${dateKey}T00:00:00`) : new Date()
    const viewingToday = viewDate.toDateString() === new Date().toDateString()
    const [rows, carried] = await Promise.all([
      fetchTodayVisits(viewDate),
      // Unfinished visits from previous days surface only on the today view
      viewingToday ? fetchCarriedOverVisits() : Promise.resolve([]),
    ])
    setVisits(rows)
    setCarriedOver(carried)
    const ids = [...new Set([...rows, ...carried].map(v => v.assigned_to).filter((id): id is string => !!id))]
    if (ids.length > 0) {
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      if (data) setProfileNames(Object.fromEntries(data.map(p => [p.id, p.full_name ?? ''])))
    }
    setLoading(false)
  }, [dateKey])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('visit-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => { void load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  return { visits, carriedOver, profileNames, loading, reload: load }
}
