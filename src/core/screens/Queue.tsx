import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useRequestQueue, useVisitQueue } from '../hooks/reads'
import { useVisitActions } from '../hooks/writes'
import { useDepartment } from '../hooks/organization'
import type { QueueRow } from '../db/types'
import { Badge, Card, Heading, Kbd, Spinner, cn, minutesSince } from '../ui'
const BANDS: [QueueRow['band'], string, 'brand' | 'muted'][] = [['back', 'Back — results in', 'brand'], ['waiting', 'Waiting', 'muted'], ['consult', 'In consult', 'muted'], ['pending', 'Here · waiting for results', 'muted']]
const SEX: Record<string, string> = { male: 'M', female: 'F', other: 'X' }
const wait = (m: number) => m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`

/** The patient queue in bands (spec 05). Keyboard: ↑↓ move · ↵ open · N opens the next patient. */
export function QueueList({ departmentId, compact = false, keys = false }: { departmentId: string; compact?: boolean; keys?: boolean }) {
  const q = useVisitQueue(departmentId); const navigate = useNavigate(); const [cursor, setCursor] = useState(0)
  const { can } = useDepartment(); const visits = useVisitActions()
  const rows = BANDS.flatMap(([b]) => (q.data?.rows ?? []).filter((r) => r.band === b))
  const c = Math.min(cursor, Math.max(0, rows.length - 1))
  useEffect(() => {
    if (!keys) return
    const k = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); setCursor(Math.min(c + 1, rows.length - 1)) }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); setCursor(Math.max(c - 1, 0)) }
      else if (e.key === 'Enter' && rows[c]) navigate(`/visit/${rows[c].id}`)
      else if (e.key.toLowerCase() === 'n') { const n = rows.find((r) => r.band === 'back' || r.band === 'waiting'); if (n) navigate(`/visit/${n.id}`) }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [keys, rows, c, navigate])
  if (q.isLoading) return <Spinner label="Loading queue" />
  if (q.error) return <p className="text-sm text-red-700">{q.error.message}</p>
  if (!rows.length) return <Card className="p-6 text-center text-sm text-neutral-400">Nobody here yet.</Card>
  let i = -1
  return <div className="grid gap-3">{BANDS.map(([b, label, tone]) => { const rs = rows.filter((r) => r.band === b); if (!rs.length) return null; return <Card key={b} className={cn('overflow-hidden', b === 'back' && 'ring-1 ring-teal-300')}>
    <Heading tone={tone === 'brand' ? 'brand' : 'muted'} count={rs.length} className={cn('border-b border-neutral-100 px-4 py-2', b === 'back' && 'bg-teal-50/60')}>{label}</Heading>
    <ul className="divide-y divide-neutral-100">{rs.map((r) => { i++; const idx = i; const m = minutesSince(b === 'waiting' ? r.arrived_at : r.present_at); return <li key={r.id}>
      <button onClick={() => navigate(`/visit/${r.id}`)} onMouseEnter={() => setCursor(idx)} className={cn('flex w-full items-center gap-4 px-4 text-left transition-colors hover:bg-neutral-50', compact ? 'py-1.5' : 'py-2.5', keys && idx === c && 'bg-teal-50/70', b === 'pending' && 'text-neutral-500')}>
        <span className="hidden w-12 shrink-0 font-mono text-xs text-neutral-400 sm:inline">#{r.patient.record_number}</span>
        <span className="w-40 shrink-0 truncate text-[14px] font-medium sm:w-56">{r.patient.given_name} {r.patient.family_name}{r.patient.has_allergies && <AlertTriangle className="ml-1.5 inline h-3.5 w-3.5 text-red-600" aria-label="allergies" />}</span>
        <span className="w-14 shrink-0 text-xs text-neutral-500 tnum">{r.patient.age} y {SEX[r.patient.sex] ?? ''}</span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs">
          <Badge tone={r.is_first ? 'blue' : 'neutral'}>{r.is_first ? 'new' : 'follow-up'}</Badge>
          {r.priority !== 'routine' && <Badge tone="red">{r.priority}</Badge>}
          {!compact && r.requests.filter((x) => b === 'pending' ? x.is_holding : false).map((x) => <Badge key={x.request_id} tone="amber">{x.service_name ?? 'consult'} · {x.step}</Badge>)}
          {!compact && b === 'back' && <span className="text-teal-800">{r.requests.length} result{r.requests.length === 1 ? '' : 's'} back</span>}
          {r.request_id && r.request_open && <Badge tone="amber">consult to answer</Badge>}
        </span>
        {r.assignee_name && <span className="text-[11px] text-neutral-400">{r.assignee_name}</span>}
        {b === 'pending' && can('write:visit') && <span role="button" tabIndex={0} title="The patient left: results go to the doctor's review list" onClick={(e) => { e.stopPropagation(); visits.present.mutate({ visit_id: r.id, is_present: false }) }}
          className="rounded-md px-2 py-0.5 text-[11px] text-neutral-500 ring-1 ring-neutral-200 hover:bg-white hover:text-red-700 hover:ring-red-300">Gone</span>}
        <span className={cn('w-12 text-right text-xs font-medium tnum', m >= 60 ? 'text-red-700' : m >= 30 ? 'text-amber-700' : 'text-neutral-400')}>{wait(m)}</span>
      </button></li> })}</ul></Card> })}
    {!compact && <p className="text-xs text-neutral-500 tnum">Done today <b className="text-neutral-800">{q.data?.done_today}</b> · away <b className="text-neutral-800">{q.data?.away}</b>{keys && <span className="ml-3 text-neutral-400"><Kbd>N</Kbd> next patient · <Kbd>↑</Kbd><Kbd>↓</Kbd> move · <Kbd>↵</Kbd> open</span>}</p>}
  </div>
}

/** Requests addressed to a clinic (consults): one row per request. Departments that offer services use the bench instead. */
export function RequestList({ departmentId }: { departmentId: string }) {
  const q = useRequestQueue(departmentId); const navigate = useNavigate()
  if (q.isLoading) return <Spinner label="Loading requests" />
  const rows = q.data?.requests ?? []
  if (!rows.length) return <Card className="p-6 text-center text-sm text-neutral-400">No open requests.</Card>
  return <Card><ul className="divide-y divide-neutral-100">{rows.map((r) => { const m = minutesSince(r.occurred_at); return <li key={r.id}>
    <button onClick={() => navigate(`/request/${r.id}`)} className="flex w-full items-center gap-4 px-4 py-2.5 text-left hover:bg-neutral-50">
      <span className="w-56 truncate text-[14px] font-medium">{r.patient.given_name} {r.patient.family_name}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-700">{r.service_name ?? 'Consult'}{r.question_text && <span className="text-neutral-500"> — “{r.question_text}”</span>}</span>
      {r.request?.priority !== 'routine' && <Badge tone="red">{r.request?.priority}</Badge>}
      <span className="text-xs text-neutral-500">{r.from_department_name}</span><Badge tone="amber">{r.request?.step}</Badge>
      <span className={cn('w-12 text-right text-xs tnum', m >= 120 ? 'text-red-700' : m >= 60 ? 'text-amber-700' : 'text-neutral-400')}>{wait(m)}</span>
    </button></li> })}</ul></Card>
}
