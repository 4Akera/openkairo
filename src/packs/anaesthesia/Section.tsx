// The Anaesthesia section of the chart (spec/openCare.md §5.8; the picture #anaes-preop): the operation planned (from the patient's
// orders, by their shape), what is known of anaesthetics before, the pre-op assessments and the anaesthetic records. Read-only: a line
// opens its entry in the center.
import type { SectionBody } from '@core/screens/chart/sections'
import { Empty, shortDate } from '@core/ui'

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => <p className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 py-0.5 text-13"><span className="text-12 text-faint">{k}</span><span className="text-fg">{children}</span></p>
type OrderRow = { item: string; service_id: string | null; service_name: string | null; status: string; ordered_at: string; step_key: string | null }
export const operationsIn = (rows: OrderRow[], services: { id: string; steps?: string[] }[]) =>
  rows.filter((o) => services.find((s) => s.id === o.service_id)?.steps?.includes('operating'))
export function AnaesthesiaSection({ p, own }: SectionBody) {
  const ops = operationsIn((p.rec.tables['base.orders']?.rows ?? []) as OrderRow[], p.ctx.org?.services ?? []).filter((o) => o.status !== 'revoked')
  const entries = [...own.shown].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
  if (!ops.length && !entries.length) return <Empty size="sm">No operation or anaesthetic on record</Empty>
  const before = entries.map((e) => (e.data?.history as { before?: string } | undefined)?.before).find(Boolean)
  return <div className="grid gap-0.5">
    {ops.map((o) => <Row key={o.item} k="Operation">{o.service_name}{o.status === 'completed' ? ' · done' : o.step_key ? ` · ${o.step_key.replace('_', ' ')}` : ' · to schedule'} · {shortDate(o.ordered_at)}</Row>)}
    {before && <Row k="Before">{before}</Row>}
    {entries.map((e) => <Row key={e.id} k={shortDate(e.occurred_at)}><button type="button" onClick={() => p.open(e.id)} className="rounded-sm text-start hover:underline focus-ring">{e.line}</button></Row>)}
  </div>
}
