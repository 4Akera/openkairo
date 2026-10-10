// Chronic care's word on a queue row of a department that ticks it (spec/openCare.md §5.8; the pictures #family-day and #chronic-list:
// "HbA1c 9.4", "3 due"), through the core's (l) of §5.7: read once a list as the Chronic care tab reads it — the problem lists and the
// values its measures and checks name (the base's tables), the pack's own coded checks and own targets — for the patients on the queue
// only. One word a row: the first measure off target (amber), else how many checks are due (amber), else nothing. A failed read (a role
// without the tab's reading) says nothing.
import type { Organization } from '@core/db/types'
import type { OrderWord, PackRow, RowCtx } from '@core/screens/rows'
import { MEASURES, careOf, conditionsOf, offWords, summaryOf, type Done, type OwnTarget, type ProblemIn, type Value } from './model'

/** each patient's problems, values, checks done and own targets, as the model reads them */
export type CareRows = Record<string, { problems: ProblemIn[]; values: Value[]; done: Done[]; own: OwnTarget[] }>
export type Lists = { patient_id: string; code: string | null; status: string }
export type Values = { patient_id: string; code: string | null; value: number; at: string }
export type Checks = { patient_id: string; codes: string[]; at: string; text: string | null }
export type Targets = { patient_id: string; condition: string; measure: string; op: OwnTarget['op']; value: number; value2: number | null; reason: string | null; at: string }

/** the codes the clinic's measures and checks name: the values read */
export const careCodes = (org: Organization | undefined) => [...new Set([...Object.values(MEASURES).flatMap((m) => [...m.codes, ...(m.codes2 ?? [])]),
  ...conditionsOf(org).conditions.flatMap((c) => (c.checks ?? []).flatMap((ch) => ch.codes))])]

/** the read as the words take it (pure) */
export function careRowsOf(ids: string[], lists: Lists[], values: Values[], checks: Checks[], targets: Targets[]): CareRows {
  const out: CareRows = Object.fromEntries(ids.map((id) => [id, { problems: [], values: [], done: [], own: [] }]))
  const at = (id: string) => out[id] ??= { problems: [], values: [], done: [], own: [] }
  for (const p of lists) at(p.patient_id).problems.push({ code: p.code, status: p.status })
  for (const v of values) at(v.patient_id).values.push({ code: v.code, value: v.value, at: v.at })
  for (const c of checks) at(c.patient_id).done.push({ codes: c.codes, at: c.at, text: c.text })
  for (const x of targets) at(x.patient_id).own.push({ condition: x.condition, measure: x.measure, op: x.op, value: x.value, value2: x.value2 ?? undefined, reason: x.reason, at: x.at })
  return out
}
/** the row's word (pure): off target first, else "3 due", else nothing */
export function careWords(row: Pick<PackRow, 'patient_id'>, ctx: Pick<RowCtx, 'list'> & { org?: Organization }, data: CareRows | null | undefined, now = new Date()): OrderWord[] {
  const r = ctx.list === 'queue' ? data?.[row.patient_id] : undefined; if (!r) return []
  const st = careOf(conditionsOf(ctx.org).conditions, r.problems, r.values, r.done, r.own, now); if (!st.length) return []
  const s = summaryOf(st)
  if (s.offTarget.length) return [{ word: offWords(s.offTarget[0]), tone: 'warn' }]
  return s.due.length ? [{ word: `${s.due.length} due`, tone: 'warn' }] : []
}
