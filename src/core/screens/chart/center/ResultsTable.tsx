// Results over time (chart-plan.md §2 #21, moved from Record.tsx): every test by kind — Vitals (BP as one), each laboratory service,
// Other — the dates across (the latest eight days a value was taken), each value with its own interpretation (tone, glyph and, for
// screen readers, the word; vitals carry none), a sparkline beside the name; a click on a name opens its trend under the row (the kit's
// LineChart, whose Table chip lists every point), a click on a value opens its entry.
import { Fragment, useMemo, useState } from 'react'
import { useDepartment } from '../../../hooks/organization'
import { Card, Empty, LineChart, Sparkline, TONE, cn, flagTone, interpWord, shortDate, ymd } from '../../../ui'
import { useChart } from '../context'
import { resultsByKind, type Point, type Series } from '../model/values'
import { ScopeBar } from './ScopeBar'

const shown = (x: Point) => x.value2 != null ? `${x.value}/${x.value2}` : `${x.value}`

export function ResultsTable() {
  const c = useChart(); const { org } = useDepartment(); const [open, setOpen] = useState<string | null>(null)
  const r = useMemo(() => resultsByKind(c.r.server, org?.types), [c.r.server, org])
  const tests = r.groups.flatMap((g) => g.tests)
  const dates = [...new Set(tests.flatMap((t) => t.points.map((p) => ymd(p.at))))].sort().reverse().slice(0, 8)
  const entry = (id: string) => c.open({ scope: 'entry', id })
  return <>
    <ScopeBar title="Results over time" meta={tests.length ? `${tests.length} tests · the latest ${dates.length} days` : null} />
    {!tests.length ? <Empty size="sm">No results or vitals recorded yet</Empty> : <Card className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-13 tnum">
        <thead><tr className="border-b border-line text-11 text-faint">
          <th className="sticky start-0 bg-surface px-3.5 py-2 text-start font-medium">Test</th>
          {dates.map((d) => <th key={d} className="px-2 py-2 text-end font-medium">{shortDate(`${d}T12:00:00Z`)}</th>)}</tr></thead>
        <tbody>{r.groups.map((g) => <Fragment key={g.name}>
          <tr><th colSpan={dates.length + 1} className="sticky start-0 bg-sunken px-3.5 py-1 text-start text-11 font-semibold uppercase tracking-[0.08em] text-faint">{g.name}</th></tr>
          {g.tests.map((t) => <Row key={t.key} t={t} dates={dates} open={open === t.key} onToggle={() => setOpen(open === t.key ? null : t.key)} onEntry={entry} />)}
        </Fragment>)}</tbody>
      </table>
    </Card>}
  </>
}

function Row({ t, dates, open, onToggle, onEntry }: { t: Series; dates: string[]; open: boolean; onToggle: () => void; onEntry: (id: string) => void }) {
  const band = t.range ? { low: t.range.low, high: t.range.high } : undefined; const last = t.points.slice(0, 8).reverse()
  return <>
    <tr className="border-b border-line hover:bg-hover">
      <td className="sticky start-0 bg-surface px-3.5 py-1.5">
        <button type="button" onClick={onToggle} aria-expanded={open} title={open ? 'Hide the trend' : 'Show the trend'} className="flex items-center gap-2 rounded-sm text-start focus-ring">
          <span className="font-medium text-fg">{t.name}</span>{t.unit && <span className="text-12 text-faint">{t.unit}</span>}
          <Sparkline className="ms-1" width={48} height={16} band={band} label={`${t.name} ${last.map((x) => x.value).join(', ')}`} points={last.map((x) => ({ at: x.at, value: x.value, flag: x.flag }))} />
        </button></td>
      {dates.map((d) => { const p = t.points.find((x) => ymd(x.at) === d); const f = p?.flag; const flagged = !!f && f !== 'normal'
        return <td key={d} className="px-2 py-1.5 text-end">{p && <button type="button" onClick={() => onEntry(p.entry_id)}
          className={cn('rounded-sm px-1 hover:underline focus-ring', flagged ? cn('font-semibold', TONE[flagTone(f)].text) : 'text-fg')}>
          {shown(p)}{p.mark && <span aria-hidden> {p.mark}</span>}{flagged && <span className="sr-only"> {interpWord(p.interpretation)}</span>}</button>}</td> })}
    </tr>
    {open && <tr className="border-b border-line"><td colSpan={dates.length + 1} className="px-3.5 py-2">
      <LineChart label={t.name} unit={t.unit ?? undefined} band={band} onPoint={onEntry} points={[...t.points].reverse().map((x) => ({ at: x.at, value: x.value, flag: x.flag, entryId: x.entry_id }))} />
    </td></tr>}
  </>
}
