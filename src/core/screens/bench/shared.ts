import type { RequestQueueRow } from '../../db/types'
// The bench works a department's request queue by patient: one sample, one person, many tests (spec 05, the request surface at volume).
export interface PatientGroup { patient: RequestQueueRow['patient']; rows: RequestQueueRow[]; priority: 'stat' | 'urgent' | 'routine'; oldest: string; from: string[] }
const RANK = { stat: 0, urgent: 1, routine: 2 } as const
export function groupByPatient(rows: RequestQueueRow[]): PatientGroup[] {
  const by = new Map<string, PatientGroup>()
  for (const r of rows) {
    const g = by.get(r.patient.id) ?? { patient: r.patient, rows: [], priority: 'routine', oldest: r.occurred_at, from: [] }
    g.rows.push(r)
    const p = (r.request?.priority ?? 'routine') as PatientGroup['priority']; if (RANK[p] < RANK[g.priority]) g.priority = p
    if (r.occurred_at < g.oldest) g.oldest = r.occurred_at
    if (r.from_department_name && !g.from.includes(r.from_department_name)) g.from.push(r.from_department_name)
    by.set(r.patient.id, g)
  }
  return [...by.values()].sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.oldest.localeCompare(b.oldest))
}
export const ageOf = (born: string) => { const [y, m = 1, d = 1] = born.split('-').map(Number); const n = new Date(); return n.getFullYear() - y - (n.getMonth() + 1 < m || (n.getMonth() + 1 === m && n.getDate() < d) ? 1 : 0) }
export const STEP_TONE: Record<string, 'amber' | 'blue' | 'neutral' | 'brand'> = { sent: 'amber', started: 'blue', held: 'neutral', replied: 'brand', reopened: 'amber' }
export const STEP_LABEL: Record<string, string> = { sent: 'to collect', started: 'in progress', held: 'held', replied: 'preliminary', reopened: 'reopened' }
