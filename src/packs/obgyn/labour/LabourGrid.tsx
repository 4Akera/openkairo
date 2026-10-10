// The grid under the partograph (spec/openCare.md §5.6; drawn as the picture's grid, src/pictures/stays.tsx): a column per time
// something was written, a row per thing in its group (the baby, the contractions, the mother), the first column kept in view while
// the grid scrolls across; a heart rate under 110 or over 160 in red with ↓ or ↑.
import { Card, cn } from '@core/ui'
import type { Cell, GridModel } from './grid'

const HEAD = 'text-11 font-semibold uppercase tracking-[0.06em] text-faint'

function CellText({ c }: { c: Cell | null }) {
  if (!c) return null
  if (!c.flag) return <span className="text-fg">{c.text}</span>
  return <span className="font-semibold text-danger" title={c.flag === 'low' ? 'under 110' : 'over 160'}>{c.text}<span aria-hidden>{c.flag === 'low' ? ' ↓' : ' ↑'}</span></span>
}

export function LabourGrid({ model }: { model: GridModel }) {
  const { times, rows } = model
  const heads = rows.map((r, i) => !!r.group && r.group !== rows[i - 1]?.group)
  return <Card className="overflow-x-auto"><table className="w-full border-collapse text-12 tnum">
    <thead><tr className="border-b border-line"><th className={cn('sticky start-0 w-40 bg-surface px-3 py-1.5 text-start', HEAD)} />
      {times.map((t, i) => <th key={i} className="px-2 py-1.5 text-center text-11 font-semibold text-faint">{t}</th>)}</tr></thead>
    <tbody>{rows.flatMap((r, ri) => [heads[ri] ? <tr key={`g${ri}`}><td colSpan={times.length + 1} className={cn('border-t border-line bg-sunken px-3 py-1', HEAD)}>{r.group}</td></tr> : null,
      <tr key={ri} className="border-t border-line">
        <td className="sticky start-0 bg-surface px-3 py-1.5 text-13 text-fg">{r.label}{r.unit && <span className="ms-1 whitespace-nowrap text-11 text-faint">{r.unit}</span>}</td>
        {times.map((_, i) => <td key={i} className="px-2 py-1.5 text-center"><CellText c={r.cells[i] ?? null} /></td>)}
      </tr>])}</tbody>
  </table></Card>
}
