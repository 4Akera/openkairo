import { useNavigate } from 'react-router-dom'
import { useRequestQueue, useVisitQueue } from '../hooks/reads'
import type { QueueRow } from '../db/types'
import { Spinner, minutesSince } from '../ui'
const BANDS: [QueueRow['band'], string][] = [['back', 'Back'], ['consult', 'In consult'], ['waiting', 'Waiting'], ['pending', 'Here · pending']]

/** The patient queue in bands (spec 05), one list; click → the visit. */
export function QueueList({ departmentId, compact = false }: { departmentId: string; compact?: boolean }) {
  const q = useVisitQueue(departmentId); const navigate = useNavigate()
  if (q.isLoading) return <Spinner label="Loading queue" />
  if (q.error) return <p className="text-sm text-red-700">{q.error.message}</p>
  const rows = q.data?.rows ?? []
  return <div>{rows.length === 0 && <p className="mb-2 rounded-md border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-400">Nobody waiting.</p>}{BANDS.map(([b, label]) => { const rs = rows.filter((r) => r.band === b); if (!rs.length) return null; return <section key={b} className="mb-3">
    <h3 className={`mb-1 text-[11px] font-semibold uppercase tracking-wider ${b === 'back' ? 'text-teal-800' : 'text-neutral-500'}`}>{label} <span className="font-normal text-neutral-400">{rs.length}</span></h3>
    <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">{rs.map((r) => { const m = minutesSince(b === 'waiting' ? r.arrived_at : r.present_at); return <li key={r.id}>
      <button onClick={() => navigate(`/visit/${r.id}`)} className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-neutral-50 ${b === 'pending' ? 'opacity-60' : ''}`}>
        <span className="w-40 truncate font-medium">{r.patient.given_name} {r.patient.family_name}</span><span className="w-8 text-xs text-neutral-500">{r.patient.age}</span>
        <span className="flex-1 truncate text-xs text-neutral-600">{b === 'back' && <b className="mr-1 text-teal-800">BACK</b>}{r.is_first ? 'new' : 'follow-up'}{r.priority !== 'routine' && <b className="ml-1.5 text-red-700">{r.priority.toUpperCase()}</b>}
          {!compact && b === 'pending' && <span className="ml-1.5 text-neutral-400">awaiting {r.requests.filter((x) => x.is_holding).map((x) => x.service_name).join(', ')}</span>}{r.patient.has_allergies && <span className="ml-1.5 text-red-700">⚠</span>}{r.request_id && r.request_open && <span className="ml-1.5 text-amber-700">consult not answered</span>}</span>
        {r.assignee_name && <span className="text-[11px] text-neutral-400">{r.assignee_name}</span>}
        <span className={`w-10 text-right font-mono text-[11px] ${m >= 60 ? 'text-red-700' : m >= 30 ? 'text-amber-700' : 'text-neutral-400'}`}>{m}m</span>
      </button></li> })}</ul></section> })}
    {!compact && <p className="text-xs text-neutral-500">done today <b className="text-neutral-800">{q.data?.done_today}</b> · away <b className="text-neutral-800">{q.data?.away}</b></p>}
  </div>
}

/** The request queue: open requests addressed to this department (spec 05). */
export function RequestList({ departmentId }: { departmentId: string }) {
  const q = useRequestQueue(departmentId); const navigate = useNavigate()
  if (q.isLoading) return <Spinner label="Loading requests" />
  const rows = q.data?.requests ?? []
  if (rows.length === 0) return <p className="rounded-md border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-400">No open requests.</p>
  return <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">{rows.map((r) => { const m = minutesSince(r.occurred_at); return <li key={r.id}>
    <button onClick={() => navigate(`/request/${r.id}`)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-neutral-50">
      <span className="w-40 truncate font-medium">{r.patient.given_name} {r.patient.family_name}</span>
      <span className="flex-1 truncate text-xs text-neutral-700">{r.service_name ?? r.display_line}{r.question_text && <span className="text-neutral-500"> — “{r.question_text}”</span>}{r.request?.priority !== 'routine' && <b className="ml-1.5 text-red-700">{r.request?.priority.toUpperCase()}</b>}</span>
      <span className="text-[11px] text-neutral-500">{r.section_name ?? r.from_department_name}</span><span className="text-[11px] text-amber-700">{r.request?.step}</span>
      <span className={`w-10 text-right font-mono text-[11px] ${m >= 120 ? 'text-red-700' : m >= 60 ? 'text-amber-700' : 'text-neutral-400'}`}>{m}m</span>
    </button></li> })}</ul>
}
