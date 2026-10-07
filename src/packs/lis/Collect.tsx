// Collect (lis.collect, spec/openCare.md §5.3; the picture "Lab · collecting"): the laboratory's first screen, in place of the bench.
// Its views are counted filters — To collect (nothing done yet), Collected (results to come), Couldn't collect (today, with why). A row
// is one patient: the tests, stat, a walk-in, where they are. Collect folds out the sample number (one per patient, written on each
// tube until labels print), the tubes by colour with the tests drawn into each, fasting asked where it matters, then Collected — a
// collected step on each order, carrying the sample number — or Couldn't collect with a reason the doctor sees. + Walk-in as on any
// bench, with the laboratory's own second step (Step.tsx). A tube Receive rejected comes back to To collect, "new sample" and why.
// With collection chairs (the large lab's switch): each collector picks a chair (kept in this browser), every patient's tests of the
// day get a ticket number in the order they came (lis.tickets), Call next calls the next with no chair (stat first) to mine, and my
// chair's card holds who I called, ready to collect.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Plus } from 'lucide-react'
import { useDepartment } from '@core/hooks/organization'
import { useRequestQueue } from '@core/hooks/reads'
import { refresh } from '@core/hooks/writes'
import { answerEntry, oneSet } from '@core/db/entries'
import { packOp, write, type EntryIn } from '@core/db/rpc'
import type { RequestQueueRow } from '@core/db/types'
import type { ScreenProps } from '@core/screens/registry'
import { ageSex, groupByPatient, matches, testsLine, type PatientGroup } from '@core/screens/bench/shared'
import { isWalkIn } from '@core/screens/bench/walkins'
import { WalkIn } from '@core/screens/bench/WalkIn'
import { Button, Callout, Card, Chip, Empty, Input, Kbd, ListRow, ScreenFrame, Segmented, Spinner, Tag, errorText, hm, minutesSince, type ScreenView } from '@core/ui'
import { needsFasting, tubesFor } from './tubes'
import { byArrival, largeOf, nextUp, nowAt, ticketOf, type Ticket } from './large'

type View = 'todo' | 'collected' | 'not'
const REASONS = ['Refused', 'No vein', 'Not fasting', 'Left']
/** collected: any step reached (collected, received) */
const started = (r: RequestQueueRow) => !!r.order.step_key || (!!r.request?.step && r.request.step !== 'sent')
/** to collect: nothing done yet, or sent back for a new sample (held, with why) */
const toCollect = (r: RequestQueueRow) => !started(r) || r.order.status === 'on-hold'

/** my chair in this laboratory, kept in this browser (none: all chairs) */
function useChair(deptId: string, chairs: number): [number | null, (n: number | null) => void] {
  const key = `opencare.lis.chair.${deptId}`
  const [c, setC] = useState<number | null>(() => { try { const v = Number(localStorage.getItem(key)); return v >= 1 ? v : null } catch { return null } })
  const set = (n: number | null) => { setC(n); try { if (n) localStorage.setItem(key, String(n)); else localStorage.removeItem(key) } catch { /* storage blocked: kept for now only */ } }
  return [c && c <= chairs ? c : null, set]
}

/** a tube's cap, its colour by the laboratory's own code and never alone (its word beside it) */
export const Cap = ({ cap, big }: { cap: string; big?: boolean }) =>
  <span aria-hidden className={big ? 'inline-block h-5 w-3.5 shrink-0 rounded-sm ring-1 ring-inset ring-line-strong' : 'inline-block h-3.5 w-2.5 shrink-0 rounded-sm ring-1 ring-inset ring-line-strong'}
    style={{ background: `var(--tube-${cap})` }} />

