// Booked today (bookings.today, spec/openCare.md §5.7; pictures 3 and 4), at a desk: everyone booked today across the clinics and
// benches it checks in for, by time or number — Now and next, then Earlier today — and Here, the base's ordinary check-in (a clinic's
// booking: the visit is opened, then the booking marked here with it; a bench's: marked here, its order is in To do already). Tomorrow's
// calls: the next open day's bookings to phone, each marked confirmed, will cancel (cancelled, the patient asked), no answer or wrong
// number, with what to tell the patient. Missed: the last week's bookings nobody came for. Book: find the patient, then the card.
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarPlus, Phone } from 'lucide-react'
import { read } from '@core/db/rpc'
import type { PatientBanner, PresenceRow, TableRead } from '@core/db/types'
import { useDepartment } from '@core/hooks/organization'
import { useVisitActions } from '@core/hooks/writes'
import type { ScreenProps } from '@core/screens/registry'
import { Button, Callout, Card, Chip, Empty, Input, Kbd, ListRow, ListSection, ScreenFrame, Spinner, Tag, cn, errorText, type ScreenView } from '@core/ui'
import { addDays, bookable, call, dayWords, here, OUTCOMES, placeWords, tellOf, todayOf, useBookings, useBookingsDone, useBookingsLive, usePatients, type Booking } from './api'
import { BookCard } from './BookCard'
import { FindPatient } from './FindPatient'
import { Arabic } from './words'

type View = 'today' | 'calls' | 'missed'
const ageSex = (p: { age: number; sex: string } | undefined) => p ? `${p.age} ${p.sex?.[0]?.toUpperCase() ?? ''}` : ''

