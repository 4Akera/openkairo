// Receive (lis.receive, spec/openCare.md §5.3; the picture "Lab · receiving"): a tab only where the laboratory scans to receive (the
// large lab's switch). Each scan of a sample number (S-MMDD-NNNN, written on the tubes until labels print) marks its tests received
// — a received step on each order — and says where each tube goes; Results types only what was received. An unknown number, or one
// already in, says so. A tube that cannot be used (haemolysed, clotted, too little) is rejected: its tests go back to Collect for a new
// sample, held with the reason. Views: Not arrived (collected, not scanned; Receive by hand there for a tube with no number or one that
// will not scan), Received (waiting for results), Sent back. A number that
// finds nothing says why: never given, given but not marked Collected yet, or its tubes saved under another number.
// A pack the laboratory uses may put its button on a row (Pay) with its card under it, and may hold single tests waiting (a soft check,
// spec §5.4), as on Collect: a waiting test shows its word on the row, a scan or Receive takes only the free tests (saying how many wait),
// and Receive anyway… asks why; Reject a tube (a stop) is never greyed.
import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ScanLine } from 'lucide-react'
import { useDepartment } from '@core/hooks/organization'
import { useRequestQueue } from '@core/hooks/reads'
import { refresh } from '@core/hooks/writes'
import { answerEntry, oneSet } from '@core/db/entries'
import { packOp, write } from '@core/db/rpc'
import type { RequestQueueRow } from '@core/db/types'
import type { ScreenProps } from '@core/screens/registry'
import { ageSex, groupByPatient, matches, type PatientGroup } from '@core/screens/bench/shared'
import { Button, Callout, Card, Chip, Empty, Input, Kbd, ListRow, ScreenFrame, Spinner, Tag, errorText, hm, minutesSince, type ScreenView } from '@core/ui'
import { benchMarkRow } from '@core/screens/marks'
import { packRowOf } from '@core/screens/rows'
import { usePackRows } from '@core/screens/useRows'
import { Cap } from './Cap'
import { tubesFor } from './tubes'
import { inLab as open, notFound, sampleKey, scanned } from './large'

type View = 'wait' | 'in' | 'back'
export const REJECTS = ['Haemolysed', 'Clotted', 'Too little', 'Wrong tube', 'No number']

