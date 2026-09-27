// Allergies & alerts (chart-plan.md §2 #26, from visit/Side.tsx): the active alerts first (from the facts page: nothing writes them
// yet, so none), then the active allergies with the reactions, severity and class; Refute (a draft) and Undo; the ones drafted here;
// the "no known allergies" line (checked, drafted, or not asked with its button); the review toggle; + (Alt+A). The others — ruled
// out, inactive, resolved, and alerts that are over — fold under one line.
import { useMemo, useState } from 'react'
import { TriangleAlert, X } from 'lucide-react'
import { Badge, Button, Empty, IconButton, Section, Skeleton, Tag, cn, shortDate, ymd } from '../../../ui'
import { classOfAllergy } from '../../visit/catalog'
import { ALLERGY_STATUS, partialWords } from '../model/labels'
import { alertsOf, allergiesOf, type AllergyRow, type FactRow } from '../model/record'
import { DRAFT, useListDrafts, type ListDrafts } from './actions'
import { AddButton, DraftRow, Fact, More, ReviewToggle, RowActions, Undo } from './parts'
import type { Panel } from './RecordPanel'

const SEVERITY = { severe: 'danger', moderate: 'warn', mild: 'neutral' } as const

export function Allergies({ p }: { p: Panel }) {
  const types = p.ctx.org?.types
  const a = useMemo(() => allergiesOf(p.rec, p.ctx), [p.rec, p.ctx]); const alerts = useMemo(() => alertsOf(p.facts ?? [], types), [p.facts, types])
  const d = useListDrafts(p.patientId); const [others, setOthers] = useState(false)
  const added = d.drafted('allergy', 'add'); const folded = a.other.length + alerts.inactive.length
  return <Section id="chart.allergies" variant="compact" title="Allergies & alerts" count={alerts.active.length + a.active.length + added.length}
    summary={[...alerts.active.map((x) => x.text), ...a.active.map((x) => x.substance_name)].slice(0, 3).join(', ')}
    right={<><ReviewToggle p={p} d={d} list="allergies" at={a.review} /><AddButton p={p} line="/al " keyName="A" action="write:allergy" /></>}>
    {p.factsLoading && <Skeleton lines={1} className="py-1.5" />}
    {alerts.active.length > 0 && <ul className="divide-y divide-line">{alerts.active.map((x) => <Alert key={x.item} p={p} x={x} />)}</ul>}
    {a.active.length + added.length === 0 && <NoneKnown p={p} d={d} checked={a.nka} at={a.review?.reviewed_at ?? null} />}
    <ul className="divide-y divide-line">
      {a.active.map((x) => <Active key={x.id} p={p} d={d} x={x} />)}
      {added.map((x) => <DraftRow key={x.id} onUndo={() => d.remove(x.id)}>{x.line.replace(/^(Allergy|Intolerance): /, '')}</DraftRow>)}
    </ul>
    {folded > 0 && <More n={folded} onClick={() => setOthers(!others)}>{others ? 'Hide ruled out and inactive' : `Ruled out / inactive (${folded})`}</More>}
    {others && <ul className="mt-1 divide-y divide-line">
      {a.other.map((x) => <li key={x.id} className="flex flex-wrap items-baseline gap-x-1.5 py-1.5 text-13">
        <Fact onOpen={x.entry_id ? () => p.open(x.entry_id!) : undefined} className="font-medium text-muted">{x.substance_name}</Fact>
        <span className="text-12 text-faint">{x.ruled_out ? ALLERGY_STATUS.refuted : ALLERGY_STATUS[x.status] ?? x.status}</span></li>)}
      {alerts.inactive.map((x) => <li key={x.item} className="py-1.5 text-13 text-faint"><Fact onOpen={() => p.open(x.entry.id)} className="line-through">{x.text}</Fact>
        <span className="ms-1.5 text-12">Inactive</span></li>)}
    </ul>}
  </Section>
}

/** an active alert: danger, with since when and its note */
function Alert({ p, x }: { p: Panel; x: FactRow }) {
  return <li className="flex items-start gap-1.5 py-2 text-13 text-danger"><TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
    <div className="min-w-0 flex-1"><Fact onOpen={() => p.open(x.entry.id)} className="font-medium">{x.text}</Fact><span className="sr-only"> (alert)</span>
      {(x.when || x.note) && <p className="text-12 text-faint">{x.when && `since ${partialWords({ value: x.when }, ymd)}`}{x.when && x.note && ' — '}{x.note}</p>}</div>
    <Tag tone="danger">Alert</Tag>
  </li>
}

/** an active allergy as Side.tsx drew it: refuting strikes it until Done; Refute on hover */
function Active({ p, d, x }: { p: Panel; d: ListDrafts; x: AllergyRow }) {
  const pend = d.pending('allergy', 'allergy_id', x.id); const cls = classOfAllergy(x)
  return <li className="group flex items-start gap-2 py-2">
    <div className={cn('min-w-0 flex-1', pend && 'line-through opacity-50')}>
      <p className="text-13 font-medium text-danger"><Fact onOpen={x.entry_id ? () => p.open(x.entry_id!) : undefined}>{x.substance_name}</Fact>
        {x.kind === 'intolerance' && <Badge className="ms-1.5">intolerance</Badge>}
        {x.severity && <Badge tone={SEVERITY[x.severity as keyof typeof SEVERITY] ?? 'warn'} className="ms-1.5">{x.severity}</Badge>}
        {x.high_risk && <Badge tone="danger" className="ms-1.5">high risk</Badge>}</p>
      {(x.reactions_text || cls) && <p className="text-12 text-faint">{x.reactions_text}{x.reactions_text && cls && ' · '}{cls && `${cls.replace(/_/g, ' ')} class`}</p>}
    </div>
    {p.writes('write:allergy') && (pend ? <Undo onClick={() => d.remove(pend.id)} /> : <RowActions>
      <IconButton title="Not an allergy (refute)" aria-label={`${x.substance_name} is not an allergy (refute)`} tone="danger" onClick={() => d.add(DRAFT.refute(x))}><X /></IconButton></RowActions>)}
  </li>
}

/** no allergies listed: checked on a date (unless no known allergies is drafted now), drafted (signed on Done), or not asked yet */
function NoneKnown({ p, d, checked, at }: { p: Panel; d: ListDrafts; checked: boolean; at: string | null }) {
  if (checked && at && !d.nka) return <Empty size="sm" className="text-ok">No known allergies · checked {shortDate(at)}</Empty>
  return <div className="flex items-center gap-2 py-1.5 text-12">
    <span className={d.nka ? 'font-medium text-accent' : 'text-warn'}>{d.nka ? 'No known allergies — signed on Done' : 'Not asked yet'}</span>
    {p.writes('write:list_review') && (d.nka ? <Undo onClick={() => d.remove(d.nka!.id)} />
      : <Button size="xs" variant="outline" className="ms-auto" onClick={() => d.add(DRAFT.noneKnown())}>No known allergies</Button>)}
  </div>
}
