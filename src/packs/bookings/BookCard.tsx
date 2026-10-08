// The booking card (spec/openCare.md §5.7; pictures 1 and 7): folded out under what it books from — the desk's patient card (Book
// beside Send, core change (i)), a bench's order row (Book, core change (a)), the Diary. Where (the departments this one may book), with
// whom (a session's doctor, or anyone in it), then each session's free places day by day — the next number, or its free times — later
// sessions on asking; a note (new, re-visit, or what the desk must know); what to tell the patient; Book. Moving a booking is booking
// again with the old one named: the pack cancels it in the same step.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { read } from '@core/db/rpc'
import type { PresenceRow, TableRead } from '@core/db/types'
import { CalendarPlus, StickyNote } from 'lucide-react'
import { useDepartment } from '@core/hooks/organization'
import type { Department } from '@core/db/types'
import { Button, Callout, Chip, Input, Kbd, Spinner, cn, errorText } from '@core/ui'
import { book, bookable, dayWords, placeWords, sessionsOf, tellOf, timeWords, todayOf, useBookings, useBookingsDone, useFree, type Booking, type FreeSession } from './api'
import { Arabic, LABEL } from './words'

/** a place to pick: a time or a number, with what it is */
export function Place({ at, sub, on, taken, onClick }: { at: string; sub?: string; on?: boolean; taken?: boolean; onClick?: () => void }) {
  return <button type="button" disabled={taken} aria-pressed={on} onClick={onClick} className={cn('grid min-w-20 place-content-center rounded-lg px-3 py-2 text-center ring-1 focus-ring',
    on ? 'bg-accent-soft ring-2 ring-accent' : taken ? 'cursor-not-allowed bg-sunken text-faint ring-line line-through' : 'bg-surface ring-line hover:ring-line-strong')}>
    <span className="text-14 font-semibold tnum text-fg">{at}</span>{sub && <span className="text-11 text-muted">{sub}</span>}</button>
}
export interface Picked { session_id: string; day: string; at?: string; number?: number | null; label: string }
/** what a picked place says: "Sun 11 Oct · No. 10", "Tue 13 Oct · 17:45" */
export const pickedWords = (s: FreeSession, at?: string, tz?: string) => `${dayWords(s.day)} · ${s.how === 'number' ? `No. ${s.next_number}` : timeWords(at!, tz)}`

/** one session on one day, its free places to pick */
export function SessionPlaces({ s, picked, onPick, who, tz }: { s: FreeSession; picked: Picked | null; onPick: (p: Picked) => void; who: string; tz?: string }) {
  const over = (s.overbook_left ?? 0) > 0   // the session allows overbooking still: a taken time may be booked again
  const on = picked?.session_id === s.session_id && picked.day === s.day
  const how = s.how === 'number' ? `by number, ${s.from}–${s.to}` : `by time, every ${s.every ?? 15} min, ${s.from}–${s.to}`
  return <div className={cn('grid gap-2 rounded-lg bg-surface p-3 ring-1', on ? 'ring-accent-line' : 'ring-line')}>
    <p className="flex flex-wrap items-baseline gap-x-2 text-13"><b className="font-semibold text-fg">{dayWords(s.day)}</b><span className="text-fg">{who}</span>
      <span className="text-muted">{how}</span><span className="ms-auto text-12 text-faint">{s.left > 0 ? `${s.left} of ${s.capacity} left` : 'full'}</span></p>
    {s.left > 0 && <div className="flex flex-wrap gap-2">
      {s.how === 'number' ? <><Place at={`No. ${s.next_number}`} sub="next free" on={on} onClick={() => onPick({ session_id: s.session_id, day: s.day, number: s.next_number, label: pickedWords(s) })} />
          <span className="self-center text-12 text-faint">a number session gives the next number; seen in number order</span></>
        : (s.times ?? []).map((t) => <Place key={t.at} at={timeWords(t.at, tz)} taken={t.taken && !over} sub={t.taken && over ? 'overbook' : undefined} on={on && picked?.at === t.at}
            onClick={() => onPick({ session_id: s.session_id, day: s.day, at: t.at, label: `${pickedWords(s, t.at, tz)}${t.taken ? ' (overbooked)' : ''}` })} />)}
    </div>}
  </div>
}

