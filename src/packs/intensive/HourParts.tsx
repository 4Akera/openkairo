// The hour card's parts (spec/openCare.md §5.6): the vitals, the airway (the ventilator's settings, or air or oxygen and ACVPU), each
// running infusion and a new one, in and out. What is in force shows faint as the placeholder, and a blank keeps it. A field's problem
// shows under it in red, its range notice in amber. Inline chips and cards only: no dropdown.
import { useState, type ReactNode } from 'react'
import { ACVPU, type Acvpu } from '@core/screens/visit/vitals'
import { Card, Chip, Input, cn, dateTime } from '@core/ui'
import { AIRWAY, MODES, modeWords, type AirwayKind } from './codes'
import { LABEL, bagIn, linkOf, otherHalf, startBag, type HourDraft, type HourNow, type Start, type VentField } from './hour'
import { DOSE_UNITS, bagWords } from './rates'
import { infusionOf, type UnitSetting } from './unit'
import { computedMap } from './chart'

export type Say = Record<string, { problem?: string; notice?: string }>
export interface PartProps { d: HourDraft; set: (f: (d: HourDraft) => HourDraft) => void; now: HourNow; unit: UnitSetting; say: Say }

const Under = ({ s }: { s?: { problem?: string; notice?: string } }) => <>
  {s?.problem && <span role="alert" className="text-12 text-danger">{s.problem}</span>}{s?.notice && <span className="text-12 text-warn">{s.notice}</span>}</>
/** a number field: its label over it, what is in force as the placeholder, its problem or notice under it */
function Num({ label, unit, value, onChange, placeholder, s, w = 'w-16' }: { label: string; unit?: string; value?: string; onChange: (v: string) => void; placeholder?: string
  s?: { problem?: string; notice?: string }; w?: string }) {
  return <label className="grid content-start gap-1">
    <span className="text-12 font-medium text-muted">{label}{unit && <span className="ms-1 text-11 font-normal text-faint">{unit}</span>}</span>
    <Input dense inputMode="decimal" aria-label={label} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
      aria-invalid={s?.problem ? true : undefined} className={cn('text-end tnum', w)} />
    <Under s={s} />
  </label>
}
const Part = ({ title, children }: { title: string; children: ReactNode }) =>
  <section aria-label={title} className="grid gap-1.5"><h3 className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">{title}</h3>
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">{children}</div></section>

export function VitalsRow({ d, set, say }: PartProps) {
  const f = (k: 'hr' | 'map' | 'spo2' | 'rr' | 'temp' | 'glucose' | 'cvp', unit?: string) =>
    <Num key={k} label={LABEL[k]} unit={unit} value={d[k]} onChange={(v) => set((x) => ({ ...x, [k]: v }))} s={say[k]} />
  const sys = Number(d.sys); const dia = Number(d.dia); const map = d.sys && d.dia && sys > dia && dia > 0 ? computedMap(sys, dia) : null
  return <Part title="Vitals">
    {f('hr', '/min')}
    <div className="grid content-start gap-1"><span className="text-12 font-medium text-muted">BP <span className="text-11 font-normal text-faint">mmHg</span></span>
      <span className="flex items-center gap-1"><Input dense inputMode="decimal" aria-label="Systolic" value={d.sys ?? ''} onChange={(e) => set((x) => ({ ...x, sys: e.target.value }))} className="w-14 text-end tnum" />
        <span className="text-faint">/</span><Input dense inputMode="decimal" aria-label="Diastolic" value={d.dia ?? ''} onChange={(e) => set((x) => ({ ...x, dia: e.target.value }))} className="w-14 text-end tnum" />
        {map !== null && <span className="text-12 text-faint" title="the MAP this BP gives">MAP {map}</span>}</span>
      <Under s={say.bp} /></div>
    {f('map', 'mmHg')}{f('spo2', '%')}{f('rr', '/min')}{f('temp', '°C')}{f('glucose', 'mg/dL')}{f('cvp', 'cmH₂O')}
  </Part>
}

