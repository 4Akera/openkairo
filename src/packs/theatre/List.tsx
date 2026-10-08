// The theatre list (theatre.list, spec/openCare.md §5.7, Q42; the picture #theatre-list): the theatre pack's own screen and the
// Theatre's only one for this work (rule 4). Rooms as chips, the day with ← →; emergencies on top until a room takes them; each room's
// cases in the order put (time, patient, the operation and its side, surgeon and anaesthetist, ASA, where it stands, the checklist's
// parts, the next key: Send for, Arrived, Sign in, Time out, Sign out, Out, Back); then To schedule by priority and weeks waiting, with
// the sessions that have room for the case's usual time. Pre-op and consent are read from the record and only shown: a case not ready
// can still be scheduled. Each step is the Theatre's own step on the order; the checklist opens on the case (Checklist.tsx).
import { useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDepartment } from '@core/hooks/organization'
import { useRequestQueue } from '@core/hooks/reads'
import { refresh } from '@core/hooks/writes'
import { answerEntry, oneSet } from '@core/db/entries'
import { write } from '@core/db/rpc'
import type { RequestQueueRow } from '@core/db/types'
import type { ScreenProps } from '@core/screens/registry'
import { ageSex, groupByPatient } from '@core/screens/bench/shared'
import { benchMarkRow } from '@core/screens/marks'
import { packRowOf } from '@core/screens/rows'
import { usePackRows } from '@core/screens/useRows'
import { Button, Card, Chip, Empty, Kbd, ScreenFrame, Spinner, Tag, cn, errorText, hm } from '@core/ui'
import { STEP_TONE, STEP_WORD, byPosition, dayWords, freeSessions, freeWords, nextOf, priorityWord, roomsOf, operationsOf, toSchedule, waiting, SIDE_WORD, type Part, type StepKey } from './model'
import { aboutOf, useAbout, useTable, type CaseRow, type CheckRow, type SlotRow } from './data'
import { Checklist } from './Checklist'

const Side = ({ s }: { s: string }) => <span className="rounded-sm bg-accent-soft px-1 text-11 font-semibold uppercase tracking-wide text-accent">{s}</span>
const td = 'px-2 py-2'
const cols: [string, string][] = [['Time', '3.5rem'], ['Patient', '9rem'], ['Operation', ''], ['Surgeon · anaesthetist', '10rem'], ['ASA', '2.75rem'], ['Where it stands', '12.5rem'], ['Checklist', '10.5rem'], ['', '6.5rem']]
const localDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA')
export interface Case { r: RequestQueueRow; c: CaseRow | undefined; slot: SlotRow | null; parts: Set<Part>; about: ReturnType<typeof aboutOf> }

function Parts({ done }: { done: Set<Part> }) {
  return <span className="flex gap-1">{([['sign_in', 'In'], ['time_out', 'Time out'], ['sign_out', 'Out']] as const).map(([k, l]) =>
    <span key={k} className={cn('whitespace-nowrap rounded-sm px-1 text-11', done.has(k) ? 'bg-ok-soft font-medium text-ok' : 'text-faint ring-1 ring-inset ring-line')}>{done.has(k) && '✓ '}{l}</span>)}</span>
}

