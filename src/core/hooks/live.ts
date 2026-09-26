// Realtime is a hint (spec/openCare.md §3.9 step 10): any message on a channel refetches; it carries no content.
// Channels: organization:<id> (queues, benches, the desk) and record:<patient> (a record read in the last 12 hours).
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { _db as db } from '../db/rpc'
const channels = new Map<string, { ch: ReturnType<typeof db.channel>; n: number }>()
export function useLive(topic: string | null, keys: unknown[][]) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!topic) return
    let e = channels.get(topic)
    if (!e) { e = { ch: db.channel(topic, { config: { private: true, broadcast: { self: true } } }), n: 0 }; channels.set(topic, e) }
    const bump = () => keys.forEach((k) => qc.invalidateQueries({ queryKey: k }))
    e.ch.on('broadcast', { event: 'change' }, bump)
    if (e.n === 0) e.ch.subscribe()
    e.n++
    const onFocus = () => bump()
    window.addEventListener('focus', onFocus)
    return () => { window.removeEventListener('focus', onFocus); const x = channels.get(topic); if (!x) return; x.n--; if (x.n <= 0) { void db.removeChannel(x.ch); channels.delete(topic) } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, qc])
}