const VENT_FIELDS: [VentField, string][] = [['fio2', '%'], ['peep', 'cmH₂O'], ['vt', 'mL'], ['rate', '/min'], ['ps', 'cmH₂O']]
export function AirwayRow({ d, set, now, say }: PartProps) {
  const on = now.airway; const starting = !on && d.ventOn
  const v = (k: VentField) => (on && now.vent?.data[k]?.value) || undefined
  const setVent = (k: string, val: string | undefined) => set((x) => ({ ...x, vent: { ...x.vent, [k]: val } }))
  if (on || starting) {
    const mode = d.vent?.mode ?? (on ? now.vent?.data.mode : undefined)
    return <Part title={on ? `${AIRWAY[on.kind].label} · since ${dateTime(on.since)}` : AIRWAY[d.ventOn!].label}>
      <div className="grid content-start gap-1"><span className="text-12 font-medium text-muted">Mode{on && now.vent && <span className="ms-1 font-normal text-faint">{modeWords(now.vent.data)}</span>}</span>
        <span className="flex flex-wrap gap-1">{MODES.map(([m, w]) => <Chip key={m} on={d.vent?.mode === m} dot={!d.vent?.mode && mode === m}
          onClick={() => setVent('mode', d.vent?.mode === m ? undefined : m)}>{w}</Chip>)}</span>
        {mode === 'other' && <Input dense aria-label="The mode" placeholder={now.vent?.data.mode_text ?? 'The mode'} value={d.vent?.mode_text ?? ''} onChange={(e) => setVent('mode_text', e.target.value)} className="w-40" />}
        <Under s={say.mode} /></div>
      {VENT_FIELDS.map(([k, u]) => <Num key={k} label={LABEL[k]} unit={u} value={d.vent?.[k]} placeholder={v(k)} onChange={(x) => setVent(k, x)} s={say[k]} />)}
      <span className="self-end pb-1">{on ? <Chip on={!!d.ventOff} onClick={() => set((x) => ({ ...x, ventOff: !x.ventOff }))}>{AIRWAY[on.kind].ended}</Chip>
        : <Chip on onClick={() => set((x) => ({ ...x, ventOn: undefined, vent: undefined }))}>✕ Not started</Chip>}</span>
    </Part>
  }
  return <Part title="Airway">
    <div className="grid content-start gap-1"><span className="text-12 font-medium text-muted">Air or O₂</span>
      <span className="flex gap-1"><Chip on={d.o2 === 'air'} onClick={() => set((x) => ({ ...x, o2: x.o2 === 'air' ? undefined : 'air' }))}>Air</Chip>
        <Chip on={d.o2 === 'oxygen'} onClick={() => set((x) => ({ ...x, o2: x.o2 === 'oxygen' ? undefined : 'oxygen' }))}>Oxygen</Chip></span></div>
    {d.o2 === 'oxygen' && <Num label="Flow" unit="L/min" value={d.flow} onChange={(x) => set((y) => ({ ...y, flow: x }))} s={say.flow} />}
    {d.o2 === 'air' && say.flow && <Under s={say.flow} />}
    <div className="grid content-start gap-1"><span className="text-12 font-medium text-muted">ACVPU</span>
      <span className="flex gap-1">{(Object.keys(ACVPU) as Acvpu[]).map((k) => <Chip key={k} title={ACVPU[k]} on={d.acvpu === k}
        onClick={() => set((x) => ({ ...x, acvpu: x.acvpu === k ? undefined : k }))}>{k.toUpperCase()}</Chip>)}</span></div>
    <span className="flex gap-1 self-end pb-1">{(Object.keys(AIRWAY) as AirwayKind[]).map((k) =>
      <Chip key={k} onClick={() => set((x) => ({ ...x, ventOn: k }))}>Start {AIRWAY[k].short === 'Ventilated' ? 'ventilation' : AIRWAY[k].short}</Chip>)}</span>
  </Part>
}

