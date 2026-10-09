// The Blood bank's cards (spec/openCare.md §5.8; the pictures #haem-blood, #haem-bedside): under /blood, what the chart already shows
// (Hb and platelets, the weight for mL/kg, allergies; core change (b)) and the sample to take — shown, never a stop; the bedside card of one
// unit: the two who checked and the six checks, the signs before, at 15 minutes and at the end, and Stop with the reaction.
import type { ReactNode } from 'react'
import { useDepartment } from '@core/hooks/organization'
import type { CardEditorProps } from '@core/screens/visit/commands'
import type { Ctx, Parsed } from '@core/screens/visit/parse'
import { Button, Chip, Input, NumberInput, Tag, cn } from '@core/ui'
import { Cap } from './Cap'
import { CHECKS, ML, PRODUCTS, REACTIONS, WHEN, bedsideMissing, bedsideOf, transfusionData, type Bedside, type BloodWords, type Signs } from './blood'

const K = ({ children }: { children: ReactNode }) => <span className="w-28 shrink-0 text-12 text-faint">{children}</span>
const last = (ctx: Ctx, code: string) => (ctx.record?.values ?? []).filter((v) => v.code === code || v.key === code).sort((a, b) => b.at.localeCompare(a.at))[0]

/** under /blood: her Hb and platelets, the volume at her weight, allergies, the consent, the sample (a purple tube labelled at her side) */
export function BloodNote({ items, ctx }: { items: Parsed[]; ctx: Ctx }) {
  const o = items.find((p) => (p.params.as as { type?: string } | undefined)?.type === 'lis.blood'); if (!o) return null
  const w = (o.params.as as { words: BloodWords }).words; const hb = last(ctx, 'loinc:718-7'); const plt = last(ctx, 'loinc:777-3'); const kg = last(ctx, 'weight')
  const ml = ML[w.product] * w.units; const allergies = (ctx.record?.allergies ?? []).filter((a) => a.status === 'active')
  return <span className="grid gap-1.5">
    <span className="flex flex-wrap items-center gap-1.5"><span className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">From the record</span>
      {hb ? <Tag tone={hb.interpretation && hb.interpretation !== 'N' ? 'warn' : 'neutral'}>Hb {hb.value} · {new Date(hb.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Tag> : <Tag tone="warn">no Hb on the record</Tag>}
      {plt && <span className="text-muted">platelets {plt.value}</span>}
      {allergies.length ? <Tag tone="warn">allergies: {allergies.map((a) => a.substance_name).join(', ')}</Tag> : ctx.record?.allergy_review ? <Tag>no known allergies</Tag> : <Tag tone="warn">allergies not asked</Tag>}</span>
    <span className="text-13 text-fg">{PRODUCTS[w.product]} × {w.units} ≈ {ml} mL{kg ? ` · ${Math.round(ml / kg.value)} mL/kg at ${kg.value} kg` : ''}</span>
    <span className="flex flex-wrap items-center gap-1.5 text-13"><span className="text-muted">Consent</span><Tag tone={w.consent === 'on file' ? 'ok' : 'neutral'}>{w.consent}</Tag>
      <span className="text-muted">· sample</span>{w.product === 'rbc' && w.sample === 'taken here' ? <><Cap cap="purple" /><span className="text-fg">1 purple EDTA 6 mL, labelled by hand at the bedside</span></> : <span className="text-fg">{w.sample}</span>}</span>
    <span className="text-12 text-faint">The Blood bank's steps: the sample received, grouped and screened, crossmatched, each unit issued by its number.</span>
  </span>
}

/** the bedside card of one unit */
export function BedsideCard({ q, set, ctx }: CardEditorProps) {
  const { b, ml } = bedsideOf(q); const { org } = useDepartment()
  const put = (patch: Partial<Bedside>, v = ml) => set(transfusionData({ ...b, ...patch }, v))
  const sign = (when: Signs['when']) => b.signs.find((s) => s.when === when) ?? { when }
  const setSign = (s: Signs) => put({ signs: [...b.signs.filter((x) => x.when !== s.when), s].sort((a, c) => WHEN.indexOf(a.when) - WHEN.indexOf(c.when)) })
  const stopped = !!b.reaction?.what.length; const missing = bedsideMissing(b); const now = () => new Date().toTimeString().slice(0, 5)
  const F = (s: Signs, k: 'temp' | 'sys' | 'dia' | 'pulse' | 'rr' | 'spo2', integer = true) => <NumberInput dense integer={integer} label={`${s.when} ${k}`} value={s[k] ?? null} onValue={(v) => setSign({ ...s, [k]: v ?? undefined, at: s.at ?? now() })} className="w-14" />
  return <div className="grid gap-2 text-13">
    <p className="flex flex-wrap items-center gap-2"><b className="text-14 font-semibold text-fg">Unit · {b.unit}</b><span className="text-muted">{b.product ? PRODUCTS[b.product] : ''}{ml ? ` · ${ml} mL` : ''}</span>
      <label className="flex items-center gap-1"><K>Group on the bag</K><Input dense value={b.group ?? ''} onChange={(e) => put({ group: e.target.value })} className="w-28" /></label>
      {stopped && <Tag tone="danger" className="ms-auto">stopped {b.ended ?? ''}</Tag>}</p>
    <div className="grid gap-1.5 rounded-lg bg-surface p-2.5 ring-1 ring-line">
      <p className="flex flex-wrap items-center gap-2"><K>Checked by</K><span className="text-fg">{org?.me.name ?? 'you'}</span>and
        <Input dense placeholder="the second person" value={b.second} onChange={(e) => put({ second: e.target.value })} className="w-48" /></p>
      <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">{CHECKS.map((c) => <li key={c}><Chip variant="check" on={b.checks.includes(c)}
        onClick={() => put({ checks: b.checks.includes(c) ? b.checks.filter((x) => x !== c) : [...b.checks, c] })}>{c}</Chip></li>)}</ul></div>
    <table className="w-full text-13 tnum"><thead><tr className="text-11 uppercase tracking-[0.06em] text-faint">{['Signs', 'Temp', 'BP', 'Pulse', 'Breaths', 'SpO₂'].map((h) => <th key={h} className="py-1 pe-2 text-start font-medium">{h}</th>)}</tr></thead>
      <tbody>{WHEN.filter((x) => x !== 'reaction' || stopped).map((x) => { const s = sign(x); return <tr key={x} className="border-t border-line">
        <td className={cn('py-1 pe-2', x === 'reaction' && 'font-medium text-danger')}>{x}{s.at ? ` · ${s.at}` : ''}</td><td className="py-1 pe-2">{F(s, 'temp', false)}</td>
        <td className="py-1 pe-2"><span className="flex items-center gap-1">{F(s, 'sys')}/{F(s, 'dia')}</span></td><td className="py-1 pe-2">{F(s, 'pulse')}</td><td className="py-1 pe-2">{F(s, 'rr')}</td><td className="py-1">{F(s, 'spo2')}</td></tr> })}</tbody></table>
    {!stopped ? <p className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" onClick={() => put({ reaction: { what: [REACTIONS[0]], severity: 'mild' }, ended: now() })}>Stop · a reaction</Button>
      <label className="flex items-center gap-1"><K>Ended</K><Input dense type="time" value={b.ended ?? ''} onChange={(e) => put({ ended: e.target.value || undefined })} className="w-28" /></label>
      <label className="flex items-center gap-1"><K>Volume</K><NumberInput dense integer label="Volume" value={ml} onValue={(v) => put({}, v)} className="w-16" /><span className="text-12 text-faint">mL</span></label></p>
      : <div className="grid gap-1.5 rounded-lg border border-danger-line bg-surface p-2.5">
        <p className="flex flex-wrap items-center gap-1.5"><K>What</K>{REACTIONS.map((r) => <Chip key={r} variant="check" on={b.reaction!.what.includes(r)}
          onClick={() => put({ reaction: { ...b.reaction!, what: b.reaction!.what.includes(r) ? b.reaction!.what.filter((x) => x !== r) : [...b.reaction!.what, r] } })}>{r}</Chip>)}</p>
        <p className="flex flex-wrap items-center gap-1.5"><K>How bad</K>{['mild', 'moderate', 'severe'].map((s) => <Chip key={s} on={b.reaction!.severity === s} onClick={() => put({ reaction: { ...b.reaction!, severity: s } })}>{s}</Chip>)}</p>
        <p className="text-12 text-muted">Each a tick: the line kept open with saline · the label checked against the patient again · the doctor told · the bag and its set kept for the Blood bank.</p>
        <p className="flex flex-wrap items-center gap-1.5"><K>The doctor</K>{['restart slowly when settled', 'do not restart · return the unit'].map((d) => <Chip key={d} on={b.reaction!.doctor === d}
          onClick={() => put({ reaction: { ...b.reaction!, doctor: d } })}>{d}</Chip>)}</p>
        <label className="flex items-center gap-1"><K>Volume given</K><NumberInput dense integer label="Volume given" value={ml} onValue={(v) => put({}, v)} className="w-16" /><span className="text-12 text-faint">mL</span></label></div>}
    {missing && <p className="text-12 text-warn">{missing}</p>}
    <p className="text-12 text-faint">Signs before, at 15 minutes and at the end; the next due {b.signs.some((s) => s.when === '15 min') ? 'at the end, then within the hour after' : b.signs.some((s) => s.when === 'before') ? 'at 15 minutes' : 'before it starts'}.
      {ctx.record?.patient ? ` ${ctx.record.patient.given_name} ${ctx.record.patient.family_name}, #${ctx.record.patient.record_number}.` : ''}</p>
  </div>
}
