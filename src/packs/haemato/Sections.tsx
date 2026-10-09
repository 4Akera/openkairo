// Haematology's sections (spec/openCare.md §5.1 rule 2, §5.8; the pictures #haem-blood, #haem-inr and the transfusion picture between them): Transfusions (the group
// and screen, reactions, the programme, the last transfusions with the Hb before and mL/kg, the units given at the bed, iron and chelation)
// and Anticoagulation (the reason and target, the medicine, time in range, the INRs in their band, the week now, the last change).
import { useState, type ReactNode } from 'react'
import type { SectionBody } from '@core/screens/chart/sections'
import { medicinesOf } from '@core/screens/chart/model/record'
import { Empty, LineChart, Sparkline, cn, shortDate } from '@core/ui'
import type { ValueRow } from '@core/db/types'
import { chelationOf, latest, programmeOf, resultText, sessionsOf, unitsOf } from './blood'
import { DAYS, changed, timeInRange, total } from './inr'
import { planOf, weeksOf, INR } from './weeks'

const Faint = ({ children }: { children: ReactNode }) => <span className="text-12 text-faint">{children}</span>
const Row = ({ k, children, tone }: { k: string; children: ReactNode; tone?: 'ok' | 'warn' }) => <div className="flex items-baseline gap-2 py-0.5 text-13">
  <span className="w-24 shrink-0 text-12 text-faint">{k}</span><span className={cn('min-w-0 flex-1', tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-fg')}>{children}</span></div>
const Label = ({ children }: { children: ReactNode }) => <p className="pt-2 text-11 font-semibold uppercase tracking-[0.06em] text-faint">{children}</p>
const valuesOf = (p: SectionBody['p']): ValueRow[] => p.rec.tables['base.values']?.rows ?? []

export function Transfusions({ p, own }: SectionBody) {
  const values = valuesOf(p); const group = resultText(own.shown, '882-1'); const screen = resultText(own.shown, '890-4')
  const units = unitsOf(own.shown); const sessions = sessionsOf(units, values); const prog = programmeOf(own.shown)
  const ferritin = latest(values, 'loinc:2276-4'); const chel = chelationOf(medicinesOf(p.rec, p.ctx).current, values)
  const reactions = units.filter((u) => u.stopped)
  const asked = (p.rec.tables['base.orders']?.rows ?? []).filter((o) => /^(red cells|platelets|plasma|cryo)/i.test(o.service_name ?? '') && ['active', 'in-progress'].includes(o.status))
  const checks = [['creatinine', 'loinc:2160-0'], ['ALT', 'loinc:1742-6']].flatMap(([n, c]) => { const v = latest(values, c)[0]; return v ? [`${n} ${v.value}`] : [] })
  if (!group && !units.length && !prog && !asked.length) return <Empty size="sm">No blood group, programme or transfusion on the record</Empty>
  return <div className="grid gap-0.5">
    <Row k="Blood group">{group ? <>{group.text} <Faint>{shortDate(group.at)}</Faint></> : <span className="text-muted">not grouped here</span>}</Row>
    <Row k="Antibodies">{screen ? <>screen {screen.text} <Faint>{shortDate(screen.at)}</Faint></> : <span className="text-muted">no screen</span>}</Row>
    <Row k="Reactions" tone={reactions.length ? 'warn' : undefined}>{reactions.length ? reactions.map((u) => `${shortDate(u.at)} · ${u.note}`).join(' · ') : 'none'}</Row>
    {prog && <Row k="Programme">every {prog.every_weeks} weeks · Hb before {prog.hb.low}–{prog.hb.high}{prog.needs?.length ? ` · red cells ${prog.needs.join(', ')}` : ''}</Row>}
    {asked.map((o) => <Row key={o.item} k="Asked">{o.service_name}{o.priority !== 'routine' ? ` · ${o.priority}` : ''} · {shortDate(o.ordered_at)}</Row>)}
    {sessions.length > 0 && <><Label>The last {Math.min(4, sessions.length)}</Label>
      <table className="w-full text-13 tnum"><thead><tr className="text-11 uppercase tracking-[0.06em] text-faint">{['Date', 'Hb before', 'Units', 'mL', 'mL/kg', ''].map((h) => <th key={h} className="py-1 pe-2 text-start font-medium">{h}</th>)}</tr></thead>
        <tbody>{sessions.slice(0, 4).map((s) => <tr key={s.day} className="border-t border-line"><td className="py-1 pe-2">{shortDate(s.day)}</td>
          <td className={cn('py-1 pe-2', prog && s.hb != null && s.hb < prog.hb.low && 'font-medium text-warn')}>{s.hb ?? '—'}</td><td className="py-1 pe-2">{s.units.length}</td><td className="py-1 pe-2">{s.ml || '—'}</td>
          <td className="py-1 pe-2">{s.perKg ?? '—'}</td><td className="py-1">{s.units.some((u) => u.stopped) ? <span className="font-medium text-danger">stopped</span> : <span className="text-ok">no reaction</span>}</td></tr>)}</tbody></table></>}
    {units.length > 0 && units.some((u) => u.unit) && <><Label>Units</Label>{units.slice(0, 6).map((u) => <p key={u.id} className="flex flex-wrap items-baseline gap-2 text-13">
      <button type="button" onClick={() => p.open(u.id)} className="rounded-sm font-mono text-12 hover:underline focus-ring">{u.unit ?? '—'}</button><span className="text-fg">{u.product}</span>
      <Faint>{shortDate(u.at)}{u.ml ? ` · ${u.ml} mL` : ''}</Faint>{u.note && <span className={cn('text-12', u.stopped ? 'font-medium text-danger' : 'text-muted')}>{u.note}</span>}</p>)}</>}
    {(ferritin.length > 0 || chel) && <Label>Iron</Label>}
    {ferritin.length > 0 && <div className="flex items-center gap-2 py-0.5 text-13"><span className="w-24 shrink-0 text-12 text-faint">Ferritin</span>
      <span className={cn(ferritin[0].value > 1000 && 'font-medium text-warn')}>{ferritin[0].value}</span><Faint>ng/mL · {shortDate(ferritin[0].at)}</Faint>
      {ferritin.length > 1 && <Sparkline points={[...ferritin].reverse().map((v) => ({ at: v.at, value: v.value }))} label={`Ferritin ${[...ferritin].reverse().map((v) => v.value).join(', ')}`} />}
      {ferritin.length > 1 && <Faint>{ferritin.at(-1)!.value} on {shortDate(ferritin.at(-1)!.at)}</Faint>}</div>}
    {chel && <Row k="Chelation">{chel.med.drug_name} {chel.med.dose_number ?? ''} {chel.med.dose_unit ?? ''} {chel.med.frequency ?? ''}{chel.perKg != null && <> · <b className="font-semibold">{chel.perKg} mg/kg</b> at {chel.kg} kg</>}</Row>}
    {chel && checks.length > 0 && <Row k="Its checks">{checks.join(' · ')}</Row>}
    {prog && units[0] && <Row k="Next">due {shortDate(new Date(Date.parse(units[0].at) + prog.every_weeks * 7 * 86_400_000).toISOString())} <Faint>in {prog.every_weeks} weeks from the last</Faint></Row>}
  </div>
}

export function Anticoagulation({ p, own }: SectionBody) {
  const plan = planOf(own.shown); const weeks = weeksOf(own.shown); const [now] = useState(() => Date.now())
  if (!plan) return <Empty size="sm">Not on the INR clinic: /inrplan sets the reason and the target</Empty>
  const inrs = latest(valuesOf(p), INR).filter((v) => now - Date.parse(v.at) <= 182 * 86_400_000).reverse()
  const ttr = timeInRange(inrs.map((v) => ({ at: v.at, value: v.value })), plan.target, new Date(now))
  const [week, ...before] = weeks; const last = weeks.find((w, i) => weeks[i + 1] && total(w.days) !== total(weeks[i + 1].days))
  return <div className="grid gap-0.5">
    <Row k="For">{plan.reason}</Row>
    <Row k="Target"><b className="font-semibold">INR {plan.target.low.toFixed(1)}–{plan.target.high.toFixed(1)}</b> <Faint>since {shortDate(plan.at)}</Faint></Row>
    <Row k="Medicine">{plan.medicine ?? 'warfarin'}{week ? ` · ${total(week.days)} mg a week` : ''}</Row>
    <Row k="In range" tone={ttr == null ? undefined : ttr >= 65 ? 'ok' : 'warn'}>{ttr == null ? 'too few INRs yet' : <>{ttr} % of the last 6 months <Faint>Rosendaal, from the INRs</Faint></>}</Row>
    {inrs.length > 1 && <LineChart height={130} band={{ low: plan.target.low, high: plan.target.high }} label={`INR, the last 6 months, target ${plan.target.low} to ${plan.target.high}`}
      points={inrs.map((v) => ({ at: v.at, value: v.value, flag: v.value < plan.target.low ? 'low' as const : v.value > plan.target.high ? 'high' as const : undefined, entryId: v.entry_id }))} onPoint={p.open} />}
    {week && <><Label>The week now · mg</Label><table className="w-full text-13 tnum"><thead><tr>{DAYS.map((d) => <th key={d} className="py-1 text-start text-11 font-medium uppercase tracking-[0.06em] text-faint">{d}</th>)}</tr></thead>
      <tbody><tr>{week.days.map((d, i) => <td key={i} className="py-1">{d}</td>)}</tr></tbody></table></>}
    {last && <Row k="Last change">{shortDate(last.at)}{last.inr != null ? ` · INR ${last.inr}` : ''} · {total(weeks[weeks.indexOf(last) + 1].days)} → {total(last.days)} mg a week
      {changed(weeks[weeks.indexOf(last) + 1].days, last.days) && <Faint> · {changed(weeks[weeks.indexOf(last) + 1].days, last.days)}</Faint>}</Row>}
    {!before.length && week && <Row k="Last change"><span className="text-muted">none yet</span></Row>}
  </div>
}
