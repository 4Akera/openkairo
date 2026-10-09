// Development and the newborn checks in the chart, and /dev's card under the line (spec/openCare.md §5.8, the picture #paeds-develop).
// The Development section lists each check by its list's age (each area all yes, or not yet); the Newborn checks section the birth,
// the heel prick, hearing, hips, eyes and jaundice from base entries. /dev opens the clinic's list for the child's age: each milestone
// yes or not yet (←→ on a row), and, not yet past the list's age, a notice with what to do next as chips taken into the check's plan.
import { useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { SectionBody } from '@core/screens/chart/sections'
import type { CardEditorProps } from '@core/screens/visit/commands'
import type { Ctx } from '@core/screens/visit/parse'
import { useDepartment } from '@core/hooks/organization'
import { useFacts } from '@core/hooks/chart'
import { Chip, Empty, cn, shortDate } from '@core/ui'
import { AREAS, ageMonths, hearingRefer, lateOf, newCheck, newbornOf, recordedOf, withSummary, type DevData } from './develop'
import { milestonesOf } from './settings'

const th = 'py-1 pe-2 text-start text-11 font-medium uppercase tracking-[0.04em] text-faint'
const td = 'py-1 pe-2 text-13'

export function DevelopmentBody({ p, own }: SectionBody) {
  const checks = recordedOf(own.shown)
  if (!checks.length) return <Empty size="sm">No development check yet: /dev</Empty>
  const version = checks[checks.length - 1].version
  return <div className="grid gap-1">
    {version && <p className="text-12 text-faint">the clinic&apos;s list · {version}</p>}
    <table className="w-full"><thead><tr><th className={th} />{checks.map((c) => <th key={c.entry.id} className={th}>
      <button type="button" onClick={() => p.open(c.entry.id)} className="rounded-sm uppercase hover:underline focus-ring" title={shortDate(c.entry.occurred_at)}>{c.label}</button></th>)}</tr></thead>
      <tbody>{AREAS.map((a) => <tr key={a.key} className="border-t border-line"><td className={cn(td, 'text-muted')}>{a.label}</td>
        {checks.map((c) => { const v = c.byArea[a.key]
          return <td key={c.entry.id} className={td}>{v === 'yes' ? <span className="text-ok">✓</span> : v ? <span className="text-12 font-medium text-warn">not yet</span> : <span className="text-faint">—</span>}</td> })}</tr>)}</tbody></table>
  </div>
}

export function NewbornBody({ p }: SectionBody) {
  const rows = newbornOf(p.facts)
  if (!rows.length) return <Empty size="sm">No newborn checks recorded</Empty>
  return <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-13">{rows.map((r) => <div key={r.code} className="contents">
    <dt className={cn('text-muted', r.refer && 'text-warn')}>{r.label}</dt>
    <dd><button type="button" onClick={() => p.open(r.entry.id)} className={cn('rounded-sm text-start hover:underline focus-ring', r.refer && 'font-medium text-warn')}>{r.text || r.entry.line}</button></dd></div>)}</dl>
}

const pronoun = (sex: string | undefined) => sex === 'female' ? ['she', 'her'] : sex === 'male' ? ['he', 'his'] : ['the child', 'their']

/** /dev's card: the list for the age, yes or not yet on each, the notice and its chips */
export function DevCard({ q, set, ctx }: CardEditorProps) {
  const { org } = useDepartment()
  const pt = (ctx as Ctx).record?.patient
  const months = ageMonths(pt?.born_on)
  const ms = milestonesOf(org)
  const facts = useFacts(pt?.id ?? null)
  const d = q as Partial<DevData>
  // the list for the age, once, from the clinic's setting (its source kept as the check's version)
  useEffect(() => {
    if (d.paeds || months === null) return
    const fresh = newCheck(ms.milestones, months, ms.source ?? undefined)
    if (fresh) set(fresh as unknown as Record<string, unknown>)
  }, [d.paeds, months]) // eslint-disable-line react-hooks/exhaustive-deps
  if (months === null) return <p className="text-13 text-warn">The birth date is not recorded: the list goes by age.</p>
  if (!d.paeds) return <p className="text-13 text-muted">{ms.milestones.length ? 'Opening the list…' : 'The clinic has no milestones yet (Settings → Packs → Paediatrics).'}</p>
  const full = d as DevData; const dp = full.paeds
  const [he, his] = pronoun(pt?.sex)
  const put = (patch: Partial<DevData['paeds']>) => set(withSummary({ ...full, paeds: { ...dp, ...patch } }) as unknown as Record<string, unknown>)
  const toggle = (i: number, yes: boolean) => put({ items: dp.items.map((x, j) => j === i ? { ...x, yes } : x) })
  const plan = dp.plan ?? []
  const take = (w: string) => put({ plan: plan.includes(w) ? plan.filter((x) => x !== w) : [...plan, w] })
  const late = lateOf(full)
  const refer = hearingRefer(newbornOf(facts.data))
  const talkingLate = late.some((i) => i.area === 'talking' || i.area === 'social')
  const chips = [...(talkingLate || refer ? ['hearing test (ABR)'] : []), 'refer to the development clinic', `look again at ${dp.months + 3} months`]
  return <div className="grid gap-2">
    <p className="flex flex-wrap items-center gap-2 text-13"><b className="text-14 font-semibold text-fg">Development · the {dp.list} list</b>
      <span className="text-muted">{he} is {months} months · each milestone is what 3 in 4 children do by this age</span></p>
    <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">{AREAS.map((a) => { const is = dp.items.map((x, i) => ({ x, i })).filter(({ x }) => x.area === a.key); if (!is.length) return null
      return <div key={a.key} className="grid content-start gap-1"><p className="text-11 font-medium uppercase tracking-[0.06em] text-faint">{a.label}</p>
        {is.map(({ x, i }) => <p key={i} className="flex items-center gap-1.5 text-13" onKeyDown={(e) => { if (e.key === 'ArrowLeft') toggle(i, true); if (e.key === 'ArrowRight') toggle(i, false) }}>
          <span className={cn('min-w-0 flex-1', x.yes ? 'text-fg' : 'font-medium text-warn')}>{x.text}</span>
          <Chip data-chip on={x.yes} onClick={() => toggle(i, true)}>yes</Chip><Chip data-chip on={!x.yes} onClick={() => toggle(i, false)}>not yet</Chip></p>)}</div> })}</div>
    {late.length > 0 && <div className="flex gap-2.5 rounded-lg bg-warn-soft px-3 py-2 text-14 text-warn ring-1 ring-inset ring-warn-line"><TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="grid gap-1"><p className="font-medium">Not yet at {months} months: {late.map((i) => (i.short || i.text).toLowerCase()).join(', ')}</p>
        <p className="text-13 text-fg">Most children do {late.length > 1 ? 'these' : 'this'} by {dp.months} months.{refer ? ` The newborn hearing screen said refer and was never repeated.` : ''} Shown, never a stop: {his} doctor decides.</p>
        <div className="flex flex-wrap gap-1.5 pt-1">{chips.map((c) => <Chip key={c} data-chip on={plan.includes(c)} onClick={() => take(c)}>{c}</Chip>)}</div>
        <p className="text-12 text-muted">A chip taken goes into the check&apos;s plan; the order or referral itself is its own line (/order).</p></div></div>}
  </div>
}
