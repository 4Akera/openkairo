// The Pharmacy section of the chart's record panel (spec/openCare.md §5.1 rule 2): each dispense, the newest first — the products
// and how much (or, not given, the medicine it answers), when, and its state in words (Given, Prepared, Not given and why). Read-only:
// a supply opens its entry in the center.
import type { SectionBody } from '@core/screens/chart/sections'
import { Empty, Tag, shortDate } from '@core/ui'
import { suppliedOf, whatText, type Supplied as Row } from './dispensed'

const STATE: Record<Row['state'], { word: string; tone: 'ok' | 'neutral' | 'warn' }> = {
  given: { word: 'Given', tone: 'ok' }, prepared: { word: 'Prepared', tone: 'neutral' }, not_given: { word: 'Not given', tone: 'warn' } }

export function Supplied({ p, own }: SectionBody) {
  const rows = suppliedOf(own, p.rec)
  if (!rows.length) return <Empty size="sm">Nothing dispensed by the pharmacy yet</Empty>
  return <ul aria-label="Dispensed" className="divide-y divide-line">{rows.map((r) => <li key={r.entry_id} className="py-1.5 text-13">
    <p className="flex flex-wrap items-baseline gap-x-2">
      <button type="button" onClick={() => p.open(r.entry_id)} className="min-w-0 rounded-sm text-start font-medium text-fg hover:underline focus-ring">{whatText(r) || 'Dispense'}</button>
      <Tag tone={STATE[r.state].tone}>{STATE[r.state].word}</Tag>
      <span className="ms-auto text-12 text-faint tnum">{shortDate(r.at)}</span>
    </p>
    {r.reason && <p className="text-12 text-muted">{r.reason}</p>}
  </li>)}</ul>
}
