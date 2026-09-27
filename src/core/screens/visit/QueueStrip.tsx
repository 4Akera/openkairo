import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { QueueRow } from '../../db/types'
import { Kbd, cn, minutesSince } from '../../ui'
import { matches } from '../clinic/words'

const wait = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`

/** The clinic's list in one line above the visit (spec 05): who is next, how many wait, the longest wait, how many are
 *  back. Numbers, not names: the patient in the room can see the screen. "Who's in?" is for the patient who walks in out
 *  of the desk's order: type his number or name, ↵ opens him (⌥J from anywhere). Matches show in the line, never over it. */
export function QueueStrip({ rows, next, me, onOpen }: { rows: QueueRow[]; next: QueueRow | null; me: string | null | undefined; onOpen: (r: QueueRow) => void }) {
  const [q, setQ] = useState(''); const box = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => { if (e.altKey && !e.metaKey && !e.ctrlKey && (e.code === 'KeyJ' || e.key.toLowerCase() === 'j')) { e.preventDefault(); box.current?.focus() } }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])
  const waiting = rows.filter((r) => r.band === 'waiting')
  const back = rows.filter((r) => r.band === 'back' && (!r.assignee_id || r.assignee_id === me))
  const longest = waiting.reduce((m, r) => Math.max(m, minutesSince(r.arrived_at)), 0)
  // whom this doctor may open: not another doctor's patient (with them, or back for them)
  const open = rows.filter((r) => !((r.band === 'consult' || r.band === 'back') && r.assignee_id && r.assignee_id !== me))
  const t = q.trim(); const n = t.replace('#', '')
  const found = t ? open.filter((r) => matches(r.patient, t)).sort((a, b) => Number(String(b.patient.record_number) === n) - Number(String(a.patient.record_number) === n)).slice(0, 3) : []
  const go = (r: QueueRow) => { setQ(''); box.current?.blur(); onOpen(r) }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && found[0]) { e.preventDefault(); go(found[0]) }
    else if (e.key === 'Escape') { e.preventDefault(); setQ(''); box.current?.blur() }
  }
  return <div className="border-b border-line bg-sunken">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1 text-12 text-faint tnum">
      {next ? <button type="button" onClick={() => onOpen(next)} className="rounded-sm px-1 -mx-1 font-medium text-accent hover:bg-accent-soft" title="Open the next patient">
        Next #{next.patient.record_number}{next.band === 'back' && ' (back)'} ›</button> : <span>Nobody next</span>}
      <span><b className="font-semibold text-fg">{waiting.length}</b> waiting</span>
      {waiting.length > 0 && <span>longest <b className={cn('font-semibold', longest >= 60 ? 'text-danger' : longest >= 30 ? 'text-warn' : 'text-fg')}>{wait(longest)}</b></span>}
      {back.length > 0 && <span><b className="font-semibold text-fg">{back.length}</b> back</span>}
      <span className="ms-auto flex min-w-0 items-center gap-1.5">
        {found.map((r, i) => <button key={r.id} type="button" onClick={() => go(r)} className={cn('truncate rounded-sm px-1.5 py-0.5 ring-1', i === 0 ? 'bg-accent-soft text-accent ring-accent-line' : 'text-muted ring-line hover:ring-line-strong')}>
          #{r.patient.record_number} {r.patient.given_name} {r.patient.family_name}{i === 0 && <Kbd className="ms-1">↵</Kbd>}</button>)}
        {t && !found.length && <span className="text-faint">nobody in the list</span>}
        <input ref={box} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} aria-label="Who's in? Open a patient from the list"
          placeholder="Who's in? # or name  ⌥J" className="h-6 w-44 rounded-sm border border-line bg-surface px-2 text-12 text-fg placeholder:text-faint focus:border-accent focus:outline-none" />
      </span>
    </div>
  </div>
}
