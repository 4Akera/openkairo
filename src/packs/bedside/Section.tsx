// The NEWS2 section of the chart's record panel (spec/openCare.md §5.6, piece 1): the stay's trend as a small line, then each NEWS2,
// the newest first — its total, its band in the table's words, when. Read-only: a NEWS2 opens its entry in the center.
import type { SectionBody } from '@core/screens/chart/sections'
import { Empty, Sparkline, Tag, hm, shortDate } from '@core/ui'
import { news2Rows } from './news2'

export function News2({ p, own }: SectionBody) {
  const rows = news2Rows(own, p.rec, p.ctx.org)
  if (!rows.length) return <Empty size="sm">No NEWS2 yet — type /obs with the vitals</Empty>
  const stay = rows.filter((r) => r.thisStay)
  return <div className="grid gap-1.5">
    {stay.length >= 2 && <Sparkline points={[...stay].reverse().map((r) => ({ at: r.at, value: r.total }))} width={160} height={28} label="NEWS2 this stay" />}
    <ul aria-label="NEWS2" className="divide-y divide-line">{rows.slice(0, 12).map((r) => <li key={r.entry_id} className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-13">
      <button type="button" onClick={() => p.open(r.entry_id)} className="rounded-sm text-start font-medium text-fg tnum hover:underline focus-ring">NEWS2 {r.total}</button>
      <Tag tone={r.tone ?? 'neutral'}>{r.band}</Tag>
      <span className="ms-auto text-12 text-faint tnum">{shortDate(r.at)} {hm(r.at)}</span>
    </li>)}</ul>
  </div>
}
