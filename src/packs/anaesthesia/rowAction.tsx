// The pre-op on a list's row (spec/openCare.md §5.8; the pictures: the operating list's Pre-op column, and #anaes-preop's "Fit fills
// the list"): where a department uses anaesthesia, a row whose patient has a pre-op shows its ASA and verdict as the pack's row button
// which folds out the assessment under the row (the airway, the plan, the medicines to stop). Read from the pack's table, by patient;
// the one about the row's operation first.
import { read } from '@core/db/rpc'
import type { TableRead } from '@core/db/types'
import type { RowAction, RowActionCardProps } from '@core/screens/rows'
import { Button, Tag, shortDate } from '@core/ui'

export interface PreopRow { item: string; patient_id: string; op: string | null; operation: string | null; asa: string; emergency: boolean; verdict: string; plan: string | null
  mallampati: string | null; stop: { medicine: string; what: string }[] | null; at: string }
const PLAN: Record<string, string> = { general_lma: 'general, LMA', general_tube: 'general, tube', spinal: 'spinal', local_sedation: 'local and sedation' }
export function preopOf(rows: PreopRow[], patientId: string, orders: string[]): PreopRow | null {
  const mine = rows.filter((r) => r.patient_id === patientId).sort((a, b) => b.at.localeCompare(a.at))
  return mine.find((r) => r.op && orders.includes(r.op)) ?? mine[0] ?? null
}
export const preopWord = (p: PreopRow) => `ASA ${p.asa}${p.emergency ? ' E' : ''} · ${p.verdict === 'fit' ? 'fit' : 'not yet'}`
function PreopCard({ row, data, close }: RowActionCardProps) {
  const p = preopOf((data ?? []) as PreopRow[], row.patient_id, row.orders.map((o) => o.item))
  if (!p) return null
  return <div className="grid gap-1 text-13">
    <p className="flex flex-wrap items-center gap-2"><b className="font-medium text-fg">Pre-op · {shortDate(p.at)}</b>{p.operation && <span className="text-muted">{p.operation}</span>}
      <Tag tone={p.verdict === 'fit' ? 'ok' : 'warn'}>{p.verdict === 'fit' ? 'fit' : 'not yet'}</Tag></p>
    <p className="text-fg">ASA {p.asa}{p.emergency ? ' E' : ''}{p.mallampati ? ` · Mallampati ${p.mallampati}` : ''}{p.plan ? ` · ${PLAN[p.plan] ?? p.plan}` : ''}</p>
    {(p.stop?.length ?? 0) > 0 && <p className="text-muted">{p.stop!.map((s) => `${s.medicine}: ${s.what}`).join(' · ')}</p>}
    <span><Button size="xs" variant="ghost" onClick={() => close()}>Close</Button></span>
  </div>
}
export const preopAction: RowAction = {
  load: async (rows, ctx) => {
    const patients = [...new Set(rows.map((r) => r.patient_id))]; if (!patients.length) return []
    return (await read<TableRead<PreopRow>>({ shape: 'table', table: 'anaesthesia.preops', department_id: ctx.dept.id, where: { patient_id: patients }, entries: false })).rows
  },
  button: (row, _ctx, data) => { const p = preopOf((data ?? []) as PreopRow[], row.patient_id, row.orders.map((o) => o.item)); return p ? preopWord(p) : null },
  Card: PreopCard,
}