export function Today({ dept }: ScreenProps) {
  const { org, can } = useDepartment(); useBookingsLive(org?.organization.id)
  const tz = org?.organization.time_zone; const today = todayOf(tz)
  const [view, setView] = useState<View>('today'); const [find, setFind] = useState(''); const [booking, setBooking] = useState(false); const [said, setSaid] = useState<string | null>(null)
  const depts = useMemo(() => bookable(org, dept).map((d) => d.id), [org, dept])
  const day = useBookings(dept.id, { departments: depts, from: today, to: today }, depts.length > 0)
  const week = useBookings(dept.id, { departments: depts, from: addDays(today, 1), to: addDays(today, 7) }, depts.length > 0)
  const past = useBookings(dept.id, { departments: depts, from: addDays(today, -7), to: today }, depts.length > 0)
  const rows = day.data?.bookings ?? []
  const nextDay = (week.data?.bookings ?? []).find((b) => b.state === 'booked')?.day ?? null
  const calls = (week.data?.bookings ?? []).filter((b) => b.day === nextDay && (b.state === 'booked' || b.call))
  const missed = (past.data?.bookings ?? []).filter((b) => b.state === 'missed')
  const names = usePatients(dept.id, [...rows, ...calls, ...missed].map((b) => b.patient_id))
  const p = (b: Booking) => names.data?.[b.patient_id]
  const f = find.trim().toLowerCase()
  const match = (b: Booking) => !f || [p(b)?.given_name, p(b)?.family_name, String(p(b)?.record_number ?? ''), p(b)?.phone_text].some((x) => x?.toLowerCase().includes(f))
  const views: ScreenView<View>[] = [{ id: 'today', label: 'Today', count: rows.filter((b) => b.state !== 'cancelled').length },
    { id: 'calls', label: "Tomorrow's calls", count: calls.filter((b) => !b.call).length, needs: 'warn' }, { id: 'missed', label: 'Missed', count: missed.length }]
  const err = day.error ?? week.error ?? past.error
  return <ScreenFrame views={views} view={view} onView={setView}
    search={<Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Name, number or phone" aria-label="Find a booking" className="w-full sm:w-64" />}
    action={can('write:bookings.booking') && <Button size="sm" variant="outline" aria-expanded={booking} onClick={() => { setBooking(!booking); setSaid(null) }}><CalendarPlus />Book<Kbd className="ms-1 max-sm:hidden">B</Kbd></Button>}
    notice={said && <Callout key={said} tone="accent" icon={false} role="status">✓ {said}</Callout>}>
    {booking && <Card className="p-4 ring-1 ring-accent-line"><FindPatient onClose={() => setBooking(false)}>{(pt) =>
      <BookCard from={dept} patientId={pt.id} onCancel={() => setBooking(false)} onDone={(s) => { setBooking(false); setSaid(`${pt.given_name} ${pt.family_name} · ${s}`) }} />}</FindPatient></Card>}
    {!depts.length ? <Card><Empty>No department this desk checks in for keeps a diary.</Empty></Card>
      : err ? <Callout tone="danger" title="Not loaded">{errorText(err)}</Callout>
      : day.isLoading ? <Spinner label="Reading the day's bookings" />
      : view === 'today' ? <TodayList dept={dept.id} rows={rows.filter(match)} name={p} onSaid={setSaid} />
      : view === 'calls' ? <Calls dept={dept.id} day={nextDay} rows={calls.filter(match)} name={p} />
      : <Card className="overflow-hidden"><ul>
          {missed.filter(match).length ? missed.filter(match).map((b) => <ListRow key={b.id} number={p(b)?.record_number ?? ''} name={p(b) ? `${p(b)!.given_name} ${p(b)!.family_name}` : '…'} age={ageSex(p(b))}
            status={<><span className="w-24 shrink-0 tnum text-fg">{dayWords(b.day)}</span><span className="w-14 shrink-0 tnum">{placeWords(b, tz)}</span><span className="truncate text-muted">{where(org, b)}</span></>}
            who={<Tag tone="danger">missed</Tag>} />) : <li><Empty>Nobody missed a booking this week.</Empty></li>}</ul></Card>}
  </ScreenFrame>
}

/** where a booking is: the department, the session's doctor, the order's name */
const where = (org: ReturnType<typeof useDepartment>['org'], b: Booking) =>
  [org?.allDepartments.find((d) => d.id === b.department_id)?.name, b.service ?? org?.users.find((u) => u.id === b.doctor_id)?.name].filter(Boolean).join(' · ')

function TodayList({ dept, rows, name, onSaid }: { dept: string; rows: Booking[]; name: (b: Booking) => PatientBanner | undefined; onSaid: (s: string) => void }) {
  const { org, can } = useDepartment(); const tz = org?.organization.time_zone; const visits = useVisitActions(); const done = useBookingsDone()
  const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<unknown>(null)
  const [now, setNow] = useState(() => Date.now()); useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  // where the ones who came are now (the base's presence: waiting, with a doctor, seen)
  const visitIds = rows.flatMap((b) => b.here?.visit_id ? [b.here.visit_id] : [])
  const presence = useQuery({ queryKey: ['bookings', 'presence', dept, visitIds], enabled: visitIds.length > 0, refetchInterval: 30_000, placeholderData: (x) => x,
    queryFn: () => read<TableRead<PresenceRow>>({ shape: 'table', table: 'base.presence', department_id: dept, where: { item: visitIds }, entries: false }) })
  const open = rows.filter((b) => b.state === 'booked'); const earlier = rows.filter((b) => b.state !== 'booked')
  const isClinic = (b: Booking) => org?.allDepartments.find((d) => d.id === b.department_id)?.work === 'visits'
  async function arrive(b: Booking) {
    setBusy(b.id); setErr(null)
    try {
      if (isClinic(b)) {
        // already sent there the ordinary way (Send on the patient card): that open visit is the one; else Here opens it
        const open = await read<TableRead<PresenceRow>>({ shape: 'table', table: 'base.presence', department_id: dept, entries: false,
          where: { patient_id: [b.patient_id], department_id: [b.department_id] } })
        const was = open.rows.filter((r) => !r.ended_at && r.kind === 'visit').sort((x, y) => y.checked_in_at.localeCompare(x.checked_in_at))[0]
        const v = was ? { id: was.item } : await visits.open.mutateAsync({ patient_id: b.patient_id, department_id: b.department_id })
        await here(dept, b.id, v.id)
      } else await here(dept, b.id)
      done(); const n = name(b); onSaid(`${n ? `${n.given_name} ${n.family_name}` : 'Here'} → ${where(org, b)} · ${placeWords(b, tz)}`)
    } catch (e) { setErr(e) } finally { setBusy(null) }
  }
  const word = (b: Booking) => {
    if (b.state === 'cancelled') return <Tag>cancelled</Tag>
    if (b.state === 'missed') return <Tag tone="danger">missed</Tag>
    if (b.state === 'here') { const r = presence.data?.rows.find((x) => x.item === b.here?.visit_id); const s = String(r?.state ?? '')
      return s === 'left' && !r?.seen_at ? <Tag tone="warn">left unseen</Tag>
        : <Tag tone="ok">{s === 'done' || s === 'left' ? 'seen' : s === 'pending' ? 'seen · waiting for results' : s === 'with' || s === 'called' ? 'with a doctor' : 'here · waiting'}</Tag> }
    const late = now - Date.parse(b.starts_at); const m = Math.round(late / 60_000)
    return b.number == null && m > 10 ? <Tag tone="warn">late {m} min</Tag> : <Tag>due {placeWords(b, tz)}</Tag>
  }
  const row = (b: Booking, i: number, muted: boolean) => { const n = name(b)
    return <ListRow key={b.id} number={n?.record_number ?? ''} name={n ? `${n.given_name} ${n.family_name}` : '…'} age={ageSex(n)} selected={!muted && i === 0} muted={muted}
      status={<><span className={cn('w-14 shrink-0 tnum', muted ? '' : 'font-semibold text-fg')}>{placeWords(b, tz)}</span><span className="truncate text-muted">{where(org, b)}</span>
        {b.note && <span className="truncate text-12 text-faint">· {b.note}</span>}</>}
      who={word(b)} extra={!muted && can('write:bookings.booking') && <Button size="sm" variant={i === 0 ? 'primary' : 'outline'} loading={busy === b.id} onClick={() => void arrive(b)}>Here</Button>} /> }
  return <>
    {!!err && <Callout tone="danger" title="Not checked in">{errorText(err)}</Callout>}
    <Card className="overflow-hidden"><ul>
      <ListSection title="Now and next" count={open.length} />
      {open.length ? open.map((b, i) => row(b, i, false)) : <li><Empty>Nobody else booked today.</Empty></li>}
      {earlier.length > 0 && <ListSection title="Earlier today" count={earlier.length}>{earlier.map((b, i) => row(b, i, true))}</ListSection>}
    </ul></Card>
    <p className="text-12 text-faint">Here is the ordinary check-in: the patient joins the clinic's queue at their time or number, or the bench's To do with the order the
      booking names. Missed is worked out once the session ends; nothing writes it.</p>
  </>
}

function Calls({ dept, day, rows, name }: { dept: string; day: string | null; rows: Booking[]; name: (b: Booking) => PatientBanner | undefined }) {
  const { org, can } = useDepartment(); const tz = org?.organization.time_zone; const done = useBookingsDone()
  const [open, setOpen] = useState<string | null>(null); const [err, setErr] = useState<unknown>(null)
  const say = async (b: Booking, o: (typeof OUTCOMES)[number][0]) => { setErr(null); try { await call(dept, b.id, o); done() } catch (e) { setErr(e) } }
  if (!day) return <Card><Empty>No bookings in the next week to call.</Empty></Card>
  return <>
    {!!err && <Callout tone="danger" title="Not saved">{errorText(err)}</Callout>}
    <Card className="overflow-hidden"><ul>
      <ListSection title={`${day === addDays(todayOf(tz), 1) ? 'Tomorrow' : 'Next open day'} · ${dayWords(day)} · to call`} count={rows.filter((b) => !b.call).length} />
      {rows.map((b) => { const n = name(b); const t = tellOf(org, b.department_id, org?.services.find((s) => s.name === b.service && s.department_id === b.department_id)?.id); const on = open === b.id
        return <li key={b.id} className={cn('grid gap-2 border-t border-line px-4 py-2.5 text-13 first:border-t-0', on && 'rail bg-hover')} onClick={() => setOpen(on ? null : b.id)}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-12 text-faint">{n?.record_number}</span><span className="w-36 truncate font-medium text-fg">{n ? `${n.given_name} ${n.family_name}` : '…'}</span>
            <span className="flex items-center gap-1 font-mono tnum text-fg"><Phone aria-hidden className="size-3.5 text-faint" />{n?.phone_text ?? 'no phone'}</span>
            <span className="min-w-0 flex-1 truncate text-muted">{where(org, b)} · {placeWords(b, tz)}</span>
            {b.call ? <Tag tone={b.call.outcome === 'confirmed' ? 'ok' : 'warn'}>{OUTCOMES.find(([k]) => k === b.call!.outcome)?.[1]}</Tag> : null}
            {(!b.call || b.call.outcome === 'no_answer') && b.state === 'booked' && can('write:bookings.booking') && <span className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
              {OUTCOMES.map(([k, w]) => <Chip key={k} onClick={() => void say(b, k)}>{w}</Chip>)}</span>}
          </div>
          {on && t && <p className="ps-[3.25rem] text-12 text-muted">Tell the patient: {t.en}{t.ar && <Arabic className="ms-2 text-13">{t.ar}</Arabic>}</p>}
        </li> })}
    </ul></Card>
    <p className="text-12 text-faint">Each answer is a row of the pack's own, who and when. Will cancel cancels the booking (the patient asked) and frees the place; no answer
      can be tried again. Reminders by SMS or WhatsApp come later.</p>
  </>
}
