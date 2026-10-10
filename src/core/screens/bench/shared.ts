import type { Organization, RequestQueueRow } from '../../db/types'
import { ymd } from '../../ui'
import { ageWords } from '../../db/views'
import type { Tone } from '../../ui/tone'
import { turnOf } from '../rows'
// The bench works a department's request queue by patient: one sample, one person, many tests (spec 05, the request surface at volume).
/** one patient's open requests; since = when the longest wait today began (null when every request is from an older day) */
export interface PatientGroup { patient: RequestQueueRow['patient']; rows: RequestQueueRow[]; priority: 'stat' | 'urgent' | 'routine'; oldest: string; from: string[]; since: string | null }
const RANK = { stat: 0, urgent: 1, routine: 2 } as const
/** the bench's order, which the patient screen's "next patient" follows too: today's patients first (urgent, then the longest
 *  wait today), then patients with only older requests (urgent, then oldest). place (§5.7, core change (h)): a patient's place on the
 *  list, a time a pack gives (a booking): a patient booked for today is today's, and goes in at the place, or as they came when later */
export function groupByPatient(rows: RequestQueueRow[], today = todayYmd(), place?: (g: PatientGroup) => number | null, now = Date.now()): PatientGroup[] {
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
  const turn = new Map<PatientGroup, [number, number]>()
  if (place) for (const g of by.values()) {
    const p = place(g); if (p == null) continue
    if (!g.since && ymd(new Date(p).toISOString()) === today) g.since = new Date(p).toISOString()
    if (g.since) turn.set(g, turnOf(Math.min(Date.parse(g.since), p), p, now))   // a booked order was asked for before its place: never late
  }
  const at = (g: PatientGroup): [number, number] => turn.get(g) ?? [1, Date.parse(g.since!)]
  return [...by.values()].sort((a, b) => Number(!a.since) - Number(!b.since) || RANK[a.priority] - RANK[b.priority]
    || (a.since && b.since ? at(a)[0] - at(b)[0] || at(a)[1] - at(b)[1] : a.oldest.localeCompare(b.oldest)))
}
export const ageOf = (born: string) => { const [y, m = 1, d = 1] = born.split('-').map(Number); const n = new Date(); return n.getFullYear() - y - (n.getMonth() + 1 < m || (n.getMonth() + 1 === m && n.getDate() < d) ? 1 : 0) }
/** 34 F, a baby's 8 mo F */
export const ageSex = (p: { born_on: string; sex: string }) => `${ageWords(p.born_on) || ageOf(p.born_on)} ${p.sex?.[0]?.toUpperCase() ?? ''}`
/** a request step's tone: sent and reopened are warn (not started), started is info (in progress), replied accent (D3) */
export const STEP_TONE: Record<string, Tone> = { sent: 'warn', started: 'info', held: 'neutral', replied: 'accent', reopened: 'warn' }
/** a typed value's field by its flag: warn for low, high or abnormal, danger for critical (the glyph and the word stand beside it) */
export const fieldTone = (f: string | null | undefined): 'default' | 'warn' | 'danger' => f === 'critical' ? 'danger' : f && f !== 'normal' ? 'warn' : 'default'
const STEP_LABEL: Record<string, string> = { sent: 'new', started: 'in progress', held: 'held', replied: 'preliminary', reopened: 'reopened' }
/** a step in the bench's words: new, in progress, held, preliminary, or a step of the service (sample_sent → sample sent) */
export const stepLabel = (s = 'sent') => STEP_LABEL[s] ?? s.replace(/_/g, ' ')
/** a step key as a button: collected → Collected */
export const stepName = (key: string) => key[0].toUpperCase() + key.slice(1).replace(/_/g, ' ')

/** where an open request stands: nothing done yet (sent: the first segment, "To do") or being worked ("In progress":
 *  started, held, a preliminary reply, a step of its service such as collected or prepared) */
export type Phase = 'todo' | 'doing'
export const phaseOf = (step: string | undefined): Phase => (step ?? 'sent') === 'sent' ? 'todo' : 'doing'
/** each order's next step, one button per step: the service's first step after the one it reached, the first when none yet
 *  (spec/openCare.md §4.4). A service answered by a pack type that extends step takes its steps in that type. */
export function nextSteps(rows: RequestQueueRow[], o: Organization | undefined, may: (action: string) => boolean) {
  const by = new Map<string, { key: string; type: string; rows: RequestQueueRow[] }>()
  for (const r of rows) {
    const steps = o?.services.find((s) => s.id === r.service_id)?.steps ?? []
    const key = steps[r.order.step_key ? steps.indexOf(r.order.step_key) + 1 : 0]
    const type = r.reply_type && o?.types.find((t) => t.key === r.reply_type)?.base_type === 'step' ? r.reply_type : 'step'
    if (!key || !may(`write:${type}`)) continue
    const g = by.get(`${type} ${key}`) ?? { key, type, rows: [] }
    g.rows.push(r); by.set(`${type} ${key}`, g)
  }
  return [...by.values()]
}
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
/** the steps worth a word on an in-progress row: held, preliminary, a step of its service (collected, prepared) */
export const stepWords = (rows: RequestQueueRow[]) => [...new Set(rows.map((r) => r.request?.step ?? 'sent'))].filter((s) => s !== 'sent' && s !== 'started').map((s) => stepLabel(s))
/** the scan box: a record number (with or without #) exactly, or part of the name */
export const matches = (p: { record_number: number; given_name: string; family_name: string }, f: string) =>
  !f || String(p.record_number) === f.replace(/^#/, '') || `${p.given_name} ${p.family_name}`.toLowerCase().includes(f)
