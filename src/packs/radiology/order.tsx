// Radiology's order words (spec/openCare.md §5.1 rule 1, §5.5; the picture "Radiology · the doctor orders a CT"): /xr, /us, /ct and
// /mri, each its kind of Radiology's exams, offered wherever a department using the pack works for this one. On the line: the exam,
// left · right · both, +c (with contrast; nothing is without), portable, report (an X-ray read by Radiology), urgent or stat, and
// "? the question". The order carries radiology's words (its own order type, core change (a)). Under the card: what to tell the
// patient, and before contrast or an X-ray the facts the chart already shows (eGFR and its age, metformin, allergies, pregnant): shown,
// never a stop — the doctor decides (core change (b)).
import { useDepartment } from '@core/hooks/organization'
import type { Ctx, Parsed } from '@core/screens/visit/parse'
import { Tag } from '@core/ui'
import { IONIZING, examOf } from './exams'
import { factsOf, type Facts } from './facts'
import { registerKinds } from './line'

/** under the card: what to tell the patient for each exam chosen, then the facts before contrast or an X-ray (shown, never a stop) */
function ExamNote({ items, ctx }: { items: Parsed[]; ctx: Ctx }) {
  const { org } = useDepartment()
  const chosen = items.flatMap((p) => { const s = p.function === 'order' ? org?.services.find((x) => x.id === p.params.service_id) : undefined; return s ? [s] : [] })
  if (!chosen.length) return null
  const exams = chosen.map((s) => ({ s, e: examOf(org, s) }))
  const contrast = exams.some((x) => x.e.contrast); const ionizing = chosen.some((s) => IONIZING.includes(s.section_name ?? ''))
  const sideMissing = exams.filter((x) => x.e.side && !(items.find((p) => p.params.service_id === x.s.id)?.params.as as { words?: { side?: string } } | undefined)?.words?.side)
  const facts = factsOf(ctx.record, ctx.facts)
  return <span className="grid gap-1">
    {exams.filter((x) => x.e.prep).map((x) => <span key={x.s.id} className="flex flex-wrap items-center gap-x-2">
      <span>{chosen.length > 1 ? `${x.s.name}: ` : 'Tell the patient: '}{x.e.prep!.toLowerCase()}</span>{x.e.prep_ar && <span dir="rtl" lang="ar" className="text-13 text-fg">{x.e.prep_ar}</span>}</span>)}
    {sideMissing.length > 0 && <span className="font-medium text-warn">Which side? Type left, right or both ({sideMissing.map((x) => x.s.name).join(', ')}).</span>}
    {(contrast || ionizing) && <FactsLine facts={facts} contrast={contrast} pregnancy={ionizing} />}
  </span>
}

/** the facts before contrast and an X-ray, from what the chart shows; nothing here stops the order */
export function FactsLine({ facts, contrast, pregnancy, label = true }: { facts: Facts; contrast: boolean; pregnancy: boolean; label?: boolean }) {
  return <span className="flex flex-wrap items-center gap-1.5">
    {contrast && label && <span className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Before contrast</span>}
    {contrast && (facts.egfr ? <><Tag tone={facts.egfr.value < 30 ? 'danger' : facts.egfr.value < 45 ? 'warn' : 'ok'}>eGFR {facts.egfr.value}</Tag>
      <span className="text-muted">{facts.egfr.worked && facts.creatinine ? `creatinine ${facts.creatinine.value} · ` : ''}{facts.egfr.days === 0 ? 'today' : `${facts.egfr.days} ${facts.egfr.days === 1 ? 'day' : 'days'} ago`}</span></>
      : facts.creatinine ? <Tag tone="warn">creatinine {facts.creatinine.value} · {facts.creatinine.days} days ago</Tag> : <Tag tone="warn">no recent eGFR</Tag>)}
    {contrast && facts.metformin && <Tag tone="warn">{facts.metformin}</Tag>}
    {contrast && (facts.contrastAllergy ? <Tag tone="danger">allergy: {facts.contrastAllergy}</Tag> : facts.allergies.length ? <Tag>allergies: {facts.allergies.join(', ')}</Tag> : facts.allergiesAsked ? <Tag>no known allergies</Tag> : <Tag tone="warn">allergies not asked</Tag>)}
    {pregnancy && facts.pregnancy && <Tag tone={facts.pregnancy === 'pregnant' ? 'danger' : 'neutral'}>{facts.pregnancy === 'pregnant' ? 'pregnant' : 'not pregnant'}</Tag>}
    {pregnancy && !facts.pregnancy && facts.mayBePregnant && <span className="text-muted">Pregnant? Not recorded: <span className="font-mono">/preg no</span> records it; Radiology asks at the door anyway.</span>}
  </span>
}

registerKinds((items, ctx) => <ExamNote items={items} ctx={ctx} />)
