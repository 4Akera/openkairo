// Results (chart-plan.md §3.2, build plan 3.8): base.values by kind — Vitals (BP as one), each laboratory service by name, Other —
// each test with its latest value (a result's own interpretation: tone, glyph and word; vitals have none), the value before (↗ ↘ →,
// never a flag arrow), the reference range copied into the latest result, and a sparkline of the last eight. A test opens its trend
// inline under it (the kit's LineChart, whose Table chip shows every point as rows); a point opens its entry in the center. Report-only
// answers (a conclusion, no numbers) under Reports. "Over time" opens the results table in the center.
import { Fragment, useMemo, useState } from 'react'
import { dataOf } from '../../../db/views'
import { Button, Empty, LineChart, Section, Sparkline, TONE, cn, flagTone, interpWord, shortDate } from '../../../ui'
import { resultsByKind, type Point, type Series } from '../model/values'
import { Fact, Sub } from './parts'
import type { Panel } from './RecordPanel'

const shown = (x: Point) => x.value2 != null ? `${x.value}/${x.value2}` : `${x.value}`
const rangeOf = (t: Series) => t.range?.text ?? (t.range?.low != null && t.range?.high != null ? `${t.range.low}–${t.range.high}` : null)

export function Results({ p }: { p: Panel }) {
  const types = p.ctx.org?.types
  const r = useMemo(() => resultsByKind(p.rec, types), [p.rec, types]); const [open, setOpen] = useState<string | null>(null)
  const n = r.groups.reduce((a, g) => a + g.tests.length, 0)
  const flagged = r.groups.flatMap((g) => g.tests).filter((t) => t.latest.flag && t.latest.flag !== 'normal')
  return <Section id="chart.results" variant="compact" title="Results" count={n || undefined} className="@container"
    summary={flagged.length ? `${flagged.length} flagged: ${flagged.slice(0, 3).map((t) => t.name).join(', ')}` : r.groups.map((g) => g.name).join(', ')}
    right={n > 0 && <Button size="xs" variant="ghost" onClick={() => p.onOpen({ scope: 'results' })}>Over time</Button>}>
    {!n && !r.reports.length ? <Empty size="sm">No results or vitals recorded yet</Empty> : <>
      {r.groups.map((g, i) => <Fragment key={g.name}>
        <Sub className={i === 0 ? 'mt-0' : undefined}>{g.name}</Sub>
        <ul className="divide-y divide-line">{g.tests.map((t) => <Test key={t.key} p={p} t={t} open={open === t.key} onToggle={() => setOpen(open === t.key ? null : t.key)} />)}</ul>
      </Fragment>)}
      {r.reports.length > 0 && <>
        <Sub className={!n ? 'mt-0' : undefined}>Reports</Sub>
        <ul className="divide-y divide-line">{r.reports.map(({ order, entry }) => { const text = dataOf(entry, 'result', types)?.conclusion
          return <li key={entry.id} className="py-1.5 text-13">
            <p className="flex flex-wrap items-baseline gap-x-2"><Fact onOpen={() => p.open(entry.id)} className="font-medium text-fg">{order.service_name ?? 'Report'}</Fact>
              <span className="ms-auto text-12 text-faint tnum">{shortDate(entry.occurred_at)}</span></p>
            {text && <p className="truncate text-12 text-muted">{text}</p>}</li> })}</ul>
      </>}
    </>}
  </Section>
}

/** one test: name, latest value and unit, the value before, the range; its sparkline; open, its trend under it */
function Test({ p, t, open, onToggle }: { p: Panel; t: Series; open: boolean; onToggle: () => void }) {
  const f = t.latest.flag; const flagged = !!f && f !== 'normal'; const range = rangeOf(t)
  const band = t.range ? { low: t.range.low, high: t.range.high } : undefined
  const last = t.points.slice(0, 8).reverse(); const name = t.key === 'bp' ? 'Blood pressure (systolic)' : t.name
  return <li className="py-1">
    <button type="button" onClick={onToggle} aria-expanded={open} title={open ? 'Hide the trend' : 'Show the trend'}
      className="-mx-1 grid w-[calc(100%+0.5rem)] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-1 py-0.5 text-start hover:bg-hover focus-ring">
      <span className="min-w-0">
        <span className="flex items-baseline gap-1.5 text-13"><span className="min-w-0 truncate text-muted">{t.name}</span>
          <span className={cn('shrink-0 font-semibold', flagged ? TONE[flagTone(f)].text : 'text-fg')}>{shown(t.latest)}{t.latest.mark && <span aria-hidden> {t.latest.mark}</span>}
            {flagged && <span className="sr-only"> {interpWord(t.latest.interpretation)}</span>}</span>
          {t.unit && <span className="shrink-0 text-12 text-faint">{t.unit}</span>}</span>
        <span className="block truncate text-12 text-faint tnum">{t.previous ? <><span aria-hidden>{t.trend} </span>was {shown(t.previous)} · {shortDate(t.previous.at)}</> : shortDate(t.latest.at)}
          {range && ` · normal ${range}`}</span>
      </span>
      <Sparkline className="h-5 w-12 @md:w-14" width={56} height={20} band={band} label={`${name} ${last.map((x) => x.value).join(', ')}${t.unit ? ` ${t.unit}` : ''}`}
        points={last.map((x) => ({ at: x.at, value: x.value, flag: x.flag }))} />
    </button>
    {open && <div className="pt-2 pb-1"><LineChart label={`${name}${range ? ` · normal ${range}` : ''}`} unit={t.unit ?? undefined} band={band} onPoint={p.open}
      points={[...t.points].reverse().map((x) => ({ at: x.at, value: x.value, flag: x.flag, entryId: x.entry_id }))} /></div>}
  </li>
}
