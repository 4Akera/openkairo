// The family pack's checks (spec/openCare.md §5.7, Q49; pictures #family-folder, #family-checks): due by age and sex (and a BMI from an
// age), each met by a base entry with one of its codes — a BP in the vitals, an HbA1c result, a smear — never ticked by hand; due when
// never met or its interval has passed. Pure: a node test imports it.
import type { Organization } from '@core/db/types'
import { settingIn } from '@core/screens/settings/form/model'

export const PACK = 'familycare'
export interface FamilyCheck { name: string; who?: string; sex?: 'any' | 'female' | 'male'; from?: number; to?: number; bmi_from?: number; bmi_age_from?: number
  every_years?: number; once?: boolean; codes: string[]; met_by?: string; order?: string }
/** the clinic's settings (a clinic-wide key is kept under the clinic's own id) */
type Org = (Pick<Organization, 'settings' | 'settingKeys' | 'datatypes'> & { organization?: { id: string } }) | undefined
export const checksOf = (org: Org): FamilyCheck[] => ((settingIn(org, 'familycare.checks' as never, org?.organization?.id ?? null) as { checks?: FamilyCheck[] }).checks ?? [])
export const askAtNewPatient = (org: Org) => (settingIn(org, 'familycare.files' as never, org?.organization?.id ?? null) as { ask_at_new_patient?: boolean }).ask_at_new_patient !== false

export interface Person { sex: string | null | undefined; born: string | null | undefined }
/** one thing done that may meet a check: its codes, when (a value by its code, a coded observation or procedure) */
export interface Met { codes: string[]; at: string; value?: number | null }
export const BMI = 'loinc:39156-5'
const years = (born: string, now: Date) => { const b = new Date(born); let y = now.getFullYear() - b.getFullYear(); if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) y--; return y }
export interface CheckState { check: FamilyCheck; state: 'due' | 'met'; last: string | null; why: string }
/** the checks for this person, by age and sex (a BMI from an age), with whether each is met now */
export function checksFor(cs: FamilyCheck[], p: Person, met: Met[], now = new Date()): CheckState[] {
  if (!p.born) return []
  const age = years(p.born, now); const sex = p.sex === 'female' ? 'female' : p.sex === 'male' ? 'male' : null
  const bmi = met.filter((m) => m.codes.includes(BMI) && m.value != null).sort((a, b) => b.at.localeCompare(a.at))[0]?.value ?? null
  return cs.flatMap((c) => {
    if (c.sex && c.sex !== 'any' && sex && c.sex !== sex) return []
    if (c.sex && c.sex !== 'any' && !sex) return []
    const byAge = (c.from == null || age >= c.from) && (c.to == null || age <= c.to)
    const byBmi = c.bmi_from != null && bmi != null && bmi >= c.bmi_from && age >= (c.bmi_age_from ?? 18) && (c.to == null || age <= c.to)
    if (!byAge && !byBmi) return []
    const last = met.filter((m) => m.codes.some((x) => c.codes.includes(x))).map((m) => m.at).sort().at(-1) ?? null
    const fresh = last && (c.once || (c.every_years != null && (now.getTime() - Date.parse(last)) < c.every_years * 365.25 * 86_400_000))
    const why = !byAge && byBmi ? `BMI ${c.bmi_from} or more` : c.who ?? ''
    return [{ check: c, state: fresh ? 'met' as const : 'due' as const, last, why }]
  })
}
/** "2 checks due" */
export const dueWords = (st: CheckState[]) => { const n = st.filter((s) => s.state === 'due').length; return n ? `${n} ${n === 1 ? 'check' : 'checks'} due` : null }

/** how another member is related to the one whose chart this is (a wife's head is her husband; his mother) */
export function relationTo(viewer: string | null | undefined, other: string | null | undefined): string {
  if (!other) return ''
  if (viewer === 'wife' && other === 'head') return 'husband'
  if (viewer === 'husband' && other === 'head') return 'wife'
  if ((viewer === 'wife' || viewer === 'husband') && (other === 'mother' || other === 'father')) return `${viewer === 'wife' ? 'his' : 'her'} ${other}`
  return other === 'head' ? 'head of the family' : other
}
/** what the record says a member has met (values by code, coded observations and procedures) */
export const metOf = (values: { code: string | null; value: number; at: string }[], facts: { codes?: string[]; occurred_at: string; hidden?: boolean }[] = []): Met[] =>
  [...values.filter((v) => v.code).map((v) => ({ codes: [v.code!], at: v.at, value: v.value })), ...facts.filter((f) => !f.hidden).map((f) => ({ codes: f.codes ?? [], at: f.occurred_at }))]


// ── the desk's step (C4): what was chosen, and what it still needs ──
export type StepValue = { mode: 'join'; household: string; number: number; relation: string; dept: string } | { mode: 'start'; address: string; dept: string } | { mode: 'none' } | null
export const stepMissing = (v: unknown) => !v ? 'Join a family file or start one (or not now)' : (v as StepValue)?.mode === 'join' && !(v as { relation?: string }).relation ? 'How are they related?' : null
