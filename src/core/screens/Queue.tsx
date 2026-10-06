import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useRequestQueue, useVisitQueue } from '../hooks/reads'
import { useVisitActions } from '../hooks/writes'
import { useDepartment } from '../hooks/organization'
import type { QueueRow } from '../db/types'
import { Card, Empty, Input, ListRow, ListSection, Spinner, Tag, minutesSince, movedMouse } from '../ui'
import { ageSex, backIn, matches, nextPatient, pendingWords, since, yearsOld } from './clinic/words'
import { benchMarkRow, visitMarkRow } from './marks'
import { useRowMarks } from './useMarks'


/** The clinic's list (spec 05): who is next, and who needs me. Next · Back · Waiting · With a doctor, then Waiting for
 *  results (folded) and Done today. Typing filters (name or record number; every letter, so a name may start with N),
 *  ↑↓ move, ↵ opens (with nothing typed or moved, the Next row), Esc clears. `compact` is the plain list another screen
 *  shows (no filter, no Next). */
export function QueueList({ departmentId, compact = false, keys = false, frame }: { departmentId: string; compact?: boolean; keys?: boolean
  frame?: (search: ReactNode, list: ReactNode) => ReactNode   // the screen's frame: the filter goes in its toolbar, the list under it
}) {
  const q = useVisitQueue(departmentId); const navigate = useNavigate()
  const { org, can } = useDepartment(); const visits = useVisitActions(); const marks = useRowMarks('queue')
  const [filter, setFilter] = useState(''); const [cursorId, setCursorId] = useState<string | null>(null); const [showPending, setShowPending] = useState(false)
  const [kbd, setKbd] = useState(false)                  // the keys are in use (arrows, typing): no hover
  const [arrows, setArrows] = useState(false)            // the arrows moved the cursor: show it as a bar
  const input = useRef<HTMLInputElement>(null); const list = useRef<HTMLUListElement>(null)
  const all = q.data?.rows ?? []
  const f = filter.trim()
  // a search is for someone in particular: while one is typed, nobody is pinned as Next and the matches read plainly
  const next = compact || f ? null : nextPatient(all, org?.me.id)
  const band = (b: QueueRow['band']) => all.filter((r) => r.band === b && r.id !== next?.id && matches(r.patient, f))
  const folded = !showPending && !f
  const sections: { key: string; title: string; rows: QueueRow[]; fold?: boolean }[] = [
    { key: 'next', title: 'Next', rows: next ? [next] : [] },
    { key: 'back', title: 'Back', rows: band('back') }, { key: 'waiting', title: 'Waiting', rows: band('waiting') },
    { key: 'consult', title: 'With a doctor', rows: band('consult') }, { key: 'pending', title: 'Waiting for results', rows: band('pending'), fold: true }]
  const flat = sections.flatMap((s) => s.fold && folded ? [] : s.rows)
  const at = new Map(flat.map((r, n) => [r.id, n]))
  // the cursor follows the patient, not the position: a live refresh that reorders the list must not put ↵ on someone else
  const c = Math.max(flat.findIndex((r) => r.id === cursorId), flat.length ? 0 : -1)
  const setText = (v: string) => { setFilter(v); setCursorId(null); setKbd(!!v); setArrows(false) }

  // moving the cursor, opening, clearing: the same keys in the filter and on the page
  const move = (to: number) => { const n = Math.max(0, Math.min(to, flat.length - 1)); setKbd(true); setArrows(true); setCursorId(flat[n]?.id ?? null); list.current?.querySelectorAll('[role="button"]')[n]?.scrollIntoView({ block: 'nearest' }) }
  const open = (r: QueueRow | null | undefined) => { if (r) navigate(`/visit/${r.id}`) }
  const listKey = (key: string, prevent: () => void) => {
    if (key === 'ArrowDown') { prevent(); move(c + 1) } else if (key === 'ArrowUp') { prevent(); move(c - 1) }
    else if (key === 'Enter' && flat[c]) { prevent(); open(flat[c]) } else return false
    return true
  }
  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (listKey(e.key, () => e.preventDefault())) return
    if (e.key === 'Escape') { e.preventDefault(); if (filter) setText(''); else input.current?.blur() }
  }
  useEffect(() => {
    if (!keys) return
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || el.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      if (e.key === 'Enter' && el.closest('button, a')) return
      if (listKey(e.key, () => e.preventDefault())) return
      if (e.key === 'Escape' && filter) setText('')
      else if (e.key === '/') { e.preventDefault(); input.current?.focus() }
      else if (input.current && /^[\p{L}\p{N}#]$/u.test(e.key)) { e.preventDefault(); input.current?.focus(); setText(filter + e.key) }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })

  const search = !compact && <Input ref={input} value={filter} onChange={(e) => setText(e.target.value)} onKeyDown={onInputKey} aria-label="Filter the list"
    placeholder="Type a name or number — ↵ takes the next patient" className={frame ? 'w-full sm:w-80' : undefined} />
  const wait = q.isLoading ? <Spinner label="Loading queue" /> : q.error ? <p className="text-14 text-danger">{q.error.message}</p> : null
  if (wait) return frame ? <>{frame(search, wait)}</> : wait
  if (compact && !all.length) return <Card><Empty>Nobody here yet.</Empty></Card>
  const row = (r: QueueRow, isNext: boolean) => { const n = at.get(r.id) ?? -1; return <ListRow key={r.id} number={r.patient.record_number}
    name={<>{r.patient.given_name} {r.patient.family_name}{r.patient.has_allergies && <AlertTriangle className="ms-1.5 inline h-3.5 w-3.5 text-danger" aria-label="allergies" />}</>}
    age={ageSex(r.patient.age, r.patient.sex)} status={<Status r={r} />} who={r.band === 'back' || r.band === 'consult' ? r.assignee_name : null}
    minutes={minutesSince(since(r))} marks={marks(visitMarkRow(r))} next={isNext} muted={r.band === 'pending'} onOpen={() => open(r)} selected={keys && n === c && arrows} enter={keys && n === c && !arrows && !!f} hover={!kbd}
    actions={r.band === 'pending' && can('write:not_here') ? <button type="button" disabled={visits.present.isPending} title="The patient left: results go to the doctor's review list"
      onClick={() => visits.present.mutate({ visit: r.visit, is_present: false })}
      className="rounded-md px-2 py-0.5 text-11 text-faint ring-1 ring-line hover:bg-surface hover:text-danger hover:ring-danger-line">Gone</button> : undefined} /> }
  const body = <Card className="overflow-hidden"><ul ref={list} onMouseMove={(e) => { if (kbd && movedMouse(e)) { setKbd(false); setArrows(false) } }}>
      {sections.map((s) => s.rows.length > 0 && <ListSection key={s.key} title={s.title} count={s.key === 'next' ? undefined : s.rows.length}
        folded={s.fold ? folded : undefined} onToggle={s.fold ? () => setShowPending(!showPending) : undefined}>{s.rows.map((r) => row(r, s.key === 'next'))}</ListSection>)}
      {!all.length && <li><Empty>Nobody waiting.</Empty></li>}
      {all.length > 0 && f && !sections.some((s) => s.rows.length) && <li><Empty>No one matches “{f}”.</Empty></li>}
      {!compact && !f && <ListSection title="Done today" count={q.data?.done_today ?? 0} />}
    </ul></Card>
  return frame ? <>{frame(search, body)}</> : <div className="grid gap-2">{search}{body}</div>
}

/** what is happening, in words: back with what came in; urgent, 1st visit, vitals taken, not here; with whom; waiting for what.
 *  "back" keeps its teal (accent, the list's call-next colour) and a request's "here" is ok (owner decision D2). */
function Status({ r }: { r: QueueRow }) {
  if (r.band === 'back') { const back = backIn(r.requests); return <><Tag tone="accent">back</Tag><span className="truncate">{back ? `${back} in` : 'came back'}</span></> }
  if (r.band === 'consult') return <span className="truncate">with {r.assignee_name ?? 'a doctor'}</span>
  if (r.band === 'pending') return <span className="truncate">{pendingWords(r.requests) || 'waiting for results'}</span>
  const words = [r.is_first && '1st visit', r.has_vitals && 'vitals taken', r.request_id && r.request_open && 'consult to answer'].filter(Boolean).join(' · ')
  return <>{r.priority !== 'routine' && <Tag tone="danger">{r.priority}</Tag>}{words && <span className="truncate">{words}</span>}
    {r.missed_calls > 0 && <Tag tone="warn">not here ×{r.missed_calls}</Tag>}</>
}

/** Requests addressed to a clinic (consults): one row per request. Departments that offer services use the bench instead. */
export function RequestList({ departmentId }: { departmentId: string }) {
  const q = useRequestQueue(departmentId); const navigate = useNavigate(); const marks = useRowMarks('queue')
  if (q.isLoading) return <Spinner label="Loading requests" />
  if (q.error) return <p className="text-14 text-danger">{q.error.message}</p>
  const rows = q.data?.requests ?? []
  if (!rows.length) return <Card><Empty>No open requests.</Empty></Card>
  return <Card className="overflow-hidden"><ul>{rows.map((r) => { const p = r.request?.priority; const step = r.request?.step; return <ListRow key={r.id}
    number={r.patient.record_number} name={`${r.patient.given_name} ${r.patient.family_name}`} age={ageSex(yearsOld(r.patient.born_on), r.patient.sex)}
    status={<>{p && p !== 'routine' && <Tag tone="danger">{p}</Tag>}<span className="truncate">{r.service_name ?? 'Consult'}{r.question_text && <span className="text-faint"> — “{r.question_text}”</span>}</span>
      {step && <span className="shrink-0 text-12 text-faint">{step}</span>}{r.patient.here && <Tag tone="ok">here</Tag>}</>}
    who={r.from_department_name} minutes={minutesSince(r.occurred_at)} marks={marks(benchMarkRow({ patient: r.patient, rows: [r] }))} onOpen={() => navigate(`/request/${r.id}`)} /> })}</ul></Card>
}
