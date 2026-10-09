// The facts before contrast and an X-ray (spec/openCare.md §5.5, Q4: shown, never a stop): the latest eGFR (else creatinine) and its
// age, metformin among the current medicines, the allergies (one to contrast named), pregnant or not for a woman of 12–50. From what
// the reader may already see: the chart's record on the doctor's card (core change (b)), the patient's lists and values on the scan
// card. Pure.
import type { Allergy, ListReview, Medication, PatientBanner, ValueRow } from '@core/db/types'
import type { StandingFacts } from '@core/screens/visit/facts'

export interface Facts {
  egfr: { value: number; days: number; worked?: boolean } | null; creatinine: { value: number; days: number } | null
  metformin: string | null; allergies: string[]; allergiesAsked: boolean; contrastAllergy: string | null
  pregnancy: 'pregnant' | 'not' | null; mayBePregnant: boolean
}
const EGFR = new Set(['98979-8', '62238-1', '33914-3', '48642-3', '48643-1']); const CREAT = new Set(['2160-0', '38483-4'])
const RECENT = 30   // days: an older eGFR or creatinine reads "no recent eGFR" (the approved picture)
const daysAgo = (at: string, now: number) => Math.max(0, Math.floor((now - Date.parse(at)) / 86_400_000))
type Val = Pick<ValueRow, 'key' | 'code' | 'value' | 'at'> & Partial<Pick<ValueRow, 'ucum' | 'unit'>>
const latest = (vals: Val[], keys: string[], codes: Set<string>, now: number) => {
  const v = vals.filter((x) => keys.includes(x.key) || (x.code && codes.has(x.code.replace(/^loinc:/, '')))).sort((a, b) => b.at.localeCompare(a.at))[0]
  return v && daysAgo(v.at, now) <= RECENT ? { value: Number(v.value), days: daysAgo(v.at, now), unit: (v.ucum ?? v.unit ?? null) } : null
}
/** creatinine in mg/dL, as CKD-EPI takes it: µmol/L converted, an unknown unit dropped (no eGFR rather than a wrong one) */
const inMgDl = (c: { value: number; days: number; unit: string | null } | null) => !c ? null
  : !c.unit || /^mg\/dl$/i.test(c.unit) ? { value: c.value, days: c.days }
  : /^(umol|µmol)\/l$/i.test(c.unit) ? { value: Math.round(c.value / 88.42 * 100) / 100, days: c.days } : null
const CONTRAST = /contrast|iodin|gadolin|omnipaque|ultravist|visipaque|iohexol|iopromide|iodixanol/i
// metformin alone or in a combination, by name (brands sold in Egypt among them) or by ATC (A10BA02, and the A10BD combinations with it)
const MET_NAME = /metformin|glucophage|cidophage|janumet|galvus\s*met|eucreas|xigduo|synjardy|jentadueto|kombiglyze|komboglyze|vipdomet|segluromet|invokamet|vokanamet|glucovance|amaryl\s*m\b|glimet|competact|actoplus|\bmet\b/i
const MET_ATC = /^(atc:)?A10B(A02|D(02|03|05|07|08|10|11|13|14|15|16|17|18|20|22|23|25|26|27))/
export const isMetformin = (m: Pick<Medication, 'drug_code' | 'drug_name'>) => MET_NAME.test(m.drug_name) || MET_ATC.test(m.drug_code ?? '')

export function factsOf(r: { patient?: Pick<PatientBanner, 'sex' | 'age'>; values?: Val[]; medications?: Pick<Medication, 'drug_code' | 'drug_name' | 'status' | 'dose_number' | 'dose_unit' | 'frequency'>[]
  allergies?: Pick<Allergy, 'substance_name' | 'status'>[]; allergy_review?: Pick<ListReview, 'outcome'> | null } | null | undefined, standing?: Pick<StandingFacts, 'pregnancy'> | null, now = Date.now()): Facts {
  const vals = r?.values ?? []
  const met = (r?.medications ?? []).find((m) => m.status === 'active' && isMetformin(m))
  const allergies = (r?.allergies ?? []).filter((a) => a.status === 'active').map((a) => a.substance_name)
  const preg = standing?.pregnancy?.data
  const age = r?.patient?.age ?? null; const creatinine = inMgDl(latest(vals, ['creat'], CREAT, now))
  const e = latest(vals, ['egfr'], EGFR, now); const egfr = e && { value: e.value, days: e.days }
  // none reported: worked out from the creatinine (CKD-EPI 2021, an adult's), when it is the newer
  const worked = creatinine && age != null && age >= 18 && (r?.patient?.sex === 'female' || r?.patient?.sex === 'male') && (!egfr || creatinine.days < egfr.days)
    ? { value: ckdEpi(creatinine.value, age, r!.patient!.sex === 'female'), days: creatinine.days, worked: true } : null
  return {
    egfr: worked ?? egfr, creatinine,
    metformin: met ? ['metformin', met.dose_number != null ? `${met.dose_number}${met.dose_unit ? ` ${met.dose_unit}` : ''}` : '', met.frequency ?? ''].filter(Boolean).join(' ') : null,
    allergies, allergiesAsked: allergies.length > 0 || !!r?.allergy_review, contrastAllergy: allergies.find((a) => CONTRAST.test(a)) ?? null,
    pregnancy: preg ? (preg.status === 'current' && preg.pregnant ? 'pregnant' : preg.status === 'current' ? 'not' : null) : null,
    mayBePregnant: r?.patient?.sex === 'female' && age != null && age >= 12 && age <= 50,
  }
}
/** eGFR by CKD-EPI 2021 (no race term), creatinine in mg/dL, mL/min/1.73 m², whole */
export function ckdEpi(scr: number, age: number, female: boolean): number {
  const k = female ? 0.7 : 0.9; const a = female ? -0.241 : -0.302
  return Math.round(142 * Math.min(scr / k, 1) ** a * Math.max(scr / k, 1) ** -1.2 * 0.9938 ** age * (female ? 1.012 : 1))
}