/** the note a booking may carry; no money is worked out from it (owner, 2026-10-08) */
export function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const set = (w: string) => onChange(value.replace(/^(new|re-visit)\b,?\s*/i, '') ? `${w}, ${value.replace(/^(new|re-visit)\b,?\s*/i, '')}` : w)
  return <div className="flex flex-wrap items-center gap-2"><StickyNote aria-hidden className="size-4 text-faint" />
    <Input value={value} onChange={(e) => onChange(e.target.value)} maxLength={200} placeholder="A note (optional)" aria-label="A note on the booking" className="w-full sm:w-80" />
    <Chip on={/^new\b/i.test(value)} onClick={() => set('new')}>new</Chip><Chip on={/^re-visit\b/i.test(value)} onClick={() => set('re-visit')}>re-visit</Chip>
    <span className="text-12 text-faint">a note, optional</span></div>
}

export function Tell({ departmentId, serviceId }: { departmentId: string; serviceId?: string | null }) {
  const { org } = useDepartment(); const t = tellOf(org, departmentId, serviceId)
  if (!t) return null
  return <p className="grid gap-0.5 text-13"><span className="text-muted">Tell the patient:</span><span className="text-fg">{t.en}</span>{t.ar && <Arabic>{t.ar}</Arabic>}</p>
}

