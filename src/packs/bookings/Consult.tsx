// /book in the consult (spec/openCare.md §5.7; picture 2): the doctor or nurse books the next visit as the visit ends. "/book 3m" (or
// 2w, 10d, a weekday) asks for the nearest free places to then, in this clinic, the doctor's own sessions first (same doctor first): the
// card under the line shows four, the nearest picked; a week earlier or later, any doctor; a note. Done saves it with the visit, through
// the pack's own door, never as a record entry (core change (k)).
import { useEffect, useMemo } from 'react'
import { CalendarPlus } from 'lucide-react'
import { useDepartment } from '@core/hooks/organization'
import type { CardEditorProps, DraftWhere } from '@core/screens/visit/commands'
import type { Ctx, Result } from '@core/screens/visit/parse'
import { Chip, Spinner } from '@core/ui'
import { addDays, book, dayWords, packFree, sessionsOf, todayOf, useFree } from './api'
import { dowOf, inDays, inWords, nearest } from './logic'
import { NoteField, Place } from './BookCard'

export interface BookParams { in: number; target: string; session_id?: string; day?: string; at?: string; number?: number | null; label?: string; note?: string; any?: boolean; doctor_id?: string }
export const parseBook = (rest: string, _ctx: Ctx): Result => {
  void _ctx
  const n = inDays(rest.replace(/^(in|after)\s+/i, ''), dowOf(todayOf()))
  if (n == null) return { error: 'After how long? /book 3m, 2w, 10d or a weekday' }
  return { ok: [{ function: 'bookings.book', params: { in: n }, line: `Next visit in ${inWords(n)}`, kind: 'Next visit', action: 'write:bookings.booking' }] }
}
export const bookLine = (q: Record<string, unknown>) => q.label ? `Next visit · ${q.label}` : `Next visit in ${inWords(Number(q.in) || 7)}`

/** the card under the line: the nearest places, picked; a week earlier or later; any doctor; the note */
export function BookEditor({ q, set, ctx }: CardEditorProps) {
  const { org } = useDepartment(); const tz = org?.organization.time_zone
  const p = q as BookParams; const today = todayOf(tz); const target = addDays(today, Number(p.in) || 7)
  const mine = sessionsOf(org, ctx.departmentId).some((s) => s.doctor_id === org?.me.id)
  const free = useFree(ctx.departmentId, ctx.departmentId, { from: addDays(target, -10), days: 21, doctor_id: mine && !p.any ? org?.me.id : null })
  const near = useMemo(() => nearest(free.data?.sessions ?? [], target, 4, tz), [free.data, target, tz])
  // a place picked keeps the doctor it was found for (with you: the booking is yours)
  const pick = (x: (typeof near)[number]) => set({ target, session_id: x.s.session_id, day: x.s.day, at: x.at, number: x.s.next_number, label: x.label,
    doctor_id: mine && !p.any ? org?.me.id : undefined })
  const unpick = { session_id: undefined, day: undefined, at: undefined, number: undefined, label: undefined, doctor_id: undefined }
  // the nearest is picked as the card opens, so Enter takes it
  useEffect(() => { if (near.length && !(p.session_id && near.some((x) => x.s.session_id === p.session_id && x.s.day === p.day))) pick(near[0]) }, [near]) // eslint-disable-line react-hooks/exhaustive-deps
  const who = mine && !p.any ? 'with you' : 'anyone in the session'
  return <div className="grid gap-2">
    <p className="flex flex-wrap items-center gap-2 text-13"><CalendarPlus aria-hidden className="size-4 text-accent" /><b className="font-semibold text-fg">Next visit in {inWords(Number(p.in) || 7)}</b>
      <span className="text-muted">{org?.allDepartments.find((d) => d.id === ctx.departmentId)?.name} · {who}</span><span className="ms-auto text-12 text-faint">nearest free to {dayWords(target)}</span></p>
    {free.isLoading ? <Spinner label="Finding free places" /> : near.length ? <div className="flex flex-wrap gap-2">{near.map((x) =>
      <Place key={`${x.s.session_id} ${x.s.day}`} at={dayWords(x.s.day)} sub={x.label.split(' · ')[1]} on={p.session_id === x.s.session_id && p.day === x.s.day} onClick={() => pick(x)} />)}</div>
      : <p className="text-13 text-faint">{free.error ? 'This clinic keeps no diary here.' : 'No free place near then.'}</p>}
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip onClick={() => set({ in: Math.max(1, (Number(p.in) || 7) - 7), ...unpick })}>a week earlier</Chip>
      <Chip onClick={() => set({ in: (Number(p.in) || 7) + 7, ...unpick })}>a week later</Chip>
      {mine && <Chip on={!!p.any} onClick={() => set({ any: !p.any, ...unpick })}>any doctor</Chip>}</div>
    <NoteField value={p.note ?? ''} onChange={(note) => set({ note })} />
    <p className="px-1 text-12 text-muted">Done saves it with the visit · the booking, not a record entry</p>
  </div>
}

/** Done: the pack books it through its own door (a line that never picked a place takes the nearest) */
export async function saveBook(params: Record<string, unknown>, where: DraftWhere) {
  let p = params as unknown as BookParams
  if (!p.session_id) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date()); const target = addDays(today, Number(p.in) || 7)
    const f = await packFree(where.departmentId, { department_id: where.departmentId, from: addDays(target, -10), days: 21 })
    const x = nearest(f.sessions, target, 1)[0]; if (!x) throw new Error('No free place near then')
    p = { ...p, session_id: x.s.session_id, day: x.s.day, at: x.at }
  }
  return book(where.departmentId, { department_id: where.departmentId, patient_id: where.patientId, session_id: p.session_id, day: p.day, ...(p.at ? { at: p.at } : {}),
    ...(p.doctor_id ? { doctor_id: p.doctor_id } : {}),
    ...(p.note?.trim() ? { note: p.note.trim() } : {}), ...(where.visitId ? { visit_id: where.visitId } : {}) })
}