export function TheatreList({ dept }: ScreenProps) {
  const { org, can } = useDepartment(); const qc = useQueryClient()
  const q = useRequestQueue(dept.id)
  const [room, setRoom] = useState<string | null>(null); const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState<string | null>(null); const [sched, setSched] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null)
  const day = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString('en-CA') }, [offset])
  const rows = useMemo(() => { const m = new Map<string, RequestQueueRow>(); for (const r of [...(q.data?.requests ?? []), ...(q.data?.recent ?? [])]) if (!m.has(r.item)) m.set(r.item, r); return [...m.values()] }, [q.data])
  const ids = rows.map((r) => r.item)
  const cases = useTable<CaseRow>('theatre.cases', dept.id, { item: ids }, ids.length > 0)
  const slots = useTable<SlotRow>('theatre.slots', dept.id, { op: ids }, ids.length > 0)
  const checks = useTable<CheckRow>('theatre.checks', dept.id, { op: ids }, ids.length > 0)
  const about = useAbout(dept.id, ids)
  // the packs' words on each case (the department's packs: a pre-op's ASA and verdict, a bill), as the bench draws them
  const packs = usePackRows('screen', useMemo(() => rows.map((r) => packRowOf(r.item, benchMarkRow(groupByPatient([r])[0]))), [rows]), dept)
  const prOf = (x: Case) => packRowOf(x.r.item, benchMarkRow(groupByPatient([x.r])[0]))
  const { rooms, sessions } = roomsOf(org, dept.id); const ops = operationsOf(org, dept.id)
  const all: Case[] = rows.map((r) => ({ r, c: cases.data?.find((x) => x.item === r.item), slot: slots.data?.find((x) => x.op === r.item) ?? null,
    parts: new Set((checks.data ?? []).filter((x) => x.op === r.item).map((x) => x.part)), about: aboutOf(about.get(r.item) ?? [], r.item) }))
  const open_ = all.filter((x) => x.r.order.status !== 'revoked' && x.r.order.status !== 'cancelled')
  const placed = (x: Case) => !!x.slot?.room && !!x.slot.starts
  const emergencies = open_.filter((x) => x.r.order.priority === 'stat' && !placed(x) && x.r.order.status !== 'completed')
  const onDay = (name: string) => byPosition(open_.filter((x) => placed(x) && x.slot!.room === name && localDay(x.slot!.starts!) === day))
  const todo = toSchedule(open_.filter((x) => !placed(x) && x.r.order.priority !== 'stat' && x.r.order.status !== 'completed').map((x) => ({ ...x, priority: x.r.order.priority, ordered_at: x.r.order.ordered_at })))
  const usual = (x: Case) => x.c?.usual_min ?? ops.find((o) => o.code === x.r.order.service_code)?.usual_min ?? 60
  const step = (x: Case) => (x.slot?.step ?? null) as StepKey | null
  const mayMove = can('write:theatre.step')

  async function move(x: Case, to: StepKey, at?: { room: string; starts: string; position: number }) {
    setBusy(true); setErr(null)
    try {
      const keep = at ?? { room: x.slot?.room ?? '', starts: x.slot?.starts ?? '', position: x.slot?.position ?? 0 }
      const theatre = { op: x.r.item, ...(keep.room ? { room: keep.room } : {}), ...(keep.starts ? { starts: new Date(keep.starts).toISOString() } : {}), position: keep.position }
      await write(oneSet([answerEntry(x.r, dept.id, { type: 'theatre.step', data: { status: to === 'back' ? 'completed' : 'in-progress', step: to, theatre } } as never)]))
      refresh(qc); await qc.invalidateQueries({ queryKey: ['theatre.slots'] }); setSched(null)
    } catch (e) { setErr(errorText(e)) } finally { setBusy(false) }
  }
  const act = (x: Case) => { const n = nextOf(step(x), x.parts); if (!n) return
    if (n.part) setOpen(x.r.item); else if (n.step) void move(x, n.step); else setSched(x.r.item) }

  const opened = all.find((x) => x.r.item === open)
  if (opened) return <Checklist dept={dept} x={opened} usual={usual(opened)} onClose={() => setOpen(null)} />

  const roomCard = (name: string, sub: ReactNode, list: Case[]) => <Card key={name} className="overflow-x-auto">
    <p className="flex flex-wrap items-baseline gap-2 px-3 pt-3"><b className="text-14 font-semibold text-fg">{name}</b><span className="text-12 text-muted">{sub}</span></p>
    {list.length === 0 ? <Empty size="sm" className="py-3">No cases</Empty> : <table className="mt-1 w-full table-fixed border-collapse text-13"><colgroup>{cols.map(([h, w]) => <col key={h} style={w ? { width: w } : undefined} />)}</colgroup>
      <thead><tr>{cols.map(([h]) => <th key={h} className="px-2 py-1.5 text-start text-11 font-semibold uppercase tracking-[0.06em] text-faint">{h}</th>)}</tr></thead>
      <tbody>{list.map((x) => { const st = step(x); const n = nextOf(st, x.parts); const t = x.about.times
        const since = st === 'recovery' ? `since ${x.slot?.at ? hm(x.slot.at) : ''}${t?.knife && t?.end ? ` · knife ${t.knife}–${t.end}` : ''}` : st === 'operating' && t?.knife ? `knife ${t.knife}`
          : st === 'anaesthetic' && t?.start ? `since ${t.start}` : st === 'scheduled' || !st ? (x.c?.stay === 'day' ? 'day case' : x.r.order.priority === 'stat' ? `asked ${hm(x.r.order.ordered_at)}` : '') : x.slot?.at ? hm(x.slot.at) : ''
        return <tr key={x.r.item} className="border-t border-line align-top">
          <td className={cn(td, 'font-mono text-12 text-muted tnum')}>{x.slot?.starts ? hm(x.slot.starts) : '—'}</td>
          <td className={td}><span className="block font-medium text-fg">{x.r.patient.given_name} {x.r.patient.family_name}</span><span className="text-12 text-muted">{ageSex(x.r.patient)}</span>{packs.marks(prOf(x)).map((m) => <Tag key={m.key} tone={m.tone}>{m.word}</Tag>)}</td>
          <td className={td}><span className="flex flex-wrap items-center gap-1.5 text-fg">{x.r.order.priority === 'stat' && <Tag tone="danger">emergency</Tag>}{x.c?.name ?? x.r.service_name}{SIDE_WORD(x.c?.side) && <Side s={x.c!.side!} />}</span></td>
          <td className={cn(td, 'text-12')}><span className="block text-fg">{x.c?.surgeon ?? '—'}</span><span className="text-muted">{x.about.anaesthetist ?? ''}</span></td>
          <td className={cn(td, 'text-fg tnum')}>{x.about.asa ?? packs.buttons(prOf(x)) ?? '—'}</td>
          <td className={td}><Tag tone={st ? STEP_TONE[st] : x.r.order.priority === 'stat' ? 'warn' : undefined}>{st ? STEP_WORD[st] : 'waiting'}</Tag><span className="block text-12 text-muted">{since}</span></td>
          <td className={td}><Parts done={x.parts} /></td>
          <td className={cn(td, 'text-end')}>{n && mayMove && n.word !== 'Schedule' && <Button size="sm" variant="outline" disabled={busy} onClick={() => act(x)}>{n.word}</Button>}
            {n?.word === 'Schedule' && mayMove && <Button size="sm" variant="outline" onClick={() => setSched(x.r.item)}>Schedule</Button>}</td>
        </tr> })}{list.map((x) => { const b = packs.below(prOf(x)); return b ? <tr key={`${x.r.item}:below`}><td colSpan={cols.length}>{b}</td></tr> : null })}</tbody></table>}
  </Card>

  const shownRooms = rooms.filter((r) => !room || r.name === room)
  const wd = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[new Date(`${day}T12:00:00`).getDay()]
  const scheduling = all.find((x) => x.r.item === sched)
  const booked = new Map<string, number>()
  for (const x of open_.filter(placed)) { const k = `${x.slot!.room}|${localDay(x.slot!.starts!)}`; booked.set(k, (booked.get(k) ?? 0) + usual(x)) }
  // an emergency goes into a room today, next; an elective into the next session with room for its usual time
  const nowHm = new Date().toTimeString().slice(0, 5); const today = new Date().toLocaleDateString('en-CA')
  const free = !scheduling ? [] : scheduling.r.order.priority === 'stat'
    ? rooms.map((r) => ({ day: today, weekday: wd, room: r.name, from: nowHm, free: 0, starts: new Date().toISOString() }))
    : freeSessions(sessions, usual(scheduling), booked, null)
  return <ScreenFrame filters={<span className="flex flex-wrap gap-1.5">{[null, ...rooms.map((r) => r.name)].map((r) => <Chip key={r ?? 'all'} shape="pill" on={room === r} onClick={() => setRoom(r)}>{r ?? 'All rooms'}</Chip>)}</span>}
    date={<span className="flex items-center gap-2 text-14"><Button size="sm" variant="ghost" onClick={() => setOffset((n) => n - 1)}>←</Button>
      <b className="font-semibold text-fg">{dayWords(day)}{offset === 0 ? ' · today' : ''}</b><Button size="sm" variant="ghost" onClick={() => setOffset((n) => n + 1)}>→</Button></span>}
    notice={err && <p className="text-14 text-danger">{err}</p>}>
    {q.isLoading ? <Spinner /> : <>
      {emergencies.length > 0 && roomCard('Emergency · not yet in a room', 'an /op marked emergency, from the ER or a ward', emergencies)}
      {scheduling && scheduling.r.order.priority === 'stat' && <Card className="flex flex-wrap items-center gap-2 p-3"><span className="text-13 text-fg">{scheduling.r.patient.given_name} {scheduling.r.patient.family_name} · into a room now:</span>
        {free.map((f) => <Button key={f.room} size="sm" variant="outline" disabled={busy} onClick={() => void move(scheduling, 'scheduled', { room: f.room, starts: f.starts, position: 0 })}>{f.room}</Button>)}</Card>}
      {shownRooms.map((r) => { const list = onDay(r.name); const s = sessions.find((x) => x.room === r.name && x.weekday === wd)
        const used = list.reduce((n, x) => n + usual(x), 0)
        const sub = [r.specialty, s ? `${s.from}–${s.to}` : 'no session today', `${list.length} case${list.length === 1 ? '' : 's'}`, s && list.length ? `${Math.floor(used / 60)} h ${used % 60} booked` : ''].filter(Boolean).join(' · ')
        return roomCard(r.name, sub, list) })}
      <Card className="grid gap-1 p-3"><p className="flex flex-wrap items-baseline gap-2"><b className="text-14 font-semibold text-fg">To schedule</b><span className="text-12 text-muted">{todo.length} · by priority, then weeks waiting</span></p>
        {todo.length === 0 ? <Empty size="sm">Nothing to schedule</Empty> : <table className="w-full text-13"><thead><tr>{['Patient', 'Operation', 'Priority', 'Surgeon', 'Waiting', 'Pre-op', 'Consent', 'Stay', ''].map((h) =>
          <th key={h} className="px-2 py-1.5 text-start text-11 font-semibold uppercase tracking-[0.06em] text-faint">{h}</th>)}</tr></thead>
          <tbody>{todo.map((x) => <tr key={x.r.item} className="border-t border-line align-top">
            <td className={td}><b className="font-medium">{x.r.patient.given_name} {x.r.patient.family_name} <span className="font-normal text-muted">{ageSex(x.r.patient)}</span></b></td>
            <td className={td}>{x.c?.name ?? x.r.service_name}{SIDE_WORD(x.c?.side) && <> <Side s={x.c!.side!} /></>}</td>
            <td className={td}>{x.priority === 'routine' ? 'elective' : <Tag tone="warn">{priorityWord(x.priority)}</Tag>}</td>
            <td className={td}>{x.c?.surgeon ?? '—'}</td><td className={cn(td, 'tnum')}>{waiting(x.ordered_at)}</td>
            <td className={td}>{packs.buttons(prOf(x)) ?? (x.about.fit ? <span className={x.about.fit === 'fit' ? 'text-ok' : 'text-warn'}>{x.about.fit}{x.about.asa ? ` · ASA ${x.about.asa}` : ''}</span> : <span className="text-muted">not yet seen</span>)}</td>
            <td className={td}>{x.about.consent ? 'scanned' : <span className="text-warn">to scan</span>}</td>
            <td className={td}>{x.c?.stay === 'day' ? 'day case' : x.c?.stay ?? '—'}</td>
            <td className={cn(td, 'text-end')}>{mayMove && <Button size="sm" variant={sched === x.r.item ? 'primary' : 'outline'} onClick={() => setSched(sched === x.r.item ? null : x.r.item)}>Schedule</Button>}</td></tr>)}
            {todo.map((x) => { const b = packs.below(prOf(x)); return b ? <tr key={`${x.r.item}:below`}><td colSpan={9}>{b}</td></tr> : null })}</tbody></table>}
        {scheduling && scheduling.r.order.priority !== 'stat' && <div className="grid gap-2 rounded-lg border border-line bg-sunken p-3">
          <p className="text-13 text-fg"><b className="font-medium">{scheduling.r.patient.given_name} {scheduling.r.patient.family_name}</b> · usual time {usual(scheduling)} min · sessions with that much free:</p>
          {free.length === 0 ? <p className="text-13 text-muted">No session in the next two weeks has room; the rooms and sessions are the Theatre's settings.</p>
            : <div className="flex flex-wrap gap-2">{free.map((f) => <Button key={f.starts} size="sm" variant="outline" disabled={busy}
              onClick={() => void move(scheduling, 'scheduled', { room: f.room, starts: f.starts, position: open_.filter((y) => placed(y) && y.slot!.room === f.room && localDay(y.slot!.starts!) === f.day).length })}>
              {dayWords(f.day)} · {f.room} · {f.from}{f.free > 0 && <span className="ms-2 text-12 text-muted">{freeWords(f)}</span>}</Button>)}</div>}
          <p className="flex flex-wrap items-center gap-2 text-12 text-faint">The case leaves To schedule; the chart's order line reads “scheduled”; the desk phones the patient.<Kbd>↵</Kbd></p></div>}
      </Card>
      <p className="text-12 text-faint">The Theatre's only screen for this work. Each case is an /op order; where it stands is the Theatre's step on it. ASA, the pre-op and consent are read from the record and only shown: a case not ready can still be scheduled. The rooms and sessions are the Theatre's settings.</p>
    </>}
  </ScreenFrame>
}
