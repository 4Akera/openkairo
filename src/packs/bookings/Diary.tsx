// The Diary (bookings.diary, spec/openCare.md §5.7; picture 6) of a clinic or a bench: a column per session of the day — each place
// (a time, or a number) free, booked, here, missed or cancelled, and today the walk-ins who came — by day or by week, everyone or one
// doctor. A place's card folds out under the diary, never over it: who, booked by whom and when, the note; Move… (the booking card,
// moving), Cancel… with a reason from the list, the chart. Book: find the patient, then the card.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus } from 'lucide-react'
import { useDepartment } from '@core/hooks/organization'
import { useVisitQueue } from '@core/hooks/reads'
import type { ScreenProps } from '@core/screens/registry'
import { Button, Callout, Card, Chip, Empty, Kbd, ScreenFrame, Spinner, Tag, cn, errorText, type Tone } from '@core/ui'
import { addDays, cancel, dayWords, REASONS, sessionsOf, timeWords, todayOf, useBookings, useBookingsDone, useBookingsLive, usePatients, type Booking, type Session } from './api'
import { capacityOf, dowOf, placesOf } from './logic'
import { BookCard } from './BookCard'
import { FindPatient } from './FindPatient'

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const TONE: Record<string, Tone> = { booked: 'info', here: 'accent', missed: 'danger', cancelled: 'neutral', 'walk-in': 'neutral' }

