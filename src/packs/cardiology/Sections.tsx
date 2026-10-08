// Cardiology's sections in the chart (spec/openCare.md §5.1 rule 2, §5.7): Heart (the ECGs as a table, the last echo, Holter) and Heart
// failure (EF from the last echo, NYHA, the weight against the dry weight, the four medicine groups against their targets, K, creatinine
// and eGFR beside them, the diuretic, CHA₂DS₂-VASc). Read-only; a row opens its entry in the center.
import type { ReactNode } from 'react'
import type { SectionBody } from '@core/screens/chart/sections'
import { medicinesOf, problemsOf } from '@core/screens/chart/model/record'
import { useDepartment } from '@core/hooks/organization'
import { Empty, Sparkline, Tag, cn, shortDate } from '@core/ui'
import type { ServerEntry, ValueRow } from '@core/db/types'
import { besideOf, echoOf, ecgsOf, groupsOf, hasHf, nyhaWord, nyhasOf, weightOf, type Standing } from './heart'
import { targetsOf } from './targets'

const Faint = ({ children }: { children: ReactNode }) => <span className="text-12 text-faint">{children}</span>
export const Row = ({ k, children, tone }: { k: string; children: ReactNode; tone?: 'warn' }) => <div className="flex items-baseline gap-2 py-0.5 text-13">
  <span className="w-24 shrink-0 text-12 text-faint">{k}</span><span className={cn('min-w-0 flex-1', tone === 'warn' ? 'text-warn' : 'text-fg')}>{children}</span></div>
export const Label = ({ children }: { children: ReactNode }) => <p className="pt-2 text-11 font-semibold uppercase tracking-[0.06em] text-faint">{children}</p>
const valuesOf = (p: SectionBody['p']): ValueRow[] => p.rec.tables['base.values']?.rows ?? []
const sign = (n: number | null) => n == null ? '—' : n > 0 ? `+${n}°` : `${n}°`

export function Heart({ p, own }: SectionBody) {
  const ecgs = ecgsOf(own.shown); const echo = echoOf(valuesOf(p), own.shown)
  return <div className="grid gap-1">
    <Label>ECGs</Label>
    {ecgs.length ? <table className="w-full text-13 tnum"><thead><tr className="text-start text-11 uppercase tracking-[0.06em] text-faint">
      {['Date', 'Rhythm', 'Rate', 'PR', 'QRS', 'QTc', 'Axis'].map((h) => <th key={h} className="py-1 pe-2 text-start font-medium">{h}</th>)}</tr></thead>
      <tbody>{ecgs.map((e) => <tr key={e.entry_id} className="border-t border-line">
        <td className="py-1 pe-2"><button type="button" onClick={() => p.open(e.entry_id)} className="rounded-sm hover:underline focus-ring">{shortDate(e.at)}</button></td>
        <td className={cn('py-1 pe-2', e.rhythm && e.rhythm !== 'sinus' && 'font-medium text-warn')}>{e.rhythm ?? '—'}</td>
        <td className={cn('py-1 pe-2', e.rate != null && (e.rate > 100 || e.rate < 60) && 'text-warn')}>{e.rate ?? '—'}</td>
        <td className="py-1 pe-2">{e.pr ?? '—'}</td><td className="py-1 pe-2">{e.qrs ?? '—'}</td><td className={cn('py-1 pe-2', e.qtc != null && e.qtc > 450 && 'text-warn')}>{e.qtc ?? '—'}</td>
        <td className="py-1 pe-2">{sign(e.axis)}</td></tr>)}</tbody></table> : <Empty size="sm">No ECG yet: /ecg writes one</Empty>}
    <Row k="Echo">{echo ? <><button type="button" onClick={() => p.open(echo.entry_id)} className="rounded-sm hover:underline focus-ring">EF {echo.ef} %</button> <Faint>{shortDate(echo.at)}</Faint>
      {echo.conclusion && <span className="block text-12 text-muted">{echo.conclusion}</span>}</> : <span className="text-muted">none yet</span>}</Row>
    <Row k="Holter"><span className="text-muted">none</span></Row>
  </div>
}

