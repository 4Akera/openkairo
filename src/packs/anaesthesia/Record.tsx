// The anaesthetic record (anaesthesia.record, spec/openCare.md §5.8, Q45; the picture #anaes-record): a tab of the operating department's for
// whoever gives anaesthesia there. Today's cases, then one case's record: the times (in the room, anaesthesia start, knife to skin, end of
// the operation, anaesthesia end), a 5-minute grid (heart rate, BP, SpO₂, EtCO₂, temperature, the agent and FiO₂ — a blank keeps the last
// setting —, each drug at its column with its dose per kg, Ringer's so far, blood loss), the numbered events, the airway, breathing,
// agent and warming. Typed as the case goes and kept as drafts on this machine (as the composer's are); signed once by the
// anaesthetist at the end: each column the pack's type extending the base's vitals, each dose the base's given at its time, and the
// record about the operation, whose times the operating list and the operation note read.
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDepartment } from '@core/hooks/organization'
import { useRequestQueue } from '@core/hooks/reads'
import { refresh } from '@core/hooks/writes'
import { newId, oneSet, qty } from '@core/db/entries'
import { read, write, type EntryIn } from '@core/db/rpc'
import type { RequestQueueRow, TableRead, ValueRow } from '@core/db/types'
import type { ScreenProps } from '@core/screens/registry'
import { ageSex } from '@core/screens/bench/shared'
import { Button, Card, Empty, Input, Kbd, ScreenFrame, Spinner, Tag, cn, errorText } from '@core/ui'
import { ROWS, carried, columns, oxygenOf, perKg } from './model'

type Stamp = 'in' | 'start' | 'knife' | 'end' | 'out'
const STAMPS: [Stamp, string][] = [['in', 'In the room'], ['start', 'Anaesthesia start'], ['knife', 'Knife to skin'], ['end', 'End of the operation'], ['out', 'Anaesthesia end']]
const NUM = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'
const ATC: Record<string, [string, string]> = { propofol: ['N01AX10', 'mg'], fentanyl: ['N01AH01', 'mcg'], rocuronium: ['M03AC09', 'mg'], cefazolin: ['J01DB04', 'g'], ephedrine: ['C01CA26', 'mg'],
  dexamethasone: ['H02AB02', 'mg'], paracetamol: ['N02BE01', 'g'], ondansetron: ['A04AA01', 'mg'], neostigmine: ['N07AA01', 'mg'], atropine: ['A03BA01', 'mg'], bupivacaine: ['N01BB01', 'mg'] }
interface Draft { times: Partial<Record<Stamp, string>>; technique: string; cells: Record<string, string>[]; drugs: { name: string; unit: string; doses: Record<number, string> }[]
  fluids: Record<number, string>; loss: string; events: { at: string; text: string }[]; airway: string; breathing: string; agent: string; warming: string }
const blank = (): Draft => ({ times: {}, technique: '', cells: [], drugs: [], fluids: {}, loss: '', events: [], airway: '', breathing: '', agent: 'sevoflurane in O₂ and air', warming: '' })
const nowHm = () => new Date().toTimeString().slice(0, 5)
const key = (op: string) => `opencare.anaesthesia.record:${op}`
const load = (op: string): Draft => { try { const s = localStorage.getItem(key(op)); return s ? { ...blank(), ...JSON.parse(s) } : blank() } catch { return blank() } }
const atToday = (hmv: string) => { const d = new Date(); const [h, m] = hmv.split(':').map(Number); d.setHours(h, m, 0, 0); return d.toISOString() }

export function AnaesRecord({ dept }: ScreenProps) {
  const q = useRequestQueue(dept.id)
  const [op, setOp] = useState<string | null>(null)
  const cases = (q.data?.requests ?? []).filter((r) => r.order.status !== 'revoked')
  const chosen = cases.find((r) => r.item === op)
  if (chosen) return <Grid dept={dept} r={chosen} onClose={() => setOp(null)} />
  return <ScreenFrame>{q.isLoading ? <Spinner /> : !cases.length ? <Card><Empty>No operation on the list today</Empty></Card>
    : <Card><ul className="divide-y divide-line">{cases.map((r) => <li key={r.item} className="flex flex-wrap items-center gap-3 px-3 py-2 text-13">
      <span className="min-w-0 flex-1"><b className="font-medium text-fg">{r.patient.given_name} {r.patient.family_name}</b> <span className="text-muted">{ageSex(r.patient)}</span>
        <span className="block text-muted">{r.service_name}{r.order.step_key ? ` · ${r.order.step_key.replace('_', ' ')}` : ''}</span></span>
      <Button size="sm" variant="outline" onClick={() => setOp(r.item)}>Open the record</Button></li>)}</ul></Card>}</ScreenFrame>
}