export function Diary({ dept }: ScreenProps) {
  const { org, can } = useDepartment(); useBookingsLive(org?.organization.id); const navigate = useNavigate(); const done = useBookingsDone()
  const tz = org?.organization.time_zone; const today = todayOf(tz)
  const [day, setDay] = useState(today); const [week, setWeek] = useState(false); const [doctor, setDoctor] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null); const [moving, setMoving] = useState(false); const [booking, setBooking] = useState(false)
  const [said, setSaid] = useState<string | null>(null); const [err, setErr] = useState<unknown>(null)
  const sessions = sessionsOf(org, dept.id).filter((s) => !doctor || !s.doctor_id || s.doctor_id === doctor)
  const doctors = [...new Set(sessionsOf(org, dept.id).map((s) => s.doctor_id).filter((x): x is string => !!x))]
  const from = week ? addDays(day, -((DOW.indexOf(dowOf(day)) + 1) % 7)) : day   // a week from Saturday
  const to = week ? addDays(from, 6) : day
  const q = useBookings(dept.id, { departments: [dept.id], from, to })
  const rows = useMemo(() => q.data?.bookings ?? [], [q.data])
  const queue = useVisitQueue(day === today && dept.work === 'visits' ? dept.id : null)
  const herein = new Set(rows.flatMap((b) => b.here?.visit_id ? [b.here.visit_id] : []))
  const walkIns = (queue.data?.rows ?? []).filter((r) => !herein.has(r.id))
  const names = usePatients(dept.id, rows.map((b) => b.patient_id))
  const nameOf = (id: string) => { const p = names.data?.[id]; return p ? `${p.given_name} ${p.family_name}` : '…' }
  const userName = (id: string | null | undefined) => org?.users.find((u) => u.id === id)?.name ?? null
  const placeName = (id: string | undefined) => org?.places.find((p) => p.id === id)?.name ?? null
  const picked = rows.find((b) => b.id === open)
  const doCancel = async (b: Booking, reason: string) => { setErr(null); try { await cancel(dept.id, b.id, reason); done(); setOpen(null); setSaid(`${nameOf(b.patient_id)} · cancelled (${reason})`) } catch (e) { setErr(e) } }

  // a place that has gone by with nobody in it says nothing more (a day before today, or a time today before now)
  const [now, setNow] = useState(() => Date.now()); useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t) }, [])
  const nowHm = timeWords(new Date(now).toISOString(), tz)
  const gone = (s: Session, at: string) => day < today || (day === today && (s.how === 'number' ? s.to <= nowHm : at < nowHm))
  const column = (s: Session) => { const places = placesOf(s, day, rows, tz); const taken = places.filter((x) => x.b.some((b) => b.state !== 'cancelled')).length
    const how = s.how === 'number' ? `by number · ${s.from}–${s.to} · ${taken} of ${s.places} taken` : `by time · every ${s.every} min · ${s.from}–${s.to} · ${places.length - taken} free`
    return <Card key={s.id} className="grid content-start overflow-hidden">
      <div className="border-b border-line bg-surface px-3 py-2"><p className="text-14 font-semibold text-fg">{[userName(s.doctor_id) ?? s.name, placeName(s.place_id)].filter(Boolean).join(' · ')}</p>
        <p className="text-12 text-muted">{s.name.toLowerCase()} · {how}</p></div>
      <ul>{places.map((x) => x.b.length ? x.b.map((b) => <li key={b.id}><button type="button" onClick={() => { setOpen(open === b.id ? null : b.id); setMoving(false) }}
          className={cn('flex w-full items-center gap-2 border-t border-line px-3 py-1.5 text-start text-13 first:border-t-0 hover:bg-hover focus-ring', open === b.id && 'rail bg-hover')}>
          <span className="w-12 shrink-0 font-mono text-12 tnum text-muted">{x.at}</span>
          <span className={cn('min-w-0 flex-1 truncate', b.state === 'cancelled' ? 'text-faint line-through' : 'text-fg')}>{nameOf(b.patient_id)}{b.service && <span className="text-faint"> · {b.service}</span>}</span>
          <Tag tone={TONE[b.state]}>{b.state}</Tag></button></li>)
        : <li key={x.at} className="flex items-center gap-2 border-t border-line px-3 py-1.5 text-13 text-faint first:border-t-0"><span className="w-12 shrink-0 font-mono text-12 tnum">{x.at}</span>
            {gone(s, x.at) ? '—' : 'free'}</li>)}
</ul>
    </Card> }

  const daySessions = sessions.filter((s) => s.days.includes(dowOf(day)))
  return <ScreenFrame filters={<span className="flex flex-wrap items-center gap-1.5"><Chip on={!week} onClick={() => setWeek(false)}>Day</Chip><Chip on={week} onClick={() => setWeek(true)}>Week</Chip>
      {doctors.length > 0 && <><span className="mx-1 h-6 w-px bg-line" /><Chip on={!doctor} onClick={() => setDoctor(null)}>Everyone</Chip>
        {doctors.map((d) => <Chip key={d} on={doctor === d} onClick={() => setDoctor(d)}>{userName(d) ?? 'a doctor'}</Chip>)}</>}</span>}
    date={<span className="flex items-center gap-2 text-14"><Button size="sm" variant="ghost" aria-label="Before" onClick={() => setDay(addDays(day, week ? -7 : -1))}>←</Button>
      <b className="font-semibold text-fg">{week ? `${dayWords(from)} – ${dayWords(to)}` : `${dayWords(day)}${day === today ? ' · today' : ''}`}</b>
      <Button size="sm" variant="ghost" aria-label="After" onClick={() => setDay(addDays(day, week ? 7 : 1))}>→</Button>
      {day !== today && <Button size="sm" variant="ghost" onClick={() => setDay(today)}>Today</Button>}</span>}
    action={can('write:bookings.booking') && dept.work === 'visits' && <Button size="sm" aria-expanded={booking} onClick={() => { setBooking(!booking); setSaid(null) }}><CalendarPlus />Book<Kbd className="ms-1 max-sm:hidden">B</Kbd></Button>}
    notice={said && <Callout key={said} tone="accent" icon={false} role="status">✓ {said}</Callout>}>
    {booking && <Card className="p-4 ring-1 ring-accent-line"><FindPatient onClose={() => setBooking(false)}>{(pt) =>
      <BookCard from={dept} patientId={pt.id} onCancel={() => setBooking(false)} onDone={(x) => { setBooking(false); setSaid(`${pt.given_name} ${pt.family_name} · ${x}`) }} />}</FindPatient></Card>}
    {!sessionsOf(org, dept.id).length ? <Card><Empty>No sessions yet: Settings → Departments → {dept.name} → Sessions.</Empty></Card>
      : q.isLoading ? <Spinner label="Reading the diary" /> : q.error ? <Callout tone="danger" title="Not loaded">{errorText(q.error)}</Callout>
      : week ? <WeekTable from={from} sessions={sessions} rows={rows} onDay={(d) => { setDay(d); setWeek(false) }} />
      : daySessions.length ? <div className="grid gap-3 md:grid-cols-2">{daySessions.map(column)}
          {walkIns.length > 0 && <Card className="grid content-start overflow-hidden"><div className="border-b border-line bg-surface px-3 py-2"><p className="text-14 font-semibold text-fg">Walk-ins today</p>
            <p className="text-12 text-muted">checked in with no booking · {walkIns.length}</p></div>
            <ul>{walkIns.map((r) => <li key={r.id} className="flex items-center gap-2 border-t border-line px-3 py-1.5 text-13 first:border-t-0">
              <span className="min-w-0 flex-1 truncate text-fg">{r.patient.given_name} {r.patient.family_name}</span><Tag>walk-in</Tag></li>)}</ul></Card>}</div>
        : <Card><Empty>No session on {dayWords(day)}.</Empty></Card>}
    {picked && !week && <Card className="grid gap-2 p-3 ring-1 ring-accent-line">
      <p className="flex flex-wrap items-center gap-2 text-13"><b className="font-semibold text-fg">{picked.number != null ? `No. ${picked.number}` : timeWords(picked.starts_at, tz)} · {nameOf(picked.patient_id)}</b>
        <span className="text-muted">{names.data?.[picked.patient_id]?.phone_text ?? ''} · booked by {userName(picked.author_id) ?? '—'} on {dayWords(todayOf(tz, new Date(picked.at)))}{picked.note ? ` · note: ${picked.note}` : ''}</span>
        {picked.cancelled && <Tag>cancelled: {picked.cancelled.reason}</Tag>}</p>
      {picked.state === 'booked' && can('write:bookings.booking') && !moving && <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setMoving(true)}>Move…</Button>
        <span className="text-12 text-faint">Cancel:</span>{REASONS.map((r) => <Chip key={r} onClick={() => void doCancel(picked, r)}>{r}</Chip>)}
        <Button size="sm" variant="ghost" onClick={() => navigate(`/patient/${picked.patient_id}`)}>Open chart</Button></div>}
      {moving && <BookCard from={dept} patientId={picked.patient_id} moving={picked} onCancel={() => setMoving(false)}
        onDone={(x) => { setMoving(false); setOpen(null); setSaid(`${nameOf(picked.patient_id)} · ${x}`) }} />}
      {!!err && <Callout tone="danger" title="Not cancelled">{errorText(err)}</Callout>}
      <p className="text-12 text-faint">The place's card folds out under the diary, never over it. Move and Cancel keep who and when; nothing is ever changed in place.</p>
    </Card>}
  </ScreenFrame>
}

/** a week: a row a session, a column a day, how many are booked of how many */
function WeekTable({ from, sessions, rows, onDay }: { from: string; sessions: Session[]; rows: Booking[]; onDay: (d: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  return <Card className="overflow-x-auto"><table className="w-full text-13"><thead><tr className="border-b border-line text-12 text-faint">
    <th className="px-3 py-2 text-start font-medium">Session</th>{days.map((d) => <th key={d} className="px-2 py-2 text-start font-medium"><button type="button" className="hover:text-accent" onClick={() => onDay(d)}>{dayWords(d)}</button></th>)}</tr></thead>
    <tbody>{sessions.map((s) => <tr key={s.id} className="border-t border-line"><td className="px-3 py-2 font-medium text-fg">{s.name}</td>
      {days.map((d) => { const on = s.days.includes(dowOf(d)); const n = rows.filter((b) => b.session_id === s.id && b.day === d && b.state !== 'cancelled').length
        const cap = capacityOf(s)
        return <td key={d} className="px-2 py-2 tnum">{on ? <span className={n >= cap ? 'font-medium text-warn' : 'text-fg'}>{n} of {cap}</span> : <span className="text-faint">—</span>}</td> })}</tr>)}</tbody></table></Card>
}
