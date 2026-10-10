// /vax in the composer (spec/openCare.md §5.8; picture #vax-chart): the dose's card — site, lot and expiry, who gave it, given here or
// copied from the card with its date, or not given and why — and under the card, the child's schedule worked out: what is due and
// overdue, the facts to ask (temperature, allergies, a live vaccine in the last four weeks), the optional ones not chosen, the next.
import { usePackEntries } from '@core/hooks/chart'
import { useDepartment } from '@core/hooks/organization'
import { compose } from '@core/hooks/composer'
import type { CardEditorProps } from '@core/screens/visit/commands'
import { packTypes } from '@core/screens/chart/sections'
import { wordTypes } from '@core/screens/chart/words'
import type { Ctx, Parsed } from '@core/screens/visit/parse'
import { Chip, FormRow, Input, Segmented, cn, hm, shortDate, ymd } from '@core/ui'
import { ROUTE_WORDS, SITE_CHOICES, doseLine, seriesOf, type DoseData } from './line'
import { LIVE, addDays, ageWords, daysBetween, dosesOf, scheduleOf, statusOf, summaryOf } from './schedule'
import { bookFor, booksHere } from './book'

const small = 'h-7 text-13'
/** the dose's card: every field the line may have said, editable */
export function DoseCard({ q, set }: CardEditorProps) {
  const d = q as unknown as DoseData; const { org } = useDepartment(); const me = org?.me.name ?? 'me'
  const v = d.vaccines ?? { vaccine: '', source: 'here' }
  const setV = (patch: Partial<DoseData['vaccines']>) => set({ vaccines: { ...v, ...patch } })
  const given = d.status !== 'not-done'
  return <div className="grid gap-1.5">
    <FormRow inline label="">
      <Segmented size="sm" aria-label="Given or not" value={given ? 'completed' : 'not-done'} onChange={(x) => set({ status: x, ...(x === 'not-done' ? { site: undefined } : {}) })} options={[['completed', 'Given'], ['not-done', 'Not given']]} />
      {given && <Segmented size="sm" aria-label="Where" value={v.source ?? 'here'} onChange={(x) => setV({ source: x as 'here' | 'card' })} options={[['here', 'Here'], ['card', 'From the card']]} />}
      {given && v.source === 'card' && <Input aria-label="The card's date" type="date" value={v.given_on ?? ''} onChange={(e) => setV({ given_on: e.target.value || undefined })} className={cn(small, 'w-40', !v.given_on && 'border-warn')} />}
    </FormRow>
    {!given && <FormRow inline label="Why"><Input aria-label="Why not" value={d.reason ?? ''} onChange={(e) => set({ reason: e.target.value || undefined })} placeholder="fever 39 °C, the parents declined…" className={cn(small, 'max-w-sm flex-1', !d.reason && 'border-warn')} /></FormRow>}
    {given && v.source !== 'card' && <>
      <FormRow inline label="Lot"><Input aria-label="Lot" value={d.lot ?? ''} onChange={(e) => set({ lot: e.target.value || undefined })} className={cn(small, 'w-28 font-mono')} />
        <span className="text-12 text-faint">expiry</span><Input aria-label="Expiry" value={d.expiry ?? ''} onChange={(e) => set({ expiry: e.target.value || undefined })} placeholder="03/2027" className={cn(small, 'w-24')} />
        {d.route && <span className="text-12 text-faint">{ROUTE_WORDS[d.route] ?? d.route}</span>}</FormRow>
      {d.route !== 'oral' && <FormRow inline label="Site">{SITE_CHOICES.map((s) => <Chip data-chip key={s} on={d.site === s} onClick={() => set({ site: d.site === s ? undefined : s })}>{s.charAt(0).toUpperCase() + s.slice(1)}</Chip>)}</FormRow>}
      <FormRow inline label="Given by"><Chip data-chip on={!v.given_by} onClick={() => setV({ given_by: undefined })}>{me}</Chip>
        <Input aria-label="Given by another" value={v.given_by ?? ''} onChange={(e) => setV({ given_by: e.target.value || undefined })} placeholder="another…" className={cn(small, 'w-40')} /></FormRow>
    </>}
  </div>
}
export const cardLine = (params: Record<string, unknown>) => doseLine(params as unknown as DoseData)

