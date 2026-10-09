// The Chest section (spec/openCare.md §5.1 rule 2, §5.8; the picture #chest-spiro): the smoking, the GOLD group with CAT, mMRC and the
// flares (for asthma, ACT and the reversibility instead), the flares of the last year, the last spirometry, the inhalers and the technique,
// the eosinophils, the immunisations, the action plan in Arabic. Read-only; a row opens its entry. The plan prints later (printing is not in
// openCare yet).
import type { ReactNode } from 'react'
import type { SectionBody } from '@core/screens/chart/sections'
import { medicinesOf, problemsOf } from '@core/screens/chart/model/record'
import { Tag, cn, shortDate } from '@core/ui'
import { GOLD_WORD, eosinophils, flaresOf, givenOf, hasAsthma, inhalersOf, lastSpiro, latestOf, planOf, scoresOf, techniqueOk, valueText } from './airways'
import { ratio, spiroOf } from './spiro'

const Faint = ({ children }: { children: ReactNode }) => <span className="text-12 text-faint">{children}</span>
const Row = ({ k, children, tone }: { k: string; children: ReactNode; tone?: 'warn' }) => <div className="flex items-baseline gap-2 py-0.5 text-13">
  <span className="w-24 shrink-0 text-12 text-faint">{k}</span><span className={cn('min-w-0 flex-1', tone ? 'text-warn' : 'text-fg')}>{children}</span></div>
const Label = ({ children }: { children: ReactNode }) => <p className="pt-2 text-11 font-semibold uppercase tracking-[0.06em] text-faint">{children}</p>

export function Chest({ p, own }: SectionBody) {
  const s = scoresOf(own.shown); const asthma = hasAsthma(problemsOf(p.rec, p.ctx).active); const flares = flaresOf(own.shown, new Date())
  const smoke = latestOf(own.shown, '72166-2'); const tech = latestOf(own.shown, 'inhaler_technique'); const plan = planOf(latestOf(own.shown, 'action_plan'))
  const sp = lastSpiro(own.shown); const spr = sp ? spiroOf(sp.data) : null; const b = spr && (spr.post.fev1 != null ? spr.post : spr.pre)
  const pct = (sp?.data?.analytes as { key: string; value?: { value: string } }[] | undefined)?.find((a) => a.key === 'fev1_pct')?.value?.value
  const eos = eosinophils(p.rec.tables['base.values']?.rows ?? []); const inh = inhalersOf(medicinesOf(p.rec, p.ctx).current)
  const flu = givenOf(own.shown, 'J07BB'); const pneumo = givenOf(own.shown, 'J07AL')
  return <div className="grid gap-0.5">
    <Row k="Smoking">{smoke ? <>{valueText(smoke)}{typeof smoke.data?.note === 'string' && ` · ${smoke.data.note}`}</> : <span className="text-muted">not asked</span>}</Row>
    {asthma ? <Row k="ACT">{s.act ? <><span className={cn(s.act.total < 20 && 'font-medium text-warn')}>{s.act.total}</span> <Faint>{shortDate(s.act.at)} · {s.act.total >= 20 ? 'well controlled' : 'not well controlled'}</Faint></> : <span className="text-muted">not scored: /act</span>}</Row>
      : <Row k="GOLD group">{s.gold ? <><Tag tone={s.gold.band === 'e' ? 'warn' : 'neutral'}>{GOLD_WORD[s.gold.band] ?? s.gold.band}</Tag> {shortDate(s.gold.at)}
        {s.cat && ` · CAT ${s.cat.total}`}{s.mmrc && ` · mMRC ${s.mmrc.total}`} · {flares.length} {flares.length === 1 ? 'flare' : 'flares'}{flares.some((f) => /admit|hospital/i.test(f.where ?? '')) ? `, ${flares.filter((f) => /admit|hospital/i.test(f.where ?? '')).length} in hospital` : ''}</>
        : <span className="text-muted">not scored: /gold</span>}</Row>}
    <Label>Flares · last 12 months</Label>
    {flares.length ? <table className="w-full text-13"><thead><tr className="text-11 uppercase tracking-[0.06em] text-faint">{['When', 'Treated with', 'Where'].map((h) => <th key={h} className="py-1 pe-2 text-start font-medium">{h}</th>)}</tr></thead>
      <tbody>{flares.map((f) => <tr key={f.id} className="border-t border-line"><td className="py-1 pe-2"><button type="button" onClick={() => p.open(f.id)} className="rounded-sm hover:underline focus-ring">{shortDate(f.at)}</button></td>
        <td className="py-1 pe-2">{f.treated}</td><td className="py-1 text-muted">{f.where ?? '—'}</td></tr>)}</tbody></table> : <p className="text-13 text-muted">none written: /flare</p>}
    <Row k="Spirometry">{sp && b ? <button type="button" onClick={() => p.open(sp.id)} className="rounded-sm text-start hover:underline focus-ring">
      {shortDate(sp.occurred_at)} · FEV1 {b.fev1} L{pct ? ` (${pct} %)` : ''} · FEV1/FVC {ratio(b)}{spr?.post.fev1 != null ? ' after bronchodilator' : ''}</button> : <span className="text-muted">none yet: /spiro</span>}</Row>
    <Row k="Inhalers">{inh.length ? inh.map((m) => `${m.drug_name}${m.dose_number != null ? ` ${m.dose_number} ${m.dose_unit ?? ''}` : ''} ${m.frequency ?? ''}${m.prn ? ' when needed' : ''}`.replace(/\s+/g, ' ').trim()).join(' · ') : <span className="text-muted">none on the list</span>}</Row>
    <Row k="Technique" tone={tech && !techniqueOk(tech) ? 'warn' : undefined}>{tech ? <>{shortDate(tech.occurred_at)} · {valueText(tech)}</> : <span className="text-muted">not checked: /technique</span>}</Row>
    {eos && <Row k="Eosinophils">{eos.value} /µL <Faint>{shortDate(eos.at)}</Faint></Row>}
    <Row k="Immunisations">{flu ? `flu ${shortDate(flu.occurred_at)} ✓` : <span className="text-warn">flu not this season</span>} · pneumococcal {pneumo ? `${shortDate(pneumo.occurred_at)} ✓` : <span className="text-warn">never · due</span>}</Row>
    <Label>The action plan · Arabic</Label>
    {plan.length ? plan.map(([w, tone, ar]) => <p key={w} className="flex items-start gap-2 py-0.5"><Tag tone={tone} className="mt-0.5 w-20 shrink-0 justify-center">{w}</Tag>
      <span dir="rtl" lang="ar" className="text-13 text-fg">{ar}</span></p>) : <p className="text-13 text-muted">none yet: /plan</p>}
  </div>
}
