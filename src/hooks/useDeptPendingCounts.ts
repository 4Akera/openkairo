import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const OPEN_STATUSES = ['pending', 'submitted', 'acknowledged', 'in_progress']

/**
 * Live count of open orders per department slug — feeds the sidebar badges.
 * One lightweight query + one realtime channel regardless of how many
 * departments the user belongs to.
 */
export function useDeptPendingCounts(slugs: string[]): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const key = slugs.join(',')

  const load = useCallback(async () => {
    if (slugs.length === 0) { setCounts({}); return }
    const { data } = await supabase
      .from('block_actions')
      .select('action_type')
      .in('action_type', slugs)
      .in('status', OPEN_STATUSES)
    const next: Record<string, number> = {}
    for (const row of (data ?? []) as { action_type: string }[]) {
      next[row.action_type] = (next[row.action_type] ?? 0) + 1
    }
    setCounts(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    load()
    if (slugs.length === 0) return
    const channel = supabase
      .channel('dept-pending-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'block_actions' }, () => { void load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, load])

  return counts
}