/** under the card: the child's schedule worked out, what to ask first, the optional ones not chosen, the next */
export function VaxNote({ items, ctx }: { items: Parsed[]; ctx: Ctx }) {
  const { org } = useDepartment(); const patient = ctx.record?.patient
  // the chart's own read of the packs' entries (the same types, so the same read): the doses are already there
  const entries = usePackEntries(patient?.id ?? null, [...new Set([...packTypes(), ...wordTypes()])])
  if (!patient) return null
  if (entries.isLoading) return <p className="text-12 text-faint">Reading the child&apos;s doses…</p>
  const today = ymd(new Date().toISOString()); const sched = scheduleOf(org); const doses = dosesOf(entries.data)
  const states = statusOf(sched.rows, doses, patient.born_on, today)
  const s = summaryOf(states)
  const chosen = items.map((i) => (i.params as unknown as DoseData).vaccines)
  const temp = ctx.record?.values.filter((x) => x.key === 'temperature').sort((a, b) => b.at.localeCompare(a.at))[0]
  const allergies = (ctx.record?.allergies ?? []).filter((a) => a.status === 'active')
  const live = doses.filter((x) => x.status === 'completed' && LIVE.has(x.vaccine) && daysBetween(x.given_at, today) < 28)
  // of each optional series its first dose not given, when due and not on the line already
  const optional = [...new Set(states.filter((x) => !x.row.national).map((x) => x.row.vaccine))]
    .map((v) => states.filter((x) => !x.row.national && x.row.vaccine === v && x.state !== 'given').sort((a, b) => a.row.dose - b.row.dose)[0])
    .filter((x) => x && (x.state === 'due' || x.state === 'overdue') && !chosen.some((c) => c?.vaccine === x.row.vaccine && c?.dose === x.row.dose))
  // the next, as if the doses on the card were given today
  const after = summaryOf(statusOf(sched.rows, [...doses, ...items.flatMap((i) => { const v = (i.params as unknown as DoseData).vaccines
    return v && (i.params as unknown as DoseData).status !== 'not-done' ? [{ item: i.id ?? v.vaccine, vaccine: v.vaccine, dose: v.dose ?? null, status: 'completed' as const, given_at: v.given_on ?? today, source: v.source }] : [] })],
    patient.born_on, today))
  const nextRows = after.next ? statusOf(sched.rows, doses, patient.born_on, today).filter((x) => x.row.national && x.row.age === after.next!.row.age) : []
  const liveNow = items.some((i) => LIVE.has((i.params as unknown as DoseData).vaccines?.vaccine ?? ''))
  return <div className="grid gap-1.5">
    <p className="flex flex-wrap items-baseline gap-2"><b className="text-14 font-semibold text-fg">Vaccines · {ageWords(patient.born_on, today)}</b>
      <span className="text-muted">{[s.due.length || s.overdue.length ? `due: ${[...s.overdue, ...s.due].map((x) => `${x.row.name}${x.state === 'overdue' ? ` (${x.weeksLate} weeks overdue)` : ''}`).join(', ')}` : 'nothing due now',
        optional.length ? `optional: ${optional.map((x) => x.row.name.toLowerCase()).join(', ')}` : null].filter(Boolean).join(' · ')}</span></p>
    <p className="text-12 text-muted">{[temp ? `Temp ${temp.value} °C at ${hm(temp.at)}` : 'no temperature today', allergies.length ? `allergies ${allergies.map((a) => a.substance_name).join(', ')}` : ctx.record?.allergy_review ? 'allergies none known' : 'allergies not asked',
      liveNow && live.length ? `a live vaccine ${shortDate(live[0].given_at)}: wait four weeks` : liveNow ? 'no live vaccine in the last 4 weeks' : null].filter(Boolean).join(' · ')}</p>
    {optional.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="text-12 text-faint">Optional, not chosen:</span>
      {optional.map((x) => { const ser = seriesOf(x.row.vaccine)
        return <Chip key={x.row.key} variant="check" onClick={() => compose({ text: `/vax ${[...items.map((i) => { const v = (i.params as unknown as DoseData).vaccines; return `${v.vaccine} ${v.dose ?? ''}`.trim() }), `${ser?.key ?? x.row.vaccine} ${x.row.dose}`].join(', ')}` })}>{x.row.name}</Chip> })}</div>}
    {after.next && <div className="rounded-lg border border-line bg-surface px-2.5 py-2"><p className="text-11 font-semibold uppercase tracking-[0.08em] text-faint">Next, worked out</p>
      <span className="text-fg">{after.next.row.age} · {shortDate(after.next.dueOn)} · {nextRows.map((x) => x.row.name).join(', ')}</span>
      {after.next.row.interval_days ? <span className="text-12 text-faint"> · {after.next.row.name} not before {shortDate(addDays(today, after.next.row.interval_days))} ({Math.round(after.next.row.interval_days / 7)} weeks after the last)</span> : null}
      {booksHere(ctx) && bookFor(today, after.next.dueOn) && <span className="block text-12 text-muted">Book it after ↵: <code className="rounded bg-sunken px-1 font-mono text-fg">{bookFor(today, after.next.dueOn)}</code></span>}</div>}
  </div>
}
