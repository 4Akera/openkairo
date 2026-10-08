// The vaccination room's own list (spec/openCare.md §5.7, Q26; picture #vax-room), in place of the queue there and a tab beside it in a
// clinic using the pack (rule 4: a list of work that is not places, calling and finishing itself). Due today: who is here (the room's
// visits), then the children due by the schedule not here yet; This week; Overdue · to call, with the phone number (a call is a note on
// the child's record); Given today. Every child the room knows has a dose recorded; due and overdue are worked out, never typed.
// + Walk-in (N): who, then what is due today as chips with the doses on the mother's card copied first; Start opens the visit with them.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useVisitQueue } from '@core/hooks/reads'
import { useDepartment } from '@core/hooks/organization'
import { newId, useWrite } from '@core/hooks/writes'
import { oneSet } from '@core/db/entries'
import type { Identity, QueueRow } from '@core/db/types'
import type { ScreenProps } from '@core/screens/registry'
import { Button, Callout, Card, Empty, Input, Kbd, ListRow, ListSection, ScreenFrame, Spinner, Tag, errorText, minutesSince, shortDate, ymd, type ScreenView } from '@core/ui'
import { rowDose, useRoomDoses } from './data'
import { addDays, ageWords, names, scheduleOf, statusOf, summaryOf, type Dose, type Schedule } from './schedule'
import { VaxWalkIn } from './WalkIn'

type View = 'today' | 'week' | 'late' | 'given'
interface Child { id: string; identity: Identity | null; doses: Dose[] }
const nameOf = (i: Identity | null) => i ? `${i.given.join(' ')} ${i.family ?? ''}`.trim() : 'Patient'
const phoneOf = (i: Identity | null) => i?.telecom.find((t) => t.system === 'phone')?.value ?? null
const sexOf = (i: Identity | null) => i?.gender === 'male' ? 'M' : i?.gender === 'female' ? 'F' : ''

/** a child's place in the room's lists today */
export function placeOf(s: Schedule, c: Pick<Child, 'identity' | 'doses'>, today: string) {
  const states = statusOf(s.rows, c.doses, c.identity?.birth_date, today); const sum = summaryOf(states)
  return { states, sum, dueNow: [...sum.overdue, ...sum.due], week: states.filter((x) => x.row.national && x.state === 'later' && x.dueOn <= addDays(today, 7)) }
}