const TONE: Record<Standing, 'ok' | 'warn' | 'neutral'> = { 'at target': 'ok', 'not on': 'warn', half: 'neutral', low: 'neutral', on: 'neutral' }
export function HeartFailure({ p, own }: SectionBody) {
  const { org } = useDepartment()
  const values = valuesOf(p); const problems = problemsOf(p.rec, p.ctx).active
  if (!hasHf(problems)) return <Empty size="sm">Heart failure is not on the problem list (I50)</Empty>
  const echo = echoOf(values, own.shown); const ny = nyhasOf(own.shown); const w = weightOf(values); const b = besideOf(values)
  const meds = medicinesOf(p.rec, p.ctx).current; const groups = groupsOf(meds, targetsOf(org))
  const diuretic = meds.filter((m) => m.drug_code?.startsWith('atc:C03C') || m.drug_code?.startsWith('atc:C03A'))
  const anticoag = meds.filter((m) => m.drug_code?.startsWith('atc:B01A'))
  const score = own.shown.filter((e: ServerEntry) => e.type === 'score' && e.data?.score === 'cardiology.chadsvasc')[0]
  return <div className="grid gap-0.5">
    <Row k="EF">{echo ? <><span className={cn(echo.ef != null && echo.ef < 40 && 'font-medium text-warn')}>{echo.ef} %</span> <Faint>echo {shortDate(echo.at)}</Faint></> : <span className="text-muted">no echo yet</span>}</Row>
    <Row k="NYHA">{ny.length ? <>{nyhaWord(ny[0].cls)} <Faint>{shortDate(ny[0].at)}</Faint>{ny[1] && <span className="text-muted"> · {nyhaWord(ny[1].cls)} on {shortDate(ny[1].at)}</span>}
      {ny[0].note && <span className="block text-12 text-muted">{ny[0].note}</span>}</> : <span className="text-muted">not written yet: /hf nyha 2</span>}</Row>
    <div className="flex items-center gap-2 py-0.5 text-13"><span className="w-24 shrink-0 text-12 text-faint">Weight</span>
      <span className="min-w-0 flex-1">{w.now ? <><span className={cn(w.over != null && w.over >= 1 && 'font-medium text-warn')}>{w.now.value} kg</span>{' '}
        <Faint>{w.dry ? `dry ${w.dry.value} kg (${shortDate(w.dry.at)})${w.over != null ? ` · ${w.over > 0 ? '+' : ''}${w.over}` : ''}` : 'no dry weight set'}</Faint></> : <span className="text-muted">not weighed</span>}</span>
      {w.trend.length > 1 && <Sparkline points={w.trend.map((v, i) => ({ at: i, value: v.value, flag: i === w.trend.length - 1 && w.over != null && w.over >= 1 ? 'high' as const : undefined }))}
        band={w.dry ? { low: w.dry.value - 0.5, high: w.dry.value + 0.5 } : undefined} width={64} height={20} label={`Weight: ${w.trend.map((v) => v.value).join(', ')} kg`} />}</div>
    <Label>The four medicines</Label>
    {groups.map((g) => <div key={g.group} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2 border-t border-line py-1 text-13">
      <span className="text-12 text-faint">{g.title}</span>
      <span className="min-w-0">{g.med ? <span className="text-fg">{g.med.drug_name} {g.med.dose_number ?? ''}{g.med.dose_unit ? ` ${g.med.dose_unit}` : ''} {g.med.frequency ?? ''}</span> : <span className="text-warn">not on</span>}
        {g.target && <span className="block text-12 text-faint">target {g.target.name}</span>}</span>
      <Tag tone={TONE[g.standing]}>{g.standing}</Tag></div>)}
    <Row k="Beside them">{[b.k && `K ${b.k.value}`, b.creat && `creatinine ${b.creat.value}`, b.egfr && `eGFR ${b.egfr.value}`].filter(Boolean).join(' · ') || '—'}
      {(b.k ?? b.creat) && <Faint> · {shortDate((b.k ?? b.creat)!.at)}</Faint>}</Row>
    <Row k="For fluid">{diuretic.length ? diuretic.map((m) => `${m.drug_name} ${m.dose_number ?? ''} ${m.dose_unit ?? ''} ${m.frequency ?? ''}`.replace(/\s+/g, ' ').trim()).join(' · ') : <span className="text-muted">no diuretic</span>}</Row>
    <Row k="AF">{score ? <>CHA₂DS₂-VASc {String(score.data?.total)} <Faint>{shortDate(score.occurred_at)}</Faint></> : <span className="text-muted">no CHA₂DS₂-VASc: /chadsvasc</span>}
      {anticoag.length > 0 && <span className="text-muted"> · {anticoag.map((m) => `${m.drug_name} ${m.dose_number ?? ''} ${m.dose_unit ?? ''} ${m.frequency ?? ''}`.replace(/\s+/g, ' ').trim()).join(' · ')}</span>}</Row>
  </div>
}
