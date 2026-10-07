// Collect (lis.collect, spec/openCare.md §5.3; the picture "Lab · collecting"): the laboratory's first screen, in place of the bench.
// Its views are counted filters — To collect (nothing done yet), Collected (results to come), Couldn't collect (today, with why). A row
// is one patient: the tests, stat, a walk-in, where they are. Collect folds out the sample number (one per patient, written on each
// tube until labels print), the tubes by colour with the tests drawn into each, fasting asked where it matters, then Collected — a
// collected step on each order, carrying the sample number — or Couldn't collect with a reason the doctor sees. + Walk-in as on any
// bench, with the laboratory's own second step (Step.tsx).
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
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
import { Button, Callout, Card, Chip, Empty, Input, Kbd, ListRow, ScreenFrame, Spinner, Tag, errorText, hm, minutesSince, type ScreenView } from '@core/ui'
import { needsFasting, tubesFor } from './tubes'

type View = 'todo' | 'collected' | 'not'
const REASONS = ['Refused', 'No vein', 'Not fasting', 'Left']
/** collected: any step reached (collected, received) */
const started = (r: RequestQueueRow) => !!r.order.step_key || (!!r.request?.step && r.request.step !== 'sent')

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
  const f = find.trim().toLowerCase()
  const rows = q.data?.requests ?? []
  const todo = groupByPatient(rows.filter((r) => !started(r))).filter((g) => matches(g.patient, f))
  const collected = groupByPatient(rows.filter(started)).filter((g) => matches(g.patient, f))
  const couldnt = (q.data?.recent ?? []).filter((r) => r.order.status === 'cancelled' && matches(r.patient, f))
  const views: ScreenView<View>[] = [{ id: 'todo', label: 'To collect', count: todo.length, needs: 'warn' }, { id: 'collected', label: 'Collected', count: collected.length },
    { id: 'not', label: "Couldn't collect", count: couldnt.length }]
  const serviceOf = (r: RequestQueueRow) => org?.services.find((s) => s.id === r.order.service_id)
  const sample = useQuery({ queryKey: ['lis.sample', dept.id, open], enabled: !!open && view === 'todo', staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => packOp<{ sample: string }>('lis.sample', dept.id) })
  const toggle = (pid: string) => { setOpen(open === pid ? null : pid); setFasting(null); setWhy(null); setError(null) }
  const land = async (g: PatientGroup, items: EntryIn[], words: string) => {
    setBusy(g.patient.id); setError(null)
    try { await write(oneSet(items)); setOpen(null); setSaid(words); refresh(qc) } catch (x) { setError(errorText(x)) } finally { setBusy(null) }
  }
  const collect = (g: PatientGroup, n: string) => land(g, g.rows.map((r) => answerEntry(r, dept.id, { type: 'step', data: { status: 'in-progress',
    ...(serviceOf(r)?.steps.includes('collected') ? { step: 'collected' } : {}), specimen: n, ...(fasting === false ? { note: 'not fasting' } : {}) } })),
    `${g.patient.given_name} ${g.patient.family_name} · ${n}: write it on each tube`)
  const notCollected = (g: PatientGroup, reason: string) => land(g, g.rows.map((r) => answerEntry(r, dept.id, { type: 'step', data: { status: 'cancelled', reason } })),
    `${g.patient.given_name} ${g.patient.family_name}: not collected (${reason.toLowerCase()}) — the doctor sees why`)

  const row = (g: PatientGroup) => {
    const isOpen = open === g.patient.id; const walk = g.rows.some((r) => isWalkIn(r.order, org?.allDepartments ?? []))
    const ward = g.rows.some((r) => org?.allDepartments.find((d) => d.id === r.order.from_department_id)?.work === 'stays')
    const groups = tubesFor(g.rows.map((r) => ({ code: serviceOf(r)?.code ?? '', section_name: r.section_name, name: r.service_name ?? r.display_line })))
    const fast = g.rows.some((r) => needsFasting(serviceOf(r)?.code ?? ''))
    return [<ListRow key={g.patient.id} number={g.patient.record_number} name={`${g.patient.given_name} ${g.patient.family_name}`} age={ageSex(g.patient)} selected={isOpen}
      status={<>{g.priority !== 'routine' && <Tag tone="danger">{g.priority}</Tag>}{walk && <Tag tone="info">walk-in</Tag>}{ward && <Tag>at the ward</Tag>}<span className="truncate">{testsLine(g.rows)}</span></>}
      who={g.rows[0]?.from_department_name ?? undefined} minutes={g.since ? minutesSince(g.since) : null} onOpen={() => toggle(g.patient.id)}
      actions={view === 'todo' && can('write:step') ? <Button size="sm" variant={isOpen ? 'primary' : 'outline'} aria-expanded={isOpen} onClick={() => toggle(g.patient.id)}>Collect</Button> : undefined} />,
      isOpen && view === 'todo' && <li key={`${g.patient.id} fold`} className="grid gap-4 border-t border-line bg-sunken p-4 md:grid-cols-[14rem_minmax(0,1fr)]">
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
      </li>]
  }
  const list = view === 'todo' ? todo : view === 'collected' ? collected : []
  return <ScreenFrame views={views} view={view} onView={(v) => { setView(v); setOpen(null) }}
    search={<Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Sample number, record number or name" className="w-full sm:w-72" />}
    action={can('write:order') && <Button size="sm" variant="outline" aria-expanded={walkIn} onClick={() => { setWalkIn(!walkIn); setSaid(null) }}><Plus />Walk-in</Button>}
    notice={said && <Callout key={said} tone="accent" icon={false} role="status">✓ {said}</Callout>}>
    {walkIn && <WalkIn dept={dept} onClose={() => setWalkIn(false)} onStarted={(x) => { setWalkIn(false); setSaid(x); setView('todo') }} />}
    {q.isLoading ? <Spinner label="Loading" /> : <Card><ul>
      {view === 'not' ? (couldnt.length ? couldnt.map((r) => <ListRow key={r.id} number={r.patient.record_number} name={`${r.patient.given_name} ${r.patient.family_name}`} age={ageSex(r.patient)}
          status={<><Tag tone="warn">not collected</Tag><span className="truncate">{r.service_name} · {r.request?.reply_line ?? ''}</span></>}
          who={<span className="tnum">{r.reply?.author_name}{r.reply && ` · ${hm(r.reply.recorded_at)}`}</span>} />) : <li><Empty>{f ? 'No match here.' : 'Nobody today.'}</Empty></li>)
        : list.length ? list.flatMap(row) : <li><Empty>{f ? 'No match here.' : view === 'todo' ? 'Nobody to collect.' : 'Nothing collected waiting for results.'}</Empty></li>}
    </ul></Card>}
  </ScreenFrame>
}
