// Chronic care, worked out (spec/openCare.md §5.7, Q28–Q30; pictures #chronic-visit, #chronic-list): a patient's registers from the
// problem list's codes (resolved takes them off), each condition's measures against its targets (the patient's own target wins), and
// its checks — done when an entry with one of the check's codes was written, due when the last is older than its interval (shorter while
// a target is off). Never typed; a notice, never a stop. Pure: a node test imports it.
import type { Organization } from '@core/db/types'
import { settingIn } from '@core/screens/settings/form/model'

export const PACK = 'chronic_care'
export const TARGET_TYPE = 'chronic_care.target'
export type Op = '<' | '<=' | '>' | '>='
export interface Target { measure: string; op: Op; value: number; value2?: number }
export interface Check { key?: string; name: string; codes: string[]; every_months: number; off_target_months?: number }
export interface Condition { key: string; name: string; codes: string[]; targets?: Target[]; checks?: Check[] }
export interface Conditions { window_months: number; conditions: Condition[] }
/** the clinic's settings (a clinic-wide key is kept under the clinic's own id) */
type Org = (Pick<Organization, 'settings' | 'settingKeys' | 'datatypes'> & { organization?: { id: string } }) | undefined
export const conditionsOf = (org: Org): Conditions => { const s = settingIn(org, 'chronic_care.conditions' as never, org?.organization?.id ?? null) as Partial<Conditions>
  return { window_months: s.window_months ?? 18, conditions: s.conditions ?? [] } }

/** the measures a target may name: their name, unit, the codes whose latest value it reads (a pressure's two) */
export const MEASURES: Record<string, { name: string; unit?: string; codes: string[]; codes2?: string[] }> = {
  hba1c: { name: 'HbA1c', unit: '%', codes: ['loinc:4548-4'] },
  ldl: { name: 'LDL', unit: 'mg/dL', codes: ['loinc:2089-1', 'loinc:13457-7', 'loinc:18262-6'] },
  bp: { name: 'BP', codes: ['loinc:8480-6'], codes2: ['loinc:8462-4'] },
  egfr: { name: 'eGFR', codes: ['loinc:33914-3', 'loinc:62238-1', 'loinc:98979-8'] },
  acr: { name: 'Urine ACR', unit: 'mg/g', codes: ['loinc:9318-7', 'loinc:14959-1'] },
  k: { name: 'K', codes: ['loinc:2823-3'] }, creat: { name: 'creatinine', codes: ['loinc:2160-0'] },
}
/** the measures shown under each condition, in order (a target's first) */
export const SHOWN: Record<string, string[]> = { dm: ['hba1c', 'ldl'], htn: ['bp'], ckd: ['egfr'], hf: [], asthma: [], copd: [] }

/** one value as read (base.values): its code, number and clinical time */
export interface Value { code: string | null; value: number; at: string }
/** one problem as the list reads it: its code (icd10:E11) and status; its onset when known */
export interface ProblemIn { code: string | null; status: string; onset?: string | null; name?: string }
/** one coded entry that may do a check (an observation, a procedure, a result's analyte by its value) */
export interface Done { codes: string[]; at: string; text?: string | null }
/** a patient's own target */
export interface OwnTarget extends Target { condition: string; reason?: string | null; at: string }

const ACTIVE = new Set(['active', 'recurrence', 'relapse'])
/** the conditions a patient is on: an active problem whose ICD-10 code starts with one of the condition's */
export function registersOf(cs: Condition[], problems: ProblemIn[]): { condition: Condition; problem: ProblemIn }[] {
  const out: { condition: Condition; problem: ProblemIn }[] = []
  for (const c of cs) {
    const p = problems.find((x) => ACTIVE.has(x.status) && x.code?.startsWith('icd10:') && c.codes.some((k) => x.code!.slice(6).toUpperCase().startsWith(k.toUpperCase())))
    if (p) out.push({ condition: c, problem: p })
  }
  return out
}
const latest = (vs: Value[], codes: string[]) => vs.filter((v) => v.code && codes.includes(v.code)).sort((a, b) => b.at.localeCompare(a.at))
export interface Measure { key: string; name: string; unit?: string; value: number | null; value2?: number | null; at: string | null; trend: number[]; target: (Target & { own?: OwnTarget }) | null; off: boolean; up: boolean | null }
const meets = (t: Target, v: number, v2?: number | null) => { const ok = (a: number, b: number) => t.op === '<' ? a < b : t.op === '<=' ? a <= b : t.op === '>' ? a > b : a >= b
  return ok(v, t.value) && (t.value2 == null || v2 == null || ok(v2, t.value2)) }