export function Receive({ dept }: ScreenProps) {
  const q = useRequestQueue(dept.id); const qc = useQueryClient(); const { org, can } = useDepartment()
  const [view, setView] = useState<View>('wait'); const [find, setFind] = useState(''); const [scan, setScan] = useState('')
  const [said, setSaid] = useState<{ tone: 'accent' | 'warn' | 'danger'; words: string } | null>(null)
  const [busy, setBusy] = useState(false); const [rejecting, setRejecting] = useState<string | null>(null); const box = useRef<HTMLInputElement>(null)
  const f = find.trim().toLowerCase()
  const rows = useMemo(() => q.data?.requests ?? [], [q.data])
  const packs = usePackRows('screen', useMemo(() => groupByPatient(rows).map((g) => packRowOf(g.patient.id, benchMarkRow(g))), [rows]), dept)
  const free = (r: RequestQueueRow) => packs.isFree(r.order.item)
  const serviceOf = (r: RequestQueueRow) => org?.services.find((s) => s.id === r.order.service_id)
  const tubesOf = (rs: RequestQueueRow[]) => tubesFor(rs.map((r) => ({ code: serviceOf(r)?.code ?? '', section_name: r.section_name, name: r.service_name ?? r.display_line, row: r })))
  const sampleOf = (g: PatientGroup) => g.rows.find((r) => r.step_data?.specimen)?.step_data?.specimen ?? ''
  const hit = (g: PatientGroup) => matches(g.patient, f) || (!!f && sampleKey(sampleOf(g)).includes(sampleKey(f)))
  const wait = groupByPatient(rows.filter((r) => open(r) && r.order.step_key === 'collected')).filter(hit)
  const inside = groupByPatient(rows.filter((r) => open(r) && r.order.step_key === 'received')).filter(hit)
  const back = groupByPatient(rows.filter((r) => r.order.status === 'on-hold')).filter((g) => matches(g.patient, f))
  const views: ScreenView<View>[] = [{ id: 'wait', label: 'Not arrived', count: wait.length, needs: 'warn' }, { id: 'in', label: 'Received', count: inside.length },
    { id: 'back', label: 'Sent back', count: back.length, needs: 'danger' }]
  const may = can('write:step')

  const receive = async () => {
    const typed = scan.trim(); if (!typed) return
    const { toReceive, already } = scanned(rows, typed); setScan('')
    if (!toReceive.length && already.length) { setSaid({ tone: 'warn', words: `${sampleKey(typed)} is in already (${hm(already[0].order.last_at)}).` }); return }
    if (!toReceive.length) {   // whose the number is, to say why it is not here
      const of = await packOp<{ items: string[] }>('lis.sample_of', dept.id, { sample: typed }).catch(() => ({ items: [] as string[] }))
      setSaid({ tone: 'danger', words: notFound(rows, typed, of.items) }); return
    }
    // a test a pack holds waiting is not taken by a scan: its word says why, and Receive anyway… on its row goes ahead
    const held = toReceive.filter((r) => !free(r))
    if (held.length === toReceive.length) { setSaid({ tone: 'warn', words: `${sampleKey(typed)}: ${waitWord(held)} — Receive anyway… on its row, with why.` }); return }
    await take(toReceive.filter(free), sampleKey(typed), held.length ? ` · ${held.length} ${held.length === 1 ? 'test' : 'tests'} ${waitWord(held).toLowerCase()}` : '')
  }
  const waitWord = (rs: RequestQueueRow[]) => packs.waits.get(rs[0]?.order.item ?? '')?.word ?? 'Waiting'
  // a received step on each order, and where each tube goes; by a scan, or by hand for a tube with no number or one that will not scan
  const take = async (rs: RequestQueueRow[], label: string, more = '') => {
    setBusy(true)
    try {
      await write(oneSet(rs.map((r) => answerEntry(r, dept.id, { type: 'step', data: { status: 'in-progress', ...(serviceOf(r)?.steps.includes('received') ? { step: 'received' } : {}),
        specimen: r.step_data?.specimen } }))))
      const p = rs[0].patient; const where = tubesOf(rs).map(({ tube, tests }) => `${tube.word.split(' ·')[0]} → ${[...new Set(tests.map((t) => t.row.section_name ?? 'Other'))].join(', ')}`)
      setSaid({ tone: 'accent', words: `${label} · ${p.given_name} ${p.family_name} · ${where.join(' · ')}${more}` }); refresh(qc)
    } catch (x) { setSaid({ tone: 'danger', words: errorText(x) }) } finally { setBusy(false); box.current?.focus() }
  }
  const reject = async (g: PatientGroup, rs: RequestQueueRow[], why: string, tube: string) => {
    setBusy(true)
    try {
      // held with why and the number rejected: Collect gives the new sample another number
      await write(oneSet(rs.map((r) => answerEntry(r, dept.id, { type: 'step', data: { status: 'on-hold', reason: `Rejected: ${why.toLowerCase()}`, specimen: r.step_data?.specimen } }))))
      setRejecting(null); setSaid({ tone: 'warn', words: `${g.patient.given_name} ${g.patient.family_name}: the ${tube.toLowerCase()} tube went back to Collect (${why.toLowerCase()}) for a new sample` }); refresh(qc)
    } catch (x) { setSaid({ tone: 'danger', words: errorText(x) }) } finally { setBusy(false) }
  }

  const row = (g: PatientGroup) => {
    const n = sampleOf(g); const isOpen = rejecting === g.patient.id
    const tubes = tubesOf(g.rows); const pr = packRowOf(`${view} ${g.patient.id}`, benchMarkRow(g))
    const ok = g.rows.filter(free); const hold = g.rows.filter((r) => !free(r))
    return [<ListRow key={g.patient.id} number={g.patient.record_number} name={`${g.patient.given_name} ${g.patient.family_name}`} age={ageSex(g.patient)} selected={isOpen}
      marks={packs.marks(pr)} extra={packs.buttons(pr)} below={packs.below(pr)}
      status={<>{g.priority !== 'routine' && <Tag tone="danger">{g.priority}</Tag>}
        {view === 'back' ? <><Tag tone="danger">new sample</Tag><span className="truncate">{g.rows[0]?.step_data?.reason ?? ''}</span></>
          : <><span className="font-mono text-12 font-semibold text-fg">{n}</span>{tubes.map(({ tube }) => <Cap key={tube.cap} cap={tube.cap} />)}
            <span className="truncate">{[...new Set(g.rows.map((r) => r.section_name ?? 'Other'))].join(', ')}</span></>}</>}
      minutes={g.rows[0]?.order.last_at ? minutesSince(g.rows[0].order.last_at) : null}
      actions={view === 'in' && may ? <Button size="sm" variant="ghost" aria-expanded={isOpen} onClick={() => setRejecting(isOpen ? null : g.patient.id)}>Reject a tube</Button>
        : view === 'wait' && (may || can('read:bench')) ? <span className="flex gap-1.5">{may && <Button size="sm" variant="ghost" disabled={busy || !ok.length} title={ok.length ? 'For a tube with no number, or one that will not scan' : waitWord(hold)}
          aria-label={`Receive ${g.patient.given_name} ${g.patient.family_name}'s tubes by hand`} onClick={() => void take(ok, n || 'No number')}>Receive</Button>}
          {hold.length > 0 && can('read:bench') && packs.anyway(pr, hold.map((r) => r.order.item), 'Receive')}</span> : undefined} />,
      isOpen && <li key={`${g.patient.id} reject`} className="grid gap-2 border-t border-line bg-sunken p-4">
        {tubes.map(({ tube, tests }) => <div key={tube.cap} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
          <Cap cap={tube.cap} big /><span className="w-36 text-13 font-medium text-fg">{tube.word}</span><span className="text-13 text-muted">{tests.map((t) => t.name).join(' · ')}</span>
          <span className="ms-auto flex flex-wrap gap-1.5">{REJECTS.map((w) => <Chip key={w} onClick={() => void reject(g, tests.map((t) => t.row), w, tube.word.split(' ·')[0])} disabled={busy}>{w}</Chip>)}</span>
        </div>)}
        <p className="text-12 text-faint">Its tests go back to Collect, held with the reason; the other tubes stay received.</p>
      </li>]
  }
  const list = view === 'wait' ? wait : view === 'in' ? inside : back
  return <ScreenFrame views={views} view={view} onView={(v) => { setView(v); setRejecting(null) }}
    search={<Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Sample number, record number or name" aria-label="Find a sample or patient" className="w-full sm:w-72" />}
    notice={said && <Callout key={said.words} tone={said.tone} icon={false} role="status">{said.tone === 'accent' ? '✓ ' : ''}{said.words}</Callout>}>
    {may && <Card className="grid gap-2 p-4 ring-1 ring-accent-line">
      <form className="flex items-center gap-3" onSubmit={(e) => { e.preventDefault(); void receive() }}>
        <ScanLine aria-hidden className="size-5 shrink-0 text-accent" />
        <Input ref={box} autoFocus value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan or type a sample number…" aria-label="Sample number"
          className="h-11 flex-1 font-mono text-16 placeholder:font-sans" disabled={busy} />
        <Button type="submit" disabled={!scan.trim()} loading={busy} aria-label="Receive this sample">Receive<Kbd className="ms-1">↵</Kbd></Button>
      </form>
      <p className="text-12 text-faint">Each scan marks the sample's tests received and says where each tube goes.</p>
    </Card>}
    {q.isLoading ? <Spinner label="Loading" /> : <Card><ul>
      {list.length ? list.flatMap(row) : <li><Empty>{f ? 'No match here.' : view === 'wait' ? 'Every sample collected is in.' : view === 'in' ? 'Nothing received waits for results.' : 'Nothing sent back.'}</Empty></li>}
    </ul></Card>}
  </ScreenFrame>
}
