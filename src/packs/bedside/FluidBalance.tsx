// The Fluid balance section of the chart's record panel (spec/openCare.md §5.6, W2), for the stay open now: the chart's head (since
// when, the balance aim, the weight), then today's fluid day by shift as #ward-fluids draws it — in by route, out by kind, in − out,
// urine mL/kg/h since the last measured urine — and yesterday's totals under it. And the line under /in and /out: which shift a measure
// counts in, a urine's rate, a check on an odd amount. Read-only: the composer writes.
import { useEffect, useState, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { SectionBody } from '@core/screens/chart/sections'
import type { Ctx, Parsed } from '@core/screens/visit/parse'
import { Empty, cn, hm, shortDate } from '@core/ui'
import { chartOf, dayStart, dayTable, fluidNotes, latestWeight, lowBelow, measuresOfValues, mlWords, rateWords, shiftsIn, signed, targetWords, urineTimes, type Row } from './balance'
import { IN_LABEL, OUT_LABEL } from './fluids'
import { openStay } from './news2'

const group = 'px-1 pt-2 text-start text-11 font-semibold uppercase tracking-[0.06em] text-faint'
const cell = 'px-1.5 py-1 text-end'
/** the clock, again every 30 s (the current shift, the fluid day, a draft's span) */
function useClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  return now
}

export function FluidBalance({ p, own }: SectionBody) {
  const clock = useClock(); const st = openStay(p.rec)
  if (!st) return <Empty size="sm">No stay open: the fluid chart is kept in a stay.</Empty>
  const chart = chartOf(own, st.item); const values = p.rec.tables['base.values']
  const ms = measuresOfValues(values, st.item); const w = latestWeight(values?.rows); const s = shiftsIn(p.ctx.org, st.department_id)   // the stay's ward's shifts, whoever reads: the board's day
  // a measure just signed is never after now, though the clock last ticked before it
  const now = Math.max(clock, ...ms.map((m) => Date.parse(m.at)))
  if (!chart && !ms.length) return <Empty size="sm">No fluid chart — /fluids starts one (/fluids target -1000 for the day&apos;s aim); then /in 250 iv and /out urine 300</Empty>
  const t = dayTable(ms, urineTimes(values?.rows), s, w?.kg ?? null, now)
  const low = lowBelow(p.r.identity.birth_date, new Date(now).toISOString())
  const target = chart?.active ? chart.target : null
  const line = (r: Row) => row((r.dir === 'in' ? IN_LABEL : OUT_LABEL)[r.how] ?? r.how, r.cells.map((c) => c === null ? null : mlWords(c)), r.cells.some((c) => c !== null) ? mlWords(r.total) : '—', undefined, `${r.dir}-${r.how}`)
  const row = (label: string, cells: (string | null)[], total: ReactNode, tone?: (i: number) => string | undefined, k = label) => <tr key={k} className="border-t border-line">
    <th scope="row" className="px-1 py-1 text-start font-normal text-muted">{label}</th>
    {cells.map((c, i) => <td key={i} className={cn(cell, i === t.current && 'bg-accent-soft/50', tone?.(i))}>{c ?? ''}</td>)}
    <td className={cn(cell, 'font-medium text-fg')}>{total}</td></tr>
  return <div className="grid gap-1.5">
    <p className="flex flex-wrap gap-x-1 text-12 text-muted">
      {!chart ? <span>No fluid chart</span> : chart.active ? <span>Fluid chart since {shortDate(chart.at)} {hm(chart.at)}</span>
        : <span className="text-warn">Fluid chart stopped {shortDate(chart.entry.occurred_at)} {hm(chart.entry.occurred_at)}</span>}
      {chart?.active && <span>· {targetWords(target)}{target !== null ? ' a day' : ''}</span>}
      <span>· {w ? `weight ${w.kg} kg (${shortDate(w.at)})` : 'no weight'}</span>
    </p>
    <div className="overflow-x-auto">
      <table aria-label="Fluid balance today" className="w-full text-13 tnum">
        <thead><tr><th />{t.labels.map((l, i) => <th key={l} scope="col" aria-current={i === t.current ? 'time' : undefined}
          className={cn(cell, 'font-normal text-faint', i === t.current && 'bg-accent-soft text-accent')}>{l}{i === t.current && <span className="ms-1 text-11">now</span>}</th>)}<th scope="col" className={cn(cell, 'font-normal text-faint')}>Today</th></tr></thead>
        <tbody>
          <tr><th colSpan={t.labels.length + 2} scope="colgroup" className={group}>In</th></tr>
          {t.rows.filter((r) => r.dir === 'in').map(line)}
          <tr><th colSpan={t.labels.length + 2} scope="colgroup" className={group}>Out</th></tr>
          {t.rows.filter((r) => r.dir === 'out').map(line)}
          {row('In − out', t.balance.map((b) => b === null ? null : signed(b)), <>{signed(t.total.balance)}<span className="text-12 font-normal text-muted"> · {targetWords(target)}</span></>)}
          {row('Urine mL/kg/h (since the last measured urine)', t.rate.map((r) => r === null ? null : rateWords(r, low)), '', (i) => t.rate[i] !== null && t.rate[i]! < low ? 'text-warn' : undefined)}
        </tbody>
      </table>
    </div>
    {t.yesterday && <p className="text-12 text-faint">Yesterday from {dayStart(s)}: in {mlWords(t.yesterday.in)} · out {mlWords(t.yesterday.out)} · balance {signed(t.yesterday.balance)}</p>}
  </div>
}

/** under the cards of /in and /out: each measure's words on its own line, a glyph beside a low urine (colour never alone) */
export function FluidNote({ items, ctx }: { items: Parsed[]; ctx: Ctx }) {
  const lines = fluidNotes(items, ctx, useClock()); if (!lines.length) return null
  return <ul aria-label="Fluid notes" className="grid gap-0.5">{lines.map((n, i) => <li key={i} className={cn('flex items-start gap-1 text-12', n.tone ? 'text-warn' : 'text-muted')}>
    {n.tone && <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />}<span>{n.text}</span></li>)}</ul>
}
