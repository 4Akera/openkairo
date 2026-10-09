// The ICU chart's grid (spec/openCare.md §5.6), as the picture drew it: hours across, a sticky first column, each group's heading over
// its rows, the hour now marked. A carried cell is faint; a flagged one is amber with ↓ or ↑ (the title says it too); the hour now with
// nothing signed reads "due".
import { Card, cn } from '@core/ui'
import type { Cell, ChartModel } from './chart'
import { hourLabel } from './hours'

function CellView({ c }: { c: Cell }) {
  return <span title={c.title} className={cn(c.flag ? 'font-medium text-warn' : c.carried ? 'text-faint' : 'font-medium text-fg')}>
    {c.text}{c.flag && <span aria-hidden>{c.flag === 'low' ? ' ↓' : ' ↑'}</span>}</span>
}

export function Grid({ model }: { model: ChartModel }) {
  const now = model.hours.indexOf(model.now); const span = model.hours.length + 1
  return <Card className="overflow-x-auto"><table className="w-full border-collapse text-12 tnum">
    <thead><tr className="border-b border-line">
      <th className="sticky start-0 w-48 bg-surface px-3 py-1.5 text-start text-11 font-semibold uppercase tracking-[0.06em] text-faint" />
      {model.hours.map((h, i) => <th key={h} scope="col" className={cn('px-2 py-1.5 text-center text-11 font-semibold text-faint', i === now && 'bg-accent-soft text-accent')}>{hourLabel(h)}</th>)}
    </tr></thead>
    <tbody>{model.groups.flatMap((g) => [
      <tr key={g.key}><td colSpan={span} className="border-t border-line bg-sunken px-3 py-1 text-11 font-semibold uppercase tracking-[0.06em] text-faint">{g.title}</td></tr>,
      ...g.rows.map((r) => <tr key={`${g.key}:${r.key}`} className="border-t border-line">
        <th scope="row" title={r.title} className="sticky start-0 bg-surface px-3 py-1.5 text-start text-13 font-normal text-fg">{r.label}{r.unit && <span className="ms-1 whitespace-nowrap text-11 text-faint">{r.unit}</span>}</th>
        {r.cells.map((c, i) => <td key={model.hours[i]} className={cn('px-2 py-1.5 text-center', i === now && 'bg-accent-soft/50')}>
          {c ? <CellView c={c} /> : g.key === 'signed' && i === now && model.due ? <span className="rounded-sm bg-accent-soft px-1 text-11 font-medium text-accent">due</span> : ''}</td>)}
      </tr>)])}</tbody>
  </table></Card>
}
