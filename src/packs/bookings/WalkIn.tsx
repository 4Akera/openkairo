// The walk-in's Then · when (spec/openCare.md §5.7; picture 8; core change (j)), at a bench that keeps a diary for what was chosen:
// Now — always offered (owner, 2026-10-08: the card informs, the person decides) — or one of the next free places, with what to tell
// the patient. Started with a place, the core writes the walk-in's order as it always does, then the pack books it, naming the order.
import { useDepartment } from '@core/hooks/organization'
import { useRequestQueue } from '@core/hooks/reads'
import type { WalkInPart, WalkInPartProps } from '@core/screens/bench/WhatFor'
import type { Service } from '@core/db/types'
import { book, sessionsOf, todayOf, useFree } from './api'
import { Place, Tell } from './BookCard'
import { nearest } from './logic'
import { LABEL } from './words'

interface When { session_id: string; day: string; at?: string; label: string; service_id: string | null }
/** the first chosen service a session of the bench books (none named: any) */
const bookedOne = (sessions: { services?: string[] }[], services: Service[]) =>
  services.find((s) => sessions.some((x) => !x.services?.length || x.services.includes(s.id))) ?? null

export function WalkInWhen({ bench, services, value, onChange }: WalkInPartProps) {
  // read as the department the card is on (the bench itself, or the desk that checks in for it), as the booking is written
  const { org, dept } = useDepartment(); const tz = org?.organization.time_zone; const today = todayOf(tz)
  const sessions = sessionsOf(org, bench.id); const svc = bookedOne(sessions, services)
  const free = useFree(dept?.id ?? bench.id, bench.id, { from: today, days: 14, service_id: svc?.id ?? null }, !!svc)
  // how many are ahead now: the bench's patients still to do today (only for whoever reads the bench; else the card says nothing)
  const queue = useRequestQueue(dept?.id === bench.id ? bench.id : null)
  const ahead = new Set((queue.data?.requests ?? []).filter((r) => (r.request?.step ?? 'sent') === 'sent').map((r) => r.patient.id)).size
  if (!svc) return null
  const v = value as When | null
  const near = nearest(free.data?.sessions ?? [], today, 4, tz)
  return <div className="grid gap-2 border-t border-line pt-3"><p className={LABEL}>Then · when</p>
    <div className="flex flex-wrap gap-2"><Place at="Now" sub={queue.data ? `${ahead} ahead` : 'joins To do'} on={!v} onClick={() => onChange(null)} /><span className="self-center text-12 text-faint">or</span>
      {near.map((x) => <Place key={`${x.s.session_id} ${x.s.day} ${x.at}`} at={x.label.split(' · ')[0]} sub={x.label.split(' · ')[1]} on={v?.session_id === x.s.session_id && v.day === x.s.day}
        onClick={() => onChange({ session_id: x.s.session_id, day: x.s.day, at: x.at, label: x.label, service_id: svc.id } satisfies When)} />)}</div>
    <Tell departmentId={bench.id} serviceId={svc.id} />
    <p className="text-12 text-faint">Now is always offered; you decide. Picked, the walk-in's order is made now and the booking names it.</p>
  </div>
}

// a time picked for a service no longer chosen is no choice (Now)
const chosen = (value: unknown, services: { id: string }[]) => { const v = value as When | null; return v && services.some((s) => s.id === v.service_id) ? v : null }
export const walkInStart: WalkInPart['start'] = (value, services) => { const v = chosen(value, services); return v ? `Book · ${v.label}` : null }
export const walkInAfter: WalkInPart['after'] = async (value, a) => {
  const v = chosen(value, a.orders.map((x) => x.service)); if (!v) return null
  const o = a.orders.find((x) => x.service.id === v.service_id)!
  await book(a.from, { department_id: a.bench.id, patient_id: a.patientId, session_id: v.session_id, day: v.day, ...(v.at ? { at: v.at } : {}), order_item: o.id })
  return `booked ${v.label}`
}