export function Collect({ dept }: ScreenProps) {
  const q = useRequestQueue(dept.id); const qc = useQueryClient(); const { org, can } = useDepartment()
  const [view, setView] = useState<View>('todo'); const [find, setFind] = useState(''); const [open, setOpen] = useState<string | null>(null)
  const [walkIn, setWalkIn] = useState(false); const [said, setSaid] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null)
  const [fasting, setFasting] = useState<boolean | null>(null); const [why, setWhy] = useState<string | null>(null)
  const large = largeOf(org, dept.id); const [chair, setChair] = useChair(dept.id, large.chairs)
  const f = find.trim().toLowerCase()
  const rows = q.data?.requests ?? []
  const waiting = groupByPatient(rows.filter(toCollect))
  // the tickets: each patient waiting, numbered in the order they came (a patient keeps theirs; a test asked for later joins it)
  const order = byArrival(waiting).map((g) => g.rows.map((r) => r.item))
  const tickets = useQuery({ queryKey: ['lis.tickets', dept.id, order.map((x) => x.join(',')).join('|')], enabled: large.chairs > 0 && order.length > 0,
    queryFn: async () => (await packOp<{ tickets: Ticket[] }>('lis.tickets', dept.id, { groups: order })).tickets })
  const ts = tickets.data ?? []
  const numberOf = (g: PatientGroup) => ticketOf(g, ts)?.number
  const hit = (g: PatientGroup) => matches(g.patient, f) || (!!f && `#${numberOf(g) ?? ''}` === (f.startsWith('#') ? f : `#${f}`))
  const now = chair ? nowAt(chair, waiting, ts) : null
  const next = chair ? nextUp(waiting, ts) : null
  const todo = waiting.filter((g) => hit(g) && g.patient.id !== now?.group.patient.id)
  const collected = groupByPatient(rows.filter((r) => started(r) && r.order.status !== 'on-hold')).filter((g) => matches(g.patient, f))
  const couldnt = (q.data?.recent ?? []).filter((r) => r.order.status === 'cancelled' && matches(r.patient, f))
  const views: ScreenView<View>[] = [{ id: 'todo', label: 'To collect', count: waiting.length, needs: 'warn' }, { id: 'collected', label: 'Collected', count: collected.length },
    { id: 'not', label: "Couldn't collect", count: couldnt.length }]
  const serviceOf = (r: RequestQueueRow) => org?.services.find((s) => s.id === r.order.service_id)
  // the open patient's number: the laboratory's for these orders (the same on every screen until collected), a new one for a tube sent back
  const openG = waiting.find((g) => g.patient.id === open)
  const items = openG?.rows.map((r) => r.item) ?? []; const rejected = openG?.rows.find((r) => r.order.status === 'on-hold')?.step_data?.specimen
  const sample = useQuery({ queryKey: ['lis.sample', dept.id, open, items.join(','), rejected], enabled: !!openG && view === 'todo', staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => packOp<{ sample: string }>('lis.sample', dept.id, { items, not: rejected }) })
  const toggle = (pid: string) => { setOpen(open === pid ? null : pid); setFasting(null); setWhy(null); setError(null) }
  // call a ticket to my chair (take: one another chair called), and open it to collect
  const call = async (t: Ticket, g: PatientGroup, take = false) => {
    setBusy(`call ${t.number}`); setError(null)
    try { await packOp('lis.call', dept.id, { number: t.number, chair, take }); await tickets.refetch(); setOpen(g.patient.id); setFasting(null); setWhy(null); setSaid(`#${t.number} · ${g.patient.given_name} ${g.patient.family_name} → Chair ${chair}`) }
    catch (x) { setSaid(null); setError(errorText(x)); void tickets.refetch() } finally { setBusy(null) }
  }
  const land = async (g: PatientGroup, items: EntryIn[], words: string) => {
    setBusy(g.patient.id); setError(null)
    // the number went on these tubes: a new sample (one sent back) gets a new one
    try { await write(oneSet(items)); qc.removeQueries({ queryKey: ['lis.sample', dept.id, g.patient.id] }); setOpen(null); setSaid(words); refresh(qc) }
    catch (x) { setError(errorText(x)) } finally { setBusy(null) }
  }
  const collect = (g: PatientGroup, n: string) => land(g, g.rows.map((r) => answerEntry(r, dept.id, { type: 'step', data: { status: 'in-progress',
    ...(serviceOf(r)?.steps.includes('collected') ? { step: 'collected' } : {}), specimen: n, ...(fasting === false ? { note: 'not fasting' } : {}) } })),
    `${g.patient.given_name} ${g.patient.family_name} · ${n}: write it on each tube`)
  const notCollected = (g: PatientGroup, reason: string) => land(g, g.rows.map((r) => answerEntry(r, dept.id, { type: 'step', data: { status: 'cancelled', reason } })),
    `${g.patient.given_name} ${g.patient.family_name}: not collected (${reason.toLowerCase()}) — the doctor sees why`)

  const row = (g: PatientGroup) => {
    const isOpen = open === g.patient.id; const walk = g.rows.some((r) => isWalkIn(r.order, org?.allDepartments ?? []))
    const ward = g.rows.some((r) => org?.allDepartments.find((d) => d.id === r.order.from_department_id)?.work === 'stays')
    const back = g.rows.find((r) => r.order.status === 'on-hold'); const t = view === 'todo' ? ticketOf(g, ts) : undefined
    const elsewhere = t?.chair != null && t.chair !== chair
    return [<ListRow key={g.patient.id} number={g.patient.record_number} name={`${g.patient.given_name} ${g.patient.family_name}`} age={ageSex(g.patient)} selected={isOpen}
      status={<>{t && <span className="font-mono text-12 font-semibold text-fg">#{t.number}</span>}{t?.chair != null && <Tag tone="accent">Chair {t.chair}</Tag>}
        {g.priority !== 'routine' && <Tag tone="danger">{g.priority}</Tag>}{back && <Tag tone="warn">new sample</Tag>}{walk && <Tag tone="info">walk-in</Tag>}{ward && <Tag>at the ward</Tag>}
        <span className="truncate">{back?.step_data?.reason ? `${back.step_data.reason} · ` : ''}{testsLine(g.rows)}</span></>}
      who={g.rows[0]?.from_department_name ?? undefined} minutes={g.since ? minutesSince(g.since) : null} onOpen={() => toggle(g.patient.id)}
      actions={view === 'todo' && can('write:step') ? <span className="flex gap-1.5">
        {chair && t && t.chair !== chair && <Button size="sm" variant="ghost" loading={busy === `call ${t.number}`} onClick={() => void call(t, g, elsewhere)}><Megaphone />{elsewhere ? 'Call here' : 'Call'}</Button>}
        <Button size="sm" variant={isOpen ? 'ghost' : 'outline'} aria-expanded={isOpen} onClick={() => toggle(g.patient.id)}>{isOpen ? 'Close' : 'Collect'}</Button></span> : undefined} />,
      isOpen && view === 'todo' && fold(g)]
  }
  // the fold to collect: the sample number, the tubes by colour, fasting where it matters, then Collected or why not
  const fold = (g: PatientGroup, inCard = false) => {
    const groups = tubesFor(g.rows.map((r) => ({ code: serviceOf(r)?.code ?? '', section_name: r.section_name, name: r.service_name ?? r.display_line })))
    const fast = g.rows.some((r) => needsFasting(serviceOf(r)?.code ?? ''))
    return <li key={`${g.patient.id} fold`} className={inCard ? 'grid gap-4 border-t border-line pt-4 md:grid-cols-[14rem_minmax(0,1fr)]' : 'grid gap-4 border-t border-line bg-sunken p-4 md:grid-cols-[14rem_minmax(0,1fr)]'}>
      <div className="grid content-start gap-1"><p className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Sample number</p>
        {sample.isLoading ? <Spinner label="A number" /> : <p className="font-mono text-22 font-semibold tracking-wide text-fg">{sample.data?.sample ?? '—'}</p>}
        <p className="text-12 text-muted">Write it on each tube. Labels come with printing.</p></div>
      <div className="grid gap-2"><p className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Tubes · {groups.length}</p>
        {groups.map(({ tube, tests }) => <div key={tube.cap} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
          <Cap cap={tube.cap} big /><span className="w-36 text-13 font-medium text-fg">{tube.word}</span><span className="text-13 text-muted">{tests.map((t) => t.name).join(' · ')}</span></div>)}
        {fast && <div className="flex flex-wrap items-center gap-1.5 text-13"><span className="text-muted">Fasting 8 hours?</span>
          <Chip on={fasting === true} onClick={() => setFasting(true)}>Yes</Chip><Chip on={fasting === false} onClick={() => setFasting(false)}>No</Chip>
          {fasting === false && <span className="text-12 text-warn">collected anyway, marked not fasting</span>}</div>}
        {error && <Callout tone="danger" title="Not saved">{error}</Callout>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" disabled={!sample.data || (fast && fasting === null)} loading={busy === g.patient.id} onClick={() => sample.data && void collect(g, sample.data.sample)}>
            Collected · {groups.length} {groups.length === 1 ? 'tube' : 'tubes'}<Kbd className="ms-1">↵</Kbd></Button>
          <span className="text-12 text-faint">Couldn't:</span>{REASONS.map((w) => <Chip key={w} on={why === w} onClick={() => setWhy(why === w ? null : w)}>{w}</Chip>)}
          {why && <Button size="sm" variant="outline" loading={busy === g.patient.id} onClick={() => void notCollected(g, why)}>Not collected</Button>}
        </div></div>
    </li>
  }
  const list = view === 'todo' ? todo : view === 'collected' ? collected : []
  const nowG = now?.group
  return <ScreenFrame views={views} view={view} onView={(v) => { setView(v); setOpen(null) }}
    filters={large.chairs > 0 && <Segmented aria-label="Chair" size="sm" value={chair ? String(chair) : 'all'} onChange={(v) => { setChair(v === 'all' ? null : Number(v)); setOpen(null) }}
      options={[['all', 'All chairs'], ...Array.from({ length: large.chairs }, (_, i) => [String(i + 1), `Chair ${i + 1}`] as [string, string])]} />}
    search={<Input value={find} onChange={(e) => setFind(e.target.value)} placeholder={large.chairs > 0 ? 'Ticket, record number or name' : 'Sample number, record number or name'} className="w-full sm:w-72" />}
    action={can('write:order') && <Button size="sm" variant="outline" aria-expanded={walkIn} onClick={() => { setWalkIn(!walkIn); setSaid(null) }}><Plus />Walk-in</Button>}
    notice={said && <Callout key={said} tone="accent" icon={false} role="status">✓ {said}</Callout>}>
    {walkIn && <WalkIn dept={dept} onClose={() => setWalkIn(false)} onStarted={(x) => { setWalkIn(false); setSaid(x); setView('todo') }} />}
    {view === 'todo' && chair && <Card className="grid gap-3 p-4 ring-1 ring-accent-line">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="grid gap-0.5"><p className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Chair {chair} · {nowG ? 'now' : 'free'}</p>
          {nowG ? <p className="flex flex-wrap items-baseline gap-x-3"><span className="font-mono text-22 font-semibold text-fg">#{now.ticket.number}</span>
            <span className="text-16 font-medium text-fg">{nowG.patient.given_name} {nowG.patient.family_name}</span>
            <span className="text-13 text-muted">{ageSex(nowG.patient)} · {testsLine(nowG.rows, 4)}</span>
            {nowG.rows.some((r) => r.order.status === 'on-hold') && <Tag tone="warn">new sample</Tag>}</p>
            : <p className="text-14 text-muted">{next ? `Next: #${next.ticket.number} · ${next.group.patient.given_name} ${next.group.patient.family_name}` : 'Nobody waiting for a chair.'}</p>}</div>
        <div className="ms-auto flex flex-wrap gap-2">
          {nowG && open !== nowG.patient.id && can('write:step') && <Button size="sm" onClick={() => toggle(nowG.patient.id)}>Collect</Button>}
          {next && can('write:step') && <Button size="sm" variant={nowG ? 'outline' : 'primary'} loading={busy === `call ${next.ticket.number}`} onClick={() => void call(next.ticket, next.group)}>
            <Megaphone />Call #{next.ticket.number}</Button>}</div>
      </div>
      {error && !open && <Callout tone="danger" title="Not called">{error}</Callout>}
      {nowG && open === nowG.patient.id && <ul>{fold(nowG, true)}</ul>}
    </Card>}
    {q.isLoading ? <Spinner label="Loading" /> : <Card><ul>
      {view === 'not' ? (couldnt.length ? couldnt.map((r) => <ListRow key={r.id} number={r.patient.record_number} name={`${r.patient.given_name} ${r.patient.family_name}`} age={ageSex(r.patient)}
          status={<><Tag tone="warn">not collected</Tag><span className="truncate">{r.service_name} · {r.request?.reply_line ?? ''}</span></>}
          who={<span className="tnum">{r.reply?.author_name}{r.reply && ` · ${hm(r.reply.recorded_at)}`}</span>} />) : <li><Empty>{f ? 'No match here.' : 'Nobody today.'}</Empty></li>)
        : list.length ? list.flatMap(row) : <li><Empty>{f ? 'No match here.' : view === 'todo' ? 'Nobody to collect.' : 'Nothing collected waiting for results.'}</Empty></li>}
    </ul></Card>}
  </ScreenFrame>
}