function Grid({ dept, r, onClose }: { dept: ScreenProps['dept']; r: RequestQueueRow; onClose: () => void }) {
  const { org } = useDepartment(); const qc = useQueryClient()
  const [d, setD] = useState<Draft>(() => load(r.item)); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null)
  const [drug, setDrug] = useState(''); const [event, setEvent] = useState('')
  useEffect(() => { try { localStorage.setItem(key(r.item), JSON.stringify(d)) } catch { /* kept in memory */ } }, [d, r.item])
  const weight = useQuery({ queryKey: ['anaesthesia.weight', r.patient.id], staleTime: 300_000,
    queryFn: async () => (await read<TableRead<ValueRow>>({ shape: 'table', table: 'base.values', department_id: dept.id, where: { patient_id: r.patient.id, key: 'weight' }, entries: false })).rows
      .sort((a, b) => b.at.localeCompare(a.at))[0]?.value ?? null })
  const kg = weight.data ? Number(weight.data) : null
  const [tick, setTick] = useState(nowHm())
  useEffect(() => { const t = setInterval(() => setTick(nowHm()), 30_000); return () => clearInterval(t) }, [])
  const cols = useMemo(() => columns(d.times.start ?? d.times.in ?? tick, tick, 36), [d.times.start, d.times.in, tick])
  const cell = (i: number, k: string, v: string) => setD((x) => { const cells = [...x.cells]; cells[i] = { ...(cells[i] ?? {}), [k]: v }; return { ...x, cells } })
  const stamp = (s: Stamp, v: string) => setD((x) => ({ ...x, times: { ...x.times, [s]: v } }))
  async function sign() {
    setBusy(true); setErr(null)
    try {
      const base = { patient_id: r.patient.id, department_id: dept.id }
      const es: EntryIn[] = []
      cols.forEach((t, i) => { const c = d.cells[i] ?? {}; const bp = (c.bp ?? '').match(/^(\d{2,3})\/(\d{2,3})$/)
        // FiO₂ is the base's (its oxygen.fio2 key, beds' Q5), EtCO₂ and the agent the pack's own
        const an = { ...(c.etco2 ? { etco2: Number(c.etco2) } : {}), ...(carried(d.cells, 'agent_pct', i).typed ? { agent: 'sevoflurane', agent_pct: Number(c.agent_pct) } : {}) }
        const o2 = oxygenOf(c.fio2)
        const data = { ...(c.hr ? { hr: qty(c.hr, 'bpm', '/min') } : {}), ...(bp ? { bp: { sys: qty(bp[1], 'mmHg', 'mm[Hg]')!, dia: qty(bp[2], 'mmHg', 'mm[Hg]')! } } : {}),
          ...(c.spo2 ? { spo2: qty(c.spo2, '%', '%') } : {}), ...(c.temp ? { temp: qty(c.temp, '°C', 'Cel') } : {}), ...(o2 ? { oxygen: o2 } : {}), ...(Object.keys(an).length ? { anaesthesia: an } : {}) }
        if (Object.keys(data).length) es.push({ ...base, id: newId(), type: 'anaesthesia.column', occurred_at: atToday(t), data } as unknown as EntryIn) })
      for (const g of d.drugs) for (const [i, v] of Object.entries(g.doses)) if (v.trim()) { const atc = ATC[g.name.toLowerCase()]
        es.push({ ...base, id: newId(), type: 'given', occurred_at: atToday(cols[Number(i)]), data: { drug: { text: g.name, codings: atc ? [{ system: 'atc', code: atc[0], display: g.name }] : [] },
          dose: qty(v.trim(), g.unit, g.unit === 'mcg' ? 'ug' : g.unit), route: 'iv', status: 'completed' } } as EntryIn) }
      const fluids = Object.values(d.fluids).map(Number).filter((n) => n > 0)
      es.push({ ...base, id: newId(), type: 'anaesthesia.record', refers_to: r.order.latest_entry, relation: 'about', data: { op: r.item, operation: r.service_name ?? 'Operation',
        ...(d.technique ? { technique: d.technique } : {}), anaesthetist: org?.me.name ?? '', times: d.times, events: d.events,
        ...(d.airway ? { airway: d.airway } : {}), ...(d.breathing ? { breathing: d.breathing } : {}), ...(d.agent ? { agent: d.agent } : {}), ...(d.warming ? { warming: d.warming } : {}),
        ...(fluids.length ? { fluids: [{ what: "Ringer's lactate", ml: Math.max(...fluids) }] } : {}), ...(d.loss ? { blood_loss: Number(d.loss) } : {}), ...(kg ? { weight: kg } : {}) } } as unknown as EntryIn)
      await write(oneSet(es)); refresh(qc); try { localStorage.removeItem(key(r.item)) } catch { /* nothing kept */ } onClose()
    } catch (e) { setErr(errorText(e)) } finally { setBusy(false) }
  }
  const th = 'sticky left-0 z-raised bg-surface px-2 py-1 text-start text-12 font-normal text-muted'
  const inp = 'h-7 w-14 px-1 text-center text-12 tnum'
  return <ScreenFrame notice={err && <p className="text-14 text-danger">{err}</p>}
    action={<span className="flex items-center gap-2"><Button size="sm" variant="ghost" onClick={onClose}>← Today's cases</Button>
      <Button size="sm" disabled={busy} onClick={() => void sign()}>Sign the record<Kbd className="ms-1">⌘↵</Kbd></Button></span>}>
    <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-13">
      <b className="text-14 font-semibold text-fg">{r.patient.given_name} {r.patient.family_name}</b><span className="text-muted">{ageSex(r.patient)}{kg ? ` · ${kg} kg` : ''}</span>
      <span className="text-fg">{r.service_name}</span>
      <Input aria-label="Technique" value={d.technique} onChange={(e) => setD({ ...d, technique: e.target.value })} placeholder="general, tube" className="h-7 w-36 text-13" />
      {STAMPS.map(([s, l]) => <span key={s} className="flex items-center gap-1 border-s border-line ps-2"><span className="text-muted">{l}</span>
        {d.times[s] ? <Input aria-label={l} value={d.times[s]} onChange={(e) => stamp(s, e.target.value)} className="h-7 w-16 text-13 font-semibold tnum" />
          : <Button size="xs" variant="outline" onClick={() => stamp(s, nowHm())}>now</Button>}</span>)}
      <span className="text-12 text-faint">to the operating list and the operation note</span></Card>
    <p className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Anaesthetic record · every 5 min</p>
    <Card className="overflow-x-auto"><table className="border-collapse text-12">
      <thead><tr><th className={th}></th>{cols.map((t) => <th key={t} className={cn('px-1 py-1 text-center font-mono text-11 font-normal text-faint', t === cols[cols.length - 1] && 'text-accent')}>{t}</th>)}</tr></thead>
      <tbody>
        <tr className="border-t border-line"><td className={th}>Events</td>{cols.map((t) => { const n = d.events.map((e, i) => e.at === t ? NUM[i] : '').join('')
          return <td key={t} className="px-1 text-center text-14 text-accent">{n}</td> })}</tr>
        {ROWS.map((row) => <tr key={row.key} className="border-t border-line"><td className={th}>{row.label}{row.unit && <span className="text-faint"> {row.unit}</span>}</td>
          {cols.map((t, i) => { const c = carried(d.cells, row.key, i)
            return <td key={t} className="px-0.5 py-0.5"><Input aria-label={`${row.label} ${t}`} value={c.typed ? c.v : ''} placeholder={row.carry && !c.typed ? c.v : ''} onChange={(e) => cell(i, row.key, e.target.value)}
              className={cn(inp, row.key === 'bp' && 'w-16')} /></td> })}</tr>)}
        {d.drugs.map((g, k) => <tr key={g.name} className="border-t border-line"><td className={th}>{g.name}<span className="text-faint"> {g.unit}</span></td>
          {cols.map((t, i) => <td key={t} className="px-0.5 py-0.5"><Input aria-label={`${g.name} ${t}`} value={g.doses[i] ?? ''} className={inp}
            onChange={(e) => setD((x) => ({ ...x, drugs: x.drugs.map((y, j) => j === k ? { ...y, doses: { ...y.doses, [i]: e.target.value } } : y) }))} /></td>)}</tr>)}
        <tr className="border-t border-line"><td className={th}>Ringer's lactate <span className="text-faint">mL so far</span></td>
          {cols.map((t, i) => <td key={t} className="px-0.5 py-0.5"><Input aria-label={`Ringer's ${t}`} value={d.fluids[i] ?? ''} onChange={(e) => setD((x) => ({ ...x, fluids: { ...x.fluids, [i]: e.target.value } }))} className={inp} /></td>)}</tr>
      </tbody></table></Card>
    <p className="flex flex-wrap items-center gap-2 text-13"><Input aria-label="Add a drug" list="anaes-drugs" value={drug} onChange={(e) => setDrug(e.target.value)} placeholder="add a drug row: propofol" className="h-7 w-48 text-13" />
      <datalist id="anaes-drugs">{Object.keys(ATC).map((x) => <option key={x} value={x} />)}</datalist>
      <Button size="sm" variant="outline" disabled={!drug.trim()} onClick={() => { const n = drug.trim(); const name = n[0].toUpperCase() + n.slice(1); setD({ ...d, drugs: [...d.drugs, { name, unit: ATC[n.toLowerCase()]?.[1] ?? 'mg', doses: {} }] }); setDrug('') }}>Add</Button>
      <span className="text-12 text-faint">Faint: a setting carried on from the column before. A drug typed on a column takes its time.</span></p>
    <div className="grid gap-3 lg:grid-cols-3">
      <Card className="grid content-start gap-1 p-3"><p className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Events</p>
        <ol className="grid gap-0.5 text-13 text-fg">{d.events.map((e, i) => <li key={i} className="flex gap-1.5"><span className="text-accent">{NUM[i]}</span><span className="tnum">{e.at} {e.text}</span></li>)}</ol>
        <span className="flex gap-1.5"><Input aria-label="Event" value={event} onChange={(e) => setEvent(e.target.value)} placeholder="induction · tube 7.0 · CO₂ in" className="h-7 text-13"
          onKeyDown={(e) => { if (e.key === 'Enter' && event.trim()) { const at = cols[cols.length - 1]; setD({ ...d, events: [...d.events, { at, text: event.trim() }] }); setEvent('') } }} /></span></Card>
      <Card className="grid content-start gap-1 p-3"><p className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Drugs{kg ? ` · for ${kg} kg` : ''}</p>
        {d.drugs.map((g) => { const total = Object.values(g.doses).map(Number).filter((n) => n > 0); const sum = total.reduce((a, b) => a + b, 0)
          return <p key={g.name} className="flex flex-wrap items-baseline justify-between gap-x-2 text-13"><span className="text-fg">{g.name} {total.join(' + ')} {g.unit}</span>
            {sum > 0 && kg && <span className="text-12 text-muted">{perKg(sum, kg)} {g.unit}/kg in all</span>}</p> })}
        <p className="text-12 text-faint">Each dose is the base's given with its time; the dose per kg is shown, never a stop.</p></Card>
      <Card className="grid content-start gap-1.5 p-3"><p className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Airway, breathing, agent, fluids</p>
        {(['airway', 'breathing', 'agent', 'warming'] as const).map((k) => <label key={k} className="flex items-center gap-2 text-13"><span className="w-20 text-12 text-faint">{k[0].toUpperCase() + k.slice(1)}</span>
          <Input value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} className="h-7 text-13" /></label>)}
        <label className="flex items-center gap-2 text-13"><span className="w-20 text-12 text-faint">Blood loss</span><Input value={d.loss} onChange={(e) => setD({ ...d, loss: e.target.value })} className="h-7 w-20 text-13" /> mL</label>
        {d.times.knife && <Tag tone="info">knife {d.times.knife}{d.times.end ? `–${d.times.end}` : ''}</Tag>}</Card></div>
  </ScreenFrame>
}