function StartCard({ s, i, p }: { s: Start; i: number; p: PartProps }) {
  const row = infusionOf(p.unit, s.key); if (!row) return null
  const put = (patch: Partial<Start>) => p.set((x) => ({ ...x, starts: x.starts.map((y, j) => j === i ? { ...y, ...patch } : y) }))
  const { bag, kg } = startBag(s, row, p.now); const u = DOSE_UNITS[row.dose_unit]; const link = linkOf(row, p.now.prescriptions)
  const half = otherHalf(s, bag, row.dose_unit, kg); const say = p.say[`start:${i}`]
  return <Card className="grid gap-2 p-3">
    <p className="flex flex-wrap items-center gap-2 text-13 font-medium text-fg">{row.name}<span className="text-12 font-normal text-faint">{bag ? bagWords(bag) : 'no bag'}</span>
      <Chip className="ms-auto" onClick={() => p.set((x) => ({ ...x, starts: x.starts.filter((_, j) => j !== i) }))}>✕ Not this</Chip></p>
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <Num label="Dose" unit={u.words} value={s.dose} onChange={(v) => put({ dose: v })} />
      <Num label="Rate" unit="mL/h" value={s.rate} onChange={(v) => put({ rate: v })} />
      {half && <span className="self-end pb-1.5 text-13 text-muted tnum">= {half}</span>}
      <Num label="Bag" unit={row.amount_unit} value={s.amount} placeholder={row.amount?.toString()} onChange={(v) => put({ amount: v })} />
      <Num label="in" unit="mL" value={s.volume} placeholder={row.volume?.toString()} onChange={(v) => put({ volume: v })} />
      {u.perKg && p.now.kg === null && <Num label="Weight" unit="kg" value={s.kg} onChange={(v) => put({ kg: v })} />}
    </div>
    {link.linked ? <p className="text-12 text-muted">For the prescription: {link.linked.drug.text}</p>
      : link.candidates.length > 0 && <p className="flex flex-wrap gap-1">{link.candidates.map((c) =>
        <Chip key={c.item} on={s.medication === c.item} onClick={() => put({ medication: s.medication === c.item ? undefined : c.item })}>Link to {c.drug.text}</Chip>)}</p>}
    <Under s={say} />
  </Card>
}

export function InfusionRows(p: PartProps) {
  const { d, set, now, unit, say } = p; const [adding, setAdding] = useState(false)
  const busy = new Set([...now.running.map((r) => r.data.key), ...d.starts.map((s) => s.key)])
  const put = (item: string, patch: { dose?: string; rate?: string; stop?: boolean }) => set((x) => ({ ...x, doses: { ...x.doses, [item]: { ...x.doses[item], ...patch } } }))
  return <Part title="Infusions">
    <div className="grid w-full gap-2">
      {now.running.map((r) => { const x = d.doses[r.item] ?? {}; const b = bagIn(r.data); const half = otherHalf(x, b.bag, b.unit, b.kg)
        return <div key={r.item} className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <span className="w-40 pt-6 text-13 text-fg">{r.data.drug.text}</span>
          {x.stop ? <span className="pt-6 text-13 text-warn">Stopped this hour</span> : <>
            <Num label="Dose" unit={b.unit ? DOSE_UNITS[b.unit].words : undefined} value={x.dose} placeholder={r.data.dose?.value} onChange={(v) => put(r.item, { dose: v })} s={say[`dose:${r.item}`]} />
            <Num label="Rate" unit="mL/h" value={x.rate} placeholder={r.data.rate?.value} onChange={(v) => put(r.item, { rate: v })} />
            {half && <span className="pt-6 text-13 text-muted tnum">= {half}</span>}</>}
          <span className="pt-6"><Chip on={!!x.stop} onClick={() => put(r.item, { stop: !x.stop })}>Stop</Chip></span>
        </div> })}
      {d.starts.map((s, i) => <StartCard key={`${s.key}:${i}`} s={s} i={i} p={p} />)}
      <div className="flex flex-wrap items-center gap-1"><Chip on={adding} onClick={() => setAdding(!adding)}>+ Infusion</Chip>
        {adding && unit.infusions.filter((r) => !busy.has(r.key)).slice(0, 9).map((r) =>
          <Chip key={r.key} onClick={() => { set((x) => ({ ...x, starts: [...x.starts, { key: r.key }] })); setAdding(false) }}>{r.name}</Chip>)}
        {adding && unit.infusions.length === 0 && <span className="text-12 text-faint">The unit has no infusions yet: Settings → Departments.</span>}</div>
    </div>
  </Part>
}

export function FluidRow({ d, set, now, say }: PartProps) {
  const kg = now.kg; const u = Number(d.urine)
  return <Part title="In and out (this hour)">
    <Num label="In" unit="mL" value={d.intake} onChange={(v) => set((x) => ({ ...x, intake: v }))} s={say.intake} />
    <Num label="Urine" unit="mL" value={d.urine} onChange={(v) => set((x) => ({ ...x, urine: v }))} s={say.urine} />
    {kg && d.urine && u >= 0 && <span className={cn('self-end pb-1.5 text-13 tnum', u < 0.5 * kg ? 'text-warn' : 'text-muted')}>{(u / kg).toFixed(1)} mL/kg/h
      {u < 0.5 * kg && <><span aria-hidden> ↓</span> low</>}</span>}
  </Part>
}
