// Haematology's cards under the line (spec/openCare.md §5.8; the picture #haem-inr): today's INR against her target; the week — missed
// doses, food, bleeding, the clinic's table and its suggestion (Use takes it; nothing is applied by itself), the new week day by day, the
// next INR, her table in Arabic (it prints when printing comes); the plan's and the programme's fields.
import { useEffect, type ReactNode } from 'react'
import type { CardEditorProps } from '@core/screens/visit/commands'
import type { Ctx, Parsed } from '@core/screens/visit/parse'
import { usePackEntries } from '@core/hooks/chart'
import { packTypes } from '@core/screens/chart/sections'
import { wordTypes } from '@core/screens/chart/words'
import { useDepartment } from '@core/hooks/organization'
import { settingIn } from '@core/screens/settings/form/model'
import { Chip, Input, NumberInput, Tag, cn } from '@core/ui'
import type { Organization } from '@core/db/types'
import { DAYS, DAYS_AR, changed, interactionsOf, rowFor, sideOf, spread, suggest, tabletsAr, tabletsEn, total, type Row } from './inr'
import { planOf, weeksOf } from './weeks'
import { weekLine, type WeekParams } from './commands'

const K = ({ children }: { children: ReactNode }) => <span className="w-28 shrink-0 text-12 text-faint">{children}</span>
function Pick({ k, of, on, set, hint }: { k: string; of: string[]; on: string | undefined; set: (v: string) => void; hint?: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5 text-13"><K>{k}</K>{of.map((o) => <Chip key={o} on={on === o} onClick={() => set(o)}>{o}</Chip>)}{hint}</div>
}
export const tableOf = (org: Pick<Organization, 'settings' | 'settingKeys' | 'datatypes' | 'organization'> | undefined): Row[] =>
  (settingIn(org, 'haemato.inr', org?.organization.id).table ?? []) as Row[]
/** her INR clinic entries: the chart's own read of the packs' types (the same query, so it comes from what the chart already holds) */
const useMine = (patientId: string | undefined) => usePackEntries(patientId ?? null, [...new Set([...packTypes(), ...wordTypes()])]).data ?? []

/** today's INR: its target band set once her plan is read */
export function InrCard({ q, set, ctx }: CardEditorProps) {
  const plan = planOf(useMine(ctx.record?.patient?.id)); const a = (q.analytes as Record<string, unknown>[] | undefined)?.[0]; const v = Number((a?.value as { value?: string } | undefined)?.value)
  useEffect(() => { if (plan && a && !a.range) set({ analytes: [{ ...a, interpretation: v < plan.target.low ? 'L' : v > plan.target.high ? 'H' : 'N',
    range: { low: { value: String(plan.target.low) }, high: { value: String(plan.target.high) } } }] }) }, [plan?.target.low, plan?.target.high])   // eslint-disable-line react-hooks/exhaustive-deps
  if (!a || !/inr/i.test(String((q.code as { text?: string } | undefined)?.text ?? ''))) return null
  return <p className="flex flex-wrap items-center gap-2 text-13"><span className="text-14 font-semibold text-fg">INR <span className={cn(plan && sideOf(v, plan.target) !== 'in range' && 'text-warn')}>{v}</span></span>
    {plan ? <span className="text-muted">target {plan.target.low.toFixed(1)}–{plan.target.high.toFixed(1)} · {sideOf(v, plan.target)}</span> : <Tag tone="warn">no target set: /inrplan</Tag>}
    <span className="text-12 text-faint">{String(a.method ?? '')} · a result with no order</span></p>
}

/** the week: what happened, the clinic's suggestion, the new week, the next INR */
export function WeekCard({ q, set, ctx }: CardEditorProps) {
  const { org } = useDepartment(); const mine = useMine(ctx.record?.patient?.id); const plan = planOf(mine); const [now] = weeksOf(mine)
  const w = q as unknown as WeekParams; const tablet = plan?.tablet_mg ?? 5
  useEffect(() => { if (now && total(w.days) === 0) set({ days: now.days, was: total(now.days) }) }, [now?.id])   // eslint-disable-line react-hooks/exhaustive-deps
  const was = w.was ?? total(w.days); const row = w.inr != null ? rowFor(w.inr, tableOf(org), plan?.target) : null; const s = suggest(was, row, tablet)
  const put = (patch: Partial<WeekParams>) => set(patch as Record<string, unknown>)
  const take = () => { const days = spread(now?.days ?? w.days, s, tablet); put({ days, suggested: s, used_suggestion: true, next_inr: row ? new Date(Date.now() + row.next_days * 86_400_000).toISOString().slice(0, 10) : w.next_inr }) }
  return <div className="grid gap-1.5">
    <Pick k="Missed doses" of={['none', 'one', 'two or more']} on={w.missed} set={(missed) => put({ missed })} />
    <Pick k="Food" of={['as usual', 'more greens', 'fewer greens']} on={w.food} set={(food) => put({ food })} />
    <Pick k="Bleeding" of={['none', 'minor', 'major']} on={w.bleeding} set={(bleeding) => put({ bleeding })} />
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface p-2.5 text-13 ring-1 ring-line"><span className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">The clinic's table</span>
      {row ? <span className="text-fg">INR {row.from}–{row.to}: {row.says} · the next INR in {row.next_days} days</span> : <span className="text-muted">no row for this INR</span>}
      {row && row.change !== 0 && <Chip on={!!w.used_suggestion} className="ms-auto" onClick={take}>Use · {s} mg</Chip>}</div>
    <div className="grid gap-1"><K>The new week · mg</K>
      <div className="flex flex-wrap items-end gap-1.5">{DAYS.map((d, i) => <label key={d} className="grid gap-0.5 text-center"><span className="text-11 text-faint">{d}</span>
        <NumberInput dense label={d} value={w.days[i]} onValue={(v) => put({ days: w.days.map((x, j) => j === i ? v ?? 0 : x), used_suggestion: false })}
          className={cn('w-14 text-center', now && w.days[i] !== now.days[i] && 'font-semibold text-accent')} /></label>)}
        <span className="ms-2 pb-1.5 text-13 text-fg">= <b className="font-semibold">{total(w.days)} mg</b> a week <span className="text-muted">· was {was}{was ? ` · ${total(w.days) >= was ? '+' : ''}${Math.round((total(w.days) / was - 1) * 100)} %` : ''}{now && changed(now.days, w.days) ? ` · ${changed(now.days, w.days)}` : ''}</span></span></div>
      <p className="text-12 text-muted">{tabletsEn(w.days, tablet)}</p></div>
    <label className="flex flex-wrap items-center gap-2 text-13"><K>Next INR</K><Input dense type="date" value={w.next_inr ?? ''} onChange={(e) => put({ next_inr: e.target.value || undefined })} className="w-40" />
      <span className="text-12 text-faint">booking a time is the diary's</span></label>
  </div>
}

/** under /inr: her medicines that change the INR (shown, never a stop), and her table in Arabic */
export function InrNote({ items, ctx }: { items: Parsed[]; ctx: Ctx }) {
  const w = items.find((p) => p.function === 'haemato.week')?.params as WeekParams | undefined; const plan = planOf(useMine(ctx.record?.patient?.id))
  const acts = interactionsOf(ctx.record?.medications ?? []); if (!w) return null
  return <span className="grid gap-1.5">
    <span className="flex flex-wrap items-center gap-1.5"><span className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Her medicines and INR</span>
      {acts.length ? acts.map((x) => <Tag key={x.med.id} tone="info">{x.effect}: {x.med.drug_name} ({x.why})</Tag>) : <span className="text-muted">nothing on her list changes the INR</span>}</span>
    {total(w.days) > 0 && <span className="grid gap-1"><span className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">Her table, in Arabic · it prints when printing comes</span>
      <span dir="rtl" className="grid grid-cols-7 overflow-hidden rounded-md ring-1 ring-line">{DAYS_AR.map((d, i) => <span key={d} className="grid border-s border-line text-center first:border-s-0">
        <span lang="ar" className="bg-sunken py-1 text-12">{d}</span><span lang="ar" className="py-1 text-13 text-fg">{tabletsAr(w.days[i], plan?.tablet_mg ?? 5)}</span></span>)}</span>
      <span dir="rtl" lang="ar" className="text-13 text-fg">وارفارين {plan?.tablet_mg ?? 5} مجم · مرة واحدة يومياً الساعة ٦ مساءً{w.next_inr ? ` · تحليل السيولة القادم: ${w.next_inr}` : ''}</span>
      <span dir="rtl" lang="ar" className="text-13 text-fg">لا تغيّري الجرعة ولا تبدئي دواءً جديداً قبل سؤال العيادة · كُلي الملوخية والخضار الورقية بكمية ثابتة كل أسبوع</span></span>}
  </span>
}

/** the plan's and the programme's fields */
export function PlanCard({ q, set }: CardEditorProps) {
  const t = (q.target as { low: number; high: number } | undefined) ?? { low: 2, high: 3 }
  return <div className="grid gap-1.5 text-13">
    <label className="flex items-center gap-2"><K>For</K><Input dense value={String(q.reason ?? '')} onChange={(e) => set({ reason: e.target.value })} /></label>
    <div className="flex items-center gap-2"><K>Target INR</K><NumberInput dense label="From" value={t.low} onValue={(v) => set({ target: { ...t, low: v ?? t.low } })} className="w-16" />–
      <NumberInput dense label="To" value={t.high} onValue={(v) => set({ target: { ...t, high: v ?? t.high } })} className="w-16" /></div>
    <label className="flex items-center gap-2"><K>Tablet</K><NumberInput dense label="Tablet mg" value={Number(q.tablet_mg ?? 5)} onValue={(v) => set({ tablet_mg: v ?? 5 })} className="w-16" /><span className="text-12 text-faint">mg</span></label>
  </div>
}
export function ProgrammeCard({ q, set }: CardEditorProps) {
  const hb = q.hb as { low: number; high: number }; const needs = (q.needs as string[] | undefined) ?? []
  return <div className="grid gap-1.5 text-13">
    <div className="flex items-center gap-2"><K>Every</K><NumberInput dense integer label="Every weeks" value={Number(q.every_weeks)} onValue={(v) => set({ every_weeks: v ?? 3 })} className="w-14" /><span className="text-12 text-faint">weeks</span></div>
    <div className="flex items-center gap-2"><K>Hb before</K><NumberInput dense label="Hb from" value={hb.low} onValue={(v) => set({ hb: { ...hb, low: v ?? hb.low } })} className="w-16" />–
      <NumberInput dense label="Hb to" value={hb.high} onValue={(v) => set({ hb: { ...hb, high: v ?? hb.high } })} className="w-16" /></div>
    <div className="flex flex-wrap items-center gap-1.5"><K>Red cells</K>{['leucodepleted', 'Rh and Kell matched', 'irradiated', 'washed'].map((n) => <Chip key={n} variant="check" on={needs.includes(n)}
      onClick={() => set({ needs: needs.includes(n) ? needs.filter((x) => x !== n) : [...needs, n] })}>{n}</Chip>)}</div>
  </div>
}
export const weekLineOf = (q: Record<string, unknown>) => weekLine(q as unknown as WeekParams)