/** a measure now, against the target (the patient's own for this condition wins), with its last few values */
export function measureOf(key: string, c: Condition, values: Value[], own: OwnTarget[]): Measure {
  const m = MEASURES[key] ?? { name: key, codes: [] }
  const vs = latest(values, m.codes); const v2 = m.codes2 ? latest(values, m.codes2) : []
  // the patient's own target for this measure wins (one written for this condition first, else for another of theirs)
  const mine = own.filter((t) => t.measure === key).sort((a, b) => Number(b.condition === c.key) - Number(a.condition === c.key) || b.at.localeCompare(a.at))[0]
  const target = mine ? { ...mine, own: mine } : c.targets?.find((t) => t.measure === key) ?? null
  const value = vs[0]?.value ?? null; const second = v2.find((x) => x.at === vs[0]?.at)?.value ?? v2[0]?.value ?? null
  return { key, name: m.name, unit: m.unit, value, value2: m.codes2 ? second : undefined, at: vs[0]?.at ?? null, trend: vs.slice(0, 6).map((x) => x.value).reverse(),
    target, off: !!target && value != null && !meets(target, value, second), up: vs.length > 1 ? vs[0].value > vs[1].value : null }
}
export interface CheckState { check: Check; last: string | null; text: string | null; dueOn: string | null; due: boolean; months: number | null }
const addMonths = (iso: string, n: number) => { const d = new Date(iso); d.setMonth(d.getMonth() + n); return d.toISOString() }
const monthsSince = (iso: string, now: Date) => Math.floor((now.getTime() - Date.parse(iso)) / (30.44 * 86_400_000))
/** a check: the last entry with one of its codes (a value or a coded entry), due once its interval has passed (sooner while off target) */
export function checkOf(ch: Check, values: Value[], done: Done[], offTarget: boolean, now: Date): CheckState {
  const fromValues = latest(values, ch.codes)[0]
  const fromDone = done.filter((d) => d.codes.some((c) => ch.codes.includes(c))).sort((a, b) => b.at.localeCompare(a.at))[0]
  const last = [fromValues?.at, fromDone?.at].filter((x): x is string => !!x).sort().at(-1) ?? null
  const every = offTarget && ch.off_target_months ? ch.off_target_months : ch.every_months
  const dueOn = last ? addMonths(last, every) : null
  return { check: ch, last, text: last && fromDone?.at === last ? fromDone.text ?? null : null, dueOn, due: !last || Date.parse(dueOn!) <= now.getTime(), months: last ? monthsSince(last, now) : null }
}
export interface ConditionState { condition: Condition; problem: ProblemIn; measures: Measure[]; checks: CheckState[] }
/** every register of a patient with its measures and checks; a check two conditions share (urine ACR) counted once, under the first */
export function careOf(cs: Condition[], problems: ProblemIn[], values: Value[], done: Done[], own: OwnTarget[], now = new Date()): ConditionState[] {
  const seen = new Set<string>()
  return registersOf(cs, problems).map(({ condition, problem }) => {
    const keys = [...new Set([...(condition.targets ?? []).map((t) => t.measure), ...(SHOWN[condition.key] ?? [])])]
    const measures = keys.map((k) => measureOf(k, condition, values, own))
    const off = measures.some((m) => m.off)
    const checks = (condition.checks ?? []).filter((ch) => { const k = ch.key ?? ch.name; if (seen.has(k)) return false; seen.add(k); return true })
      .map((ch) => checkOf(ch, values, done, off, now))
    return { condition, problem, measures, checks }
  })
}
export interface CareSummary { offTarget: Measure[]; due: CheckState[]; conditions: string[] }
export const summaryOf = (st: ConditionState[]): CareSummary => ({
  offTarget: st.flatMap((s) => s.measures.filter((m) => m.off)).filter((m, i, xs) => xs.findIndex((x) => x.key === m.key) === i),
  due: st.flatMap((s) => s.checks.filter((c) => c.due)), conditions: st.map((s) => s.condition.name) })
/** a value in words: "8.2 %", "146/90" */
export const valueWords = (m: Measure) => m.value == null ? '—' : m.key === 'bp' ? `${m.value}/${m.value2 ?? '?'}` : `${m.value}${m.unit ? ` ${m.unit}` : ''}`
/** a target in words: "< 7", "< 130/80" */
export const targetWords = (t: Target) => `${t.op === '<=' ? '≤' : t.op === '>=' ? '≥' : t.op} ${t.value}${t.value2 != null ? `/${t.value2}` : ''}`
/** the off-target words of the list and the banner: "HbA1c 8.2 ↑" */
export const offWords = (m: Measure) => `${m.name} ${m.key === 'bp' ? `${m.value}/${m.value2 ?? '?'}` : m.value}${m.up === true ? ' ↑' : m.up === false ? ' ↓' : ''}`
