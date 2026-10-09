// The daily goals at the morning round (spec/openCare.md §5.6, piece I2): FAST HUGS BID as choices, the decision on each line (keep or
// remove), the targets (MAP at least, fluid balance today) and the doctor's words, as the pack's own type (intensive.goals, a CarePlan),
// signed with the SOFA as one set. The lines are the base's procedures (central, arterial, urinary catheter), in progress until a
// version that changes them says removed; their day counts from when they went in. Pure: npm run test:intensive.
import type { EntryIn } from '@core/db/rpc'
import type { IntensiveGoals, Procedure, Quantity } from '@core/db/shapes.generated'
import type { ServerEntry } from '@core/db/types'
import { stayDay } from '@core/screens/chart/model/encounter'
import { scoreData, type ScoreParams } from '@core/screens/visit/score'
import { hm } from '@core/ui/time'
import { concept } from './codes'
import { itemsOf, latestOf } from './items'

export type GoalKey = 'feeding' | 'analgesia' | 'sedation' | 'thrombo' | 'head_up' | 'ulcer' | 'glucose' | 'bowels' | 'antibiotics' | 'wean'
/** the card's rows: the goal, its label and its options [value, words]; head_up's values are yes and no */
export const GOALS: [GoalKey, string, [string, string][]][] = [
  ['feeding', 'Feeding', [['enteral', 'enteral feed'], ['nil_by_mouth', 'nil by mouth'], ['eating', 'eating'], ['parenteral', 'parenteral']]],
  ['analgesia', 'Analgesia', [['controlled', 'pain controlled'], ['needs_more', 'needs more']]],
  ['sedation', 'Sedation · RASS target', [['light', 'light, −2 to 0'], ['deep', 'deep, −4'], ['none', 'no sedation']]],
  ['thrombo', 'Clot prevention', [['heparin', 'heparin'], ['stockings', 'stockings'], ['not_yet', 'not yet, bleeding']]],
  ['head_up', 'Head up 30°', [['yes', 'yes'], ['no', 'no']]],
  ['ulcer', 'Stomach protection', [['yes', 'yes'], ['not_needed', 'not needed']]],
  ['glucose', 'Glucose', [['on_target', 'on target'], ['insulin_infusion', 'insulin infusion'], ['above_target', 'above target']]],
  ['bowels', 'Bowels', [['opened', 'opened'], ['not_opened', 'not opened']]],
  ['antibiotics', 'Antibiotics', [['keep', 'keep'], ['narrow', 'narrow'], ['stop', 'stop'], ['none', 'none']]],
  ['wean', 'Trial off the ventilator', [['not_today', 'not today'], ['today', 'today']]],
]
export const LINES = { central_line: 'Central venous catheter', arterial_line: 'Arterial line', urinary_catheter: 'Urinary catheter' } as const
export type LineCode = keyof typeof LINES
const isLine = (c: unknown): c is LineCode => typeof c === 'string' && Object.hasOwn(LINES, c)

export interface OpenLine { item: string; entry: string; version: number; code: LineCode; words: string; site: string | null; since: string; day: number; data: Procedure }
const dataOf = <T,>(e: ServerEntry) => (e.data ?? {}) as unknown as T
const lineCode = (e: ServerEntry): LineCode | null => {
  if (e.type !== 'procedure') return null
  const c = dataOf<Procedure>(e).concept?.codings?.find((x) => x.system === 'local.procedure' && isLine(x.code)); return c ? c.code as LineCode : null
}
/** the lines still in progress, the oldest first, each with its site and its day */
export function openLines(entries: readonly ServerEntry[], now: string): OpenLine[] {
  const out: OpenLine[] = []
  for (const it of itemsOf(entries)) {
    const code = lineCode(it.versions[0]); if (!code) continue
    const l = latestOf(it); const d = dataOf<Procedure>(l); if (d.status !== 'in-progress') continue
    const since = d.performed?.value ?? it.versions[0].occurred_at
    out.push({ item: it.item, entry: l.id, version: l.item_version, code, words: d.concept?.text || LINES[code], site: d.body_site?.text?.trim() || null, since, day: stayDay(since, now), data: d })
  }
  return out.sort((a, b) => a.since.localeCompare(b.since))
}
/** the open lines the last goals decided to remove, with that round's time */
export function removalDecided(lines: OpenLine[], lastGoals: ServerEntry | null): { item: string; at: string }[] {
  if (!lastGoals) return []
  const remove = new Set((dataOf<IntensiveGoals>(lastGoals).lines ?? []).filter((x) => x.decision === 'remove').map((x) => x.item))
  return lines.filter((l) => remove.has(l.item)).map((l) => ({ item: l.item, at: lastGoals.occurred_at }))
}
export const decidedWords = (at: string) => `remove decided ${hm(at)}`