/** the card: from this department (the writer), for this patient; a bench's order, or a booking to move */
export function BookCard({ from, patientId, order, moving, onDone, onCancel }: {
  from: Pick<Department, 'id' | 'work' | 'checks_in_for'>; patientId: string
  order?: { item: string; department_id: string; service_id: string | null; name: string }; moving?: Booking
  onDone: (said: string) => void; onCancel: () => void
}) {
  const { org } = useDepartment(); const done = useBookingsDone()
  const where = useMemo(() => order || moving ? (org?.allDepartments ?? []).filter((d) => d.id === (order?.department_id ?? moving!.department_id))
    : bookable(org, from).filter((d) => d.work === 'visits'), [org, from, order, moving])   // a bench books its orders, from their rows
  const [to, setTo] = useState<string | null>(where[0]?.id ?? null)
  const [doctor, setDoctor] = useState<string | null>(moving?.doctor_id ?? null)
  const [days, setDays] = useState(14); const [shownN, setShownN] = useState(6); const [picked, setPicked] = useState<Picked | null>(null)
  const [note, setNote] = useState(moving?.note ?? ''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null)
  const tz = org?.organization.time_zone; const today = todayOf(tz)
  const orderItem = order?.item ?? moving?.order_item ?? null; const serviceId = order?.service_id ?? moving?.service_id ?? null   // a move keeps its order
  const free = useFree(from.id, to, { from: today, days, doctor_id: doctor, service_id: serviceId })
  // same doctor first (the department's rule): the doctor who last saw the patient there, when a session of theirs is here
  const sameDoctor = (org?.settings.find((x) => x.key === 'bookings.rules' && x.thing_id === to)?.data as { same_doctor?: boolean } | undefined)?.same_doctor ?? true
  const last = useQuery({ queryKey: ['bookings', 'last doctor', from.id, patientId, to], enabled: !!to && sameDoctor && !moving, staleTime: 60_000,
    queryFn: async () => { const t = await read<TableRead<PresenceRow>>({ shape: 'table', table: 'base.presence', department_id: from.id, where: { patient_id: [patientId], department_id: [to] }, entries: false })
      return t.rows.filter((r) => r.seen_by).sort((a, b) => b.checked_in_at.localeCompare(a.checked_in_at))[0]?.seen_by ?? null } })
  const [chose, setChose] = useState(!!moving)   // once the user picks a doctor (or anyone), the rule stops choosing for them
  const theirs = useBookings(from.id, { patient_id: patientId })
  const doctors = [...new Set(sessionsOf(org, to ?? '').map((s) => s.doctor_id).filter((x): x is string => !!x))]
  const nameOf = (id: string | null | undefined) => org?.users.find((u) => u.id === id)?.name ?? null
  const placeName = (id: string | null) => org?.places.find((p) => p.id === id)?.name ?? null
  const dept = where.find((d) => d.id === to)
  const sessions = (free.data?.sessions ?? []).filter((s) => s.left > 0)
  const shown = sessions.slice(0, shownN)
  if (!chose && last.data && doctors.includes(last.data) && doctor !== last.data) { setChose(true); setDoctor(last.data) }   // adjusting state while rendering, React's way
  const other = (theirs.data?.bookings ?? []).filter((b) => b.id !== moving?.id && b.state === 'booked')
  async function go() {
    if (!picked || !to || busy) return
    setBusy(true); setErr(null)
    try {
      const r = await book(from.id, { department_id: to, patient_id: patientId, session_id: picked.session_id, day: picked.day, ...(picked.at ? { at: picked.at } : {}),
        ...(note.trim() ? { note: note.trim() } : {}), ...(orderItem ? { order_item: orderItem } : {}), ...(moving ? { moved_from: moving.id } : {}), ...(doctor ? { doctor_id: doctor } : {}) })
      done(); onDone(`${moving ? 'Moved' : 'Booked'} · ${r.department} · ${dayWords(r.day)} · ${placeWords(r, tz)}${r.order ? ` · ${r.order}` : ''}`)
    } catch (e) { setErr(e) } finally { setBusy(false) }
  }
  return <div className="grid gap-3" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void go() } }}>
    {!order && !moving && <div className="flex flex-wrap items-center gap-2"><span className={LABEL}>Book · where</span>
      {where.length ? where.map((d) => <Chip key={d.id} on={d.id === to} onClick={() => { setTo(d.id); setPicked(null); setDoctor(null); setChose(false); setShownN(6) }}>{d.name}</Chip>)
        : <span className="text-13 text-faint">No department here keeps a diary (Settings → Departments → Sessions).</span>}</div>}
    {(order || moving) && <p className="text-13 text-muted">{moving ? 'Move' : 'Book'} <b className="font-medium text-fg">{order?.name ?? moving?.service ?? moving?.session}</b> at {dept?.name}</p>}
    {doctors.length > 0 && <div className="flex flex-wrap items-center gap-2"><span className={LABEL}>With</span>
      {doctors.map((d) => <Chip key={d} on={doctor === d} onClick={() => { setChose(true); setDoctor(doctor === d ? null : d); setPicked(null) }}>{nameOf(d) ?? 'a doctor'}</Chip>)}
      <Chip on={!doctor} onClick={() => { setChose(true); setDoctor(null); setPicked(null) }}>anyone</Chip>
      {sameDoctor && last.data && doctor === last.data && <span className="text-12 text-faint">last seen by {nameOf(last.data)}, so first</span>}</div>}
    {free.isLoading ? <Spinner label="Finding free places" /> : free.error ? <Callout tone="danger" title="No places">{errorText(free.error)}</Callout>
      : !sessions.length ? <p className="text-13 text-faint">No free place in the next {days} days.</p>
      : shown.map((s) => <SessionPlaces key={`${s.session_id} ${s.day}`} s={s} picked={picked} onPick={setPicked} tz={tz}
          who={[dept?.name, s.name, nameOf(s.doctor_id), placeName(s.place_id)].filter(Boolean).join(' · ')} />)}
    {(sessions.length > shown.length || days < (free.data?.ahead ?? 90)) && <button type="button" onClick={() => { setShownN(shownN + 6); if (shownN + 6 >= sessions.length) setDays(Math.min(days + 28, 120)) }}
      className="justify-self-start rounded-sm text-13 text-accent hover:underline focus-ring">Later sessions…</button>}
    <NoteField value={note} onChange={setNote} />
    {to && <Tell departmentId={to} serviceId={serviceId} />}
    {!!err && <Callout tone="danger" title="Not booked">{errorText(err)}</Callout>}
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => void go()} disabled={!picked} loading={busy}><CalendarPlus />{picked ? `${moving ? 'Move to' : 'Book'} · ${picked.label}` : 'Pick a place'}<Kbd className="ms-1 max-sm:hidden">⌘↵</Kbd></Button>
      <Button variant="ghost" onClick={onCancel}>Close</Button>
      {other.length > 0 && <span className="text-12 text-faint">Other bookings: {other.slice(0, 3).map((b) => `${org?.allDepartments.find((d) => d.id === b.department_id)?.name ?? ''} · ${dayWords(b.day)} · ${placeWords(b, tz)}`).join('; ')}</span>}
    </div>
  </div>
}