export function VaccinesRoom({ dept }: ScreenProps) {
  const { org, can } = useDepartment(); const navigate = useNavigate(); const w = useWrite()
  const q = useVisitQueue(dept.id); const d = useRoomDoses(dept.id)
  const [view, setView] = useState<View>('today'); const [filter, setFilter] = useState(''); const [walkIn, setWalkIn] = useState(false)
  const [said, setSaid] = useState<string | null>(null); const [lateOpen, setLateOpen] = useState(false)
  const may = can('write:vaccines.dose')
  useEffect(() => {
    const k = (e: KeyboardEvent) => { const t = e.target as HTMLElement
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !t.closest('input, textarea, select, [contenteditable="true"]') && may) { e.preventDefault(); setWalkIn(true) } }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [may])
  const today = ymd(new Date().toISOString()); const sched = scheduleOf(org)
  const children = useMemo(() => { const m = new Map<string, Child>()
    for (const r of d.data?.rows ?? []) { const c = m.get(r.patient_id) ?? { id: r.patient_id, identity: d.data?.patients[r.patient_id] ?? null, doses: [] }; c.doses.push(rowDose(r)); m.set(r.patient_id, c) }
    return m }, [d.data])
  const here = (q.data?.rows ?? []).filter((r) => r.band !== 'pending')
  const hereIds = new Set(here.map((r) => r.patient.id))
  const f = filter.trim().toLowerCase()
  const match = (name: string, number: number | string | undefined, phone?: string | null) => !f || name.toLowerCase().includes(f) || String(number ?? '').startsWith(f) || (phone ?? '').replace(/\s/g, '').includes(f.replace(/\s/g, ''))
  const all = [...children.values()].map((c) => ({ c, p: placeOf(sched, c, today) }))
  const notHere = all.filter((x) => !hereIds.has(x.c.id) && x.p.sum.due.length > 0 && !x.p.sum.overdue.length).sort((a, b) => (a.p.sum.due[0]?.dueOn ?? '').localeCompare(b.p.sum.due[0]?.dueOn ?? ''))
  const late = all.filter((x) => !hereIds.has(x.c.id) && x.p.sum.overdue.length > 0).sort((a, b) => Math.max(...b.p.sum.overdue.map((s) => s.weeksLate)) - Math.max(...a.p.sum.overdue.map((s) => s.weeksLate)))
  const week = all.filter((x) => x.p.week.length > 0)
  const givenToday = all.filter((x) => x.c.doses.some((g) => g.status === 'completed' && g.source === 'here' && g.department_id === dept.id && ymd(g.given_at) === today))
  const views: ScreenView<View>[] = [{ id: 'today', label: 'Due today', count: here.length + notHere.length }, { id: 'week', label: 'This week', count: week.length },
    { id: 'late', label: 'Overdue · to call', count: late.length, needs: 'warn' }, { id: 'given', label: 'Given today', count: givenToday.length }]
  // a call about overdue doses is a note on the child's record
  const called = (c: Child, what: string) => w.mutate(oneSet([{ id: newId(), type: 'note', patient_id: c.id, department_id: dept.id, data: { kind: 'other', text: `Called ${phoneOf(c.identity) ?? ''} about overdue vaccines: ${what}`.replace(/\s+/g, ' ') } }]),
    { onSuccess: () => setSaid(`${nameOf(c.identity)}: the call is noted`) })
  const hereRow = (r: QueueRow) => { const c = children.get(r.patient.id); const p = c ? placeOf(sched, c, today) : null
    const due = p?.dueNow.length ? names(p.dueNow) : 'nothing recorded here yet'
    return <ListRow key={r.id} number={r.patient.record_number} name={`${r.patient.given_name} ${r.patient.family_name}`} age={`${ageWords(c?.identity?.birth_date, today) || r.patient.age} ${r.patient.sex[0]?.toUpperCase() ?? ''}`}
      status={<>{r.is_first && !c && <Tag tone="info">walk-in</Tag>}<span className="truncate">{due}</span></>}
      marks={p?.sum.overdue.length ? [{ key: 'late', word: `overdue ${Math.max(...p.sum.overdue.map((s) => s.weeksLate))} wk`, tone: 'warn' }] : []}
      who={r.band === 'consult' ? r.assignee_name : null} minutes={minutesSince(r.present_at ?? r.arrived_at)} onOpen={() => navigate(`/visit/${r.id}`)} /> }
  const childRow = (x: typeof all[number], what: string, more?: { marks?: { key: string; word: string; tone?: 'warn' }[]; who?: string | null; actions?: React.ReactNode }) =>
    <ListRow key={x.c.id} number={x.c.identity?.number ?? ''} name={nameOf(x.c.identity)} age={`${ageWords(x.c.identity?.birth_date, today)} ${sexOf(x.c.identity)}`} status={<span className="truncate">{what}</span>}
      marks={more?.marks} who={more?.who} actions={more?.actions} minutes={null} muted={!hereIds.has(x.c.id)} onOpen={() => navigate(`/patient/${x.c.id}`)} />
  const shown = <T extends { c: Child }>(xs: T[]) => xs.filter((x) => match(nameOf(x.c.identity), x.c.identity?.number, phoneOf(x.c.identity)))
  const loading = q.isLoading || d.isLoading
  const error = q.error ?? d.error
  return <ScreenFrame views={views} view={view} onView={setView}
    search={<Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Record number, name or phone" aria-label="Find a child" className="w-full sm:w-64" />}
    action={may ? <Button size="sm" variant="outline" onClick={() => setWalkIn(true)}><Plus />Walk-in<Kbd className="ms-1">N</Kbd></Button> : undefined}
    notice={said ? <Callout tone="accent" icon={false} role="status">✓ {said}</Callout> : w.error ? <p className="text-14 text-danger">{errorText(w.error)}</p> : undefined}>
    {walkIn && <VaxWalkIn dept={dept} schedule={sched} known={children} onClose={() => setWalkIn(false)} onStarted={(visitId) => { setWalkIn(false); navigate(`/visit/${visitId}`) }} />}
    {!sched.rows.length && <Callout tone="warn">No schedule is loaded yet: the national rows come by import (Settings → Packs → Vaccines).</Callout>}
    {loading ? <Spinner label="Loading the room" /> : error ? <p className="text-14 text-danger">{errorText(error)}</p> : <Card className="overflow-hidden"><ul>
      {view === 'today' && <>
        <ListSection title="Here" count={here.filter((r) => match(`${r.patient.given_name} ${r.patient.family_name}`, r.patient.record_number)).length}>
          {here.filter((r) => match(`${r.patient.given_name} ${r.patient.family_name}`, r.patient.record_number)).map(hereRow)}</ListSection>
        <ListSection title="Not here yet" count={shown(notHere).length}>{shown(notHere).map((x) => childRow(x, names(x.p.sum.due), { who: `due ${shortDate(x.p.sum.due[0].dueOn)}` }))}</ListSection>
        <ListSection title="Overdue · to call" count={shown(late).length} folded={!lateOpen} onToggle={() => setLateOpen(!lateOpen)}>
          {shown(late).map((x) => childRow(x, names(x.p.sum.overdue), { marks: [{ key: 'late', word: `overdue ${Math.max(...x.p.sum.overdue.map((s) => s.weeksLate))} wk`, tone: 'warn' }], who: phoneOf(x.c.identity) }))}</ListSection>
        {!here.length && !notHere.length && <li><Empty>Nobody is due today.</Empty></li>}
      </>}
      {view === 'week' && (shown(week).length ? shown(week).map((x) => childRow(x, names(x.p.week), { who: `due ${shortDate(x.p.week[0].dueOn)}` })) : <li><Empty>Nobody falls due this week.</Empty></li>)}
      {view === 'late' && (shown(late).length ? shown(late).map((x) => childRow(x, names(x.p.sum.overdue), { marks: [{ key: 'late', word: `overdue ${Math.max(...x.p.sum.overdue.map((s) => s.weeksLate))} wk`, tone: 'warn' }],
        who: phoneOf(x.c.identity), actions: may ? <Button size="xs" variant="outline" disabled={w.isPending} onClick={(e) => { e.stopPropagation(); called(x.c, names(x.p.sum.overdue)) }}>Called</Button> : undefined }))
        : <li><Empty>Nobody is overdue.</Empty></li>)}
      {view === 'given' && (shown(givenToday).length ? shown(givenToday).map((x) => childRow(x, x.c.doses.filter((g) => g.status === 'completed' && g.source === 'here' && ymd(g.given_at) === today)
        .map((g) => `${sched.rows.find((r) => r.vaccine === g.vaccine && r.dose === g.dose)?.name ?? g.vaccine}`).join(' · '))) : <li><Empty>Nothing given here today yet.</Empty></li>)}
    </ul></Card>}
    <p className="text-12 text-faint">Due and overdue come from each child&apos;s birth date, doses and the schedule&apos;s earliest age and interval; a dose too early is a notice, never a stop.</p>
  </ScreenFrame>
}