export type GoalsDraft = Partial<Record<GoalKey, string>> & { lines: Record<string, 'keep' | 'remove'>; mapTarget?: string; balanceTarget?: string; text?: string }
export const emptyGoals = (): GoalsDraft => ({ lines: {} })
const number = (s: string | undefined) => { const t = (s ?? '').trim().replace(/^−/, '-'); return t && /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t ? NaN : undefined }
const q = (n: number | undefined, unit: string, ucum: string): Quantity | undefined => n === undefined || Number.isNaN(n) ? undefined : { value: String(n), unit, ucum }
/** the type's data: nothing empty; head up kept when no; the targets as quantities */
export function goalsData(d: GoalsDraft): IntensiveGoals {
  const out: Record<string, unknown> = {}
  for (const [k] of GOALS) { const v = d[k]; if (!v) continue; out[k] = k === 'head_up' ? v === 'yes' : v }
  const lines = Object.entries(d.lines).map(([item, decision]) => ({ item, decision }))
  if (lines.length) out.lines = lines
  const map = q(number(d.mapTarget), 'mmHg', 'mm[Hg]'); if (map) out.map_target = map
  const bal = q(number(d.balanceTarget), 'mL', 'mL'); if (bal) out.balance_target = bal
  const text = d.text?.trim(); if (text) out.text = text
  return out as IntensiveGoals
}
/** what stops the sign on the goals' side: nothing chosen or written; a target that is not a number */
export function goalsMissing(d: GoalsDraft): string | null {
  if (Number.isNaN(number(d.mapTarget))) return 'The MAP target: a number'
  if (Number.isNaN(number(d.balanceTarget))) return 'The balance target: a number'
  return Object.keys(goalsData(d)).length ? null : 'Choose at least one goal, or write the goals'
}

export interface Where { patientId: string; departmentId: string; stay: string }
/** the round's set: the SOFA (the server's total) and the goals, at the writer's time, in the stay */
export function roundEntries(sofa: ScoreParams, d: GoalsDraft, where: Where, id: () => string): EntryIn[] {
  const at = { patient_id: where.patientId, department_id: where.departmentId, visit_id: where.stay }
  return [{ id: id(), ...at, type: 'score', data: scoreData(sofa) }, { id: id(), ...at, type: 'intensive.goals', data: goalsData(d) }]
}
/** a new line, in progress since it went in */
export function lineEntry(code: LineCode, site: string, at: string, where: Where, id: () => string): EntryIn {
  const s = site.trim()
  return { id: id(), patient_id: where.patientId, department_id: where.departmentId, visit_id: where.stay, occurred_at: at, precision: 'minute', type: 'procedure',
    data: { concept: concept('local.procedure', code, LINES[code]), status: 'in-progress', performed: { value: at, precision: 'minute' }, ...(s ? { body_site: { text: s } } : {}) } }
}
/** the line taken out: a version of its latest that ends it, written against the version shown */
export function removedEntry(line: OpenLine, at: string, where: Where, id: () => string): { entry: EntryIn; seen: Record<string, number> } {
  return { seen: { [line.item]: line.version }, entry: { id: id(), patient_id: where.patientId, department_id: where.departmentId, visit_id: where.stay, occurred_at: at,
    precision: 'minute', type: 'procedure', data: { ...line.data, status: 'completed', outcome: 'removed' }, refers_to: line.entry, relation: 'changes' } }
}
/** the latest goals since the ICU day began, or null */
export function goalsToday(goals: ServerEntry[], dayStartIso: string): ServerEntry | null {
  const t = Date.parse(dayStartIso)
  return itemsOf(goals).map(latestOf).filter((e) => e.type === 'intensive.goals' && Date.parse(e.occurred_at) >= t)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0] ?? null
}
/** the latest goals of the stay, or null */
export const lastGoals = (goals: ServerEntry[]): ServerEntry | null => goalsToday(goals, new Date(0).toISOString())
/** "HH:MM" today on the clinic's clock, as an instant; null when it is not a time */
export function atClock(hhmm: string, now: string): string | null {
  const m = hhmm.trim().match(/^(\d{1,2}):?(\d{2})$/); if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null
  const [h, mi] = hm(now).split(':').map(Number); const t = Date.parse(now) - (Date.parse(now) % 60_000)
  return new Date(t + ((Number(m[1]) * 60 + Number(m[2])) - (h * 60 + mi)) * 60_000).toISOString()
}
