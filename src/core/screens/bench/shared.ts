import type { RequestQueueRow } from '../../db/types'
import type { BenchStep } from '../../renderers'
import { ymd } from '../../ui'
// The bench works a department's request queue by patient: one sample, one person, many tests (spec 05, the request surface at volume).
/** one patient's open requests; since = when the longest wait today began (null when every request is from an older day) */
export interface PatientGroup { patient: RequestQueueRow['patient']; rows: RequestQueueRow[]; priority: 'stat' | 'urgent' | 'routine'; oldest: string; from: string[]; since: string | null }
const RANK = { stat: 0, urgent: 1, routine: 2 } as const
/** the bench's order, which the patient screen's "next patient" follows too: today's patients first (urgent, then the longest
 *  wait today), then patients with only older requests (urgent, then oldest) */
export function groupByPatient(rows: RequestQueueRow[], today = todayYmd()): PatientGroup[] {
  const by = new Map<string, PatientGroup>()
  for (const r of rows) {
    const g = by.get(r.patient.id) ?? { patient: r.patient, rows: [], priority: 'routine', oldest: r.occurred_at, from: [], since: null }
    g.rows.push(r)
    const p = (r.request?.priority ?? 'routine') as PatientGroup['priority']; if (RANK[p] < RANK[g.priority]) g.priority = p
    if (r.occurred_at < g.oldest) g.oldest = r.occurred_at
    if (r.from_department_name && !g.from.includes(r.from_department_name)) g.from.push(r.from_department_name)
    if (isToday(r, today)) { const w = waitFrom(r, today); if (!g.since || Date.parse(w) < Date.parse(g.since)) g.since = w }
    by.set(r.patient.id, g)
  }
  return [...by.values()].sort((a, b) => Number(!a.since) - Number(!b.since) || RANK[a.priority] - RANK[b.priority]
    || (a.since && b.since ? Date.parse(a.since) - Date.parse(b.since) : a.oldest.localeCompare(b.oldest)))
}
export const ageOf = (born: string) => { const [y, m = 1, d = 1] = born.split('-').map(Number); const n = new Date(); return n.getFullYear() - y - (n.getMonth() + 1 < m || (n.getMonth() + 1 === m && n.getDate() < d) ? 1 : 0) }
/** 34 F */
export const ageSex = (p: { born_on: string; sex: string }) => `${ageOf(p.born_on)} ${p.sex?.[0]?.toUpperCase() ?? ''}`
export const STEP_TONE: Record<string, 'amber' | 'blue' | 'neutral' | 'brand'> = { sent: 'amber', started: 'blue', held: 'neutral', replied: 'brand', reopened: 'amber' }
export const STEP_LABEL: Record<string, string> = { sent: 'new', started: 'in progress', held: 'held', replied: 'preliminary', reopened: 'reopened' }

/** where an open request stands: not started yet (the first segment, "To collect") or being worked ("In progress").
 *  Sent, and any step a pack lists before its first working step, is not started; held, started, a preliminary reply,
 *  a pack's own step (prepared, collected, received) and anything else is being worked. */
export type Phase = 'todo' | 'doing'
const WORKING = new Set(['held', 'started', 'replied', 'reopened'])
export function phaseOf(step: string | undefined, packSteps: BenchStep[]): Phase {
  const s = step ?? 'sent'
  if (s === 'sent') return 'todo'
  if (WORKING.has(s) || packSteps.some((p) => p.step === s)) return 'doing'
  return packSteps[0]?.from.includes(s) ? 'todo' : 'doing'
}
/** the first segment's name: the department's first bench step ("Prepare" → "To prepare"), else "To collect" */
export const firstStepName = (packSteps: BenchStep[]) => packSteps[0]?.label ? `To ${packSteps[0].label.toLowerCase()}` : 'To collect'
/** the clinic's today, 2026-09-24 */
export const todayYmd = () => ymd(new Date().toISOString())
/** a request is today's when it was made or falls due on the clinic's today */
export const isToday = (r: RequestQueueRow, today: string) => ymd(r.occurred_at) === today || (!!r.request?.due_at && ymd(r.request.due_at) === today)
/** the wait starts when today's request was made, or when an older one fell due today */
const waitFrom = (r: RequestQueueRow, today: string) => ymd(r.occurred_at) === today ? r.occurred_at : (r.request?.due_at ?? r.occurred_at)
export type DayGroup = PatientGroup
/** today's patients and the patients whose requests are all from older days, each in groupByPatient's order */
export const splitByDay = (groups: PatientGroup[]) => ({ today: groups.filter((g) => g.since), older: groups.filter((g) => !g.since) })
// what the order is for: the medicine a prescription names (from the pack's own table), else the service
const testName = (r: RequestQueueRow) => (r.details?.drug as { name?: string } | undefined)?.name ?? r.service_name ?? r.display_line
/** CBC, HbA1c, Lipids +2 */
export function testsLine(rows: RequestQueueRow[], shown = 3) {
  const names = [...new Set(rows.map(testName))]
  return names.slice(0, shown).join(', ') + (names.length > shown ? ` +${names.length - shown}` : '')
}
/** the steps worth a word on an in-progress row: held, preliminary, a pack's own step (prepared) */
export const stepWords = (rows: RequestQueueRow[]) => [...new Set(rows.map((r) => r.request?.step ?? 'sent'))].filter((s) => s !== 'sent' && s !== 'started').map((s) => STEP_LABEL[s] ?? s)
/** the scan box: a record number (with or without #) exactly, or part of the name */
export const matches = (p: { record_number: number; given_name: string; family_name: string }, f: string) =>
  !f || String(p.record_number) === f.replace(/^#/, '') || `${p.given_name} ${p.family_name}`.toLowerCase().includes(f)
