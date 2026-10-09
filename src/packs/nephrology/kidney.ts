// The kidney's stage and its panel (spec/openCare.md §5.8; the picture #renal-ckd), all worked out from the base's record, never typed:
// the KDIGO 2012 square from the latest eGFR and urine ACR (and the square a year before), eGFR over time (the laboratory's, else worked
// out from creatinine by CKD-EPI 2021), and the CKD panel with what stands beside each test on the medication list. Pure
// (npm run test:nephrology).
import type { Medication, ValueRow } from '@core/db/types'

export const EGFR = ['loinc:98979-8', 'loinc:62238-1'], CREAT = 'loinc:2160-0', ACR = 'loinc:14959-1'
const newest = (a: { at: string }, b: { at: string }) => b.at.localeCompare(a.at)
const DAY = 86_400_000

// ── KDIGO 2012 ──
export const G = [['G1', '≥ 90'], ['G2', '60–89'], ['G3a', '45–59'], ['G3b', '30–44'], ['G4', '15–29'], ['G5', '< 15']] as const
export const A = [['A1', '< 30'], ['A2', '30–300'], ['A3', '> 300']] as const
/** the risk of each square: low, moderately increased, high, very high (KDIGO 2012, Figure 2) */
export const RISK = [[0, 1, 2], [0, 1, 2], [1, 2, 3], [2, 3, 3], [3, 3, 3], [3, 3, 3]]
export const RISK_WORD = ['low', 'moderate', 'high', 'very high']
export const gOf = (egfr: number) => egfr >= 90 ? 0 : egfr >= 60 ? 1 : egfr >= 45 ? 2 : egfr >= 30 ? 3 : egfr >= 15 ? 4 : 5
export const aOf = (acr: number) => acr < 30 ? 0 : acr <= 300 ? 1 : 2
export interface Square { g: number; a: number | null; egfr: ValueRow; acr: ValueRow | null }
export const squareWord = (s: Pick<Square, 'g' | 'a'>) => `${G[s.g][0]}${s.a != null ? ` ${A[s.a][0]}` : ''}`
export const riskOf = (s: Pick<Square, 'g' | 'a'>) => s.a == null ? null : RISK[s.g][s.a]

/** CKD-EPI 2021 (race-free), creatinine in mg/dL, an adult's age in years */
export function ckdEpi2021(creat: number, age: number, female: boolean): number {
  const k = female ? 0.7 : 0.9, a = female ? -0.241 : -0.302
  return Math.round(142 * Math.min(creat / k, 1) ** a * Math.max(creat / k, 1) ** -1.2 * 0.9938 ** age * (female ? 1.012 : 1))
}
/** eGFR over time: the laboratory's where it gave one, else worked out from that creatinine (an adult's, in mg/dL), oldest first */
export function egfrSeries(values: ValueRow[], birth: string | null, female: boolean): ValueRow[] {
  const given = values.filter((v) => EGFR.includes(v.code ?? '')); const at = new Set(given.map((v) => v.entry_id))
  const worked = birth ? values.filter((v) => v.code === CREAT && !at.has(v.entry_id) && (v.unit ?? 'mg/dL').toLowerCase() === 'mg/dl').flatMap((v) => {
    const age = Math.floor((Date.parse(v.at) - Date.parse(birth)) / (365.25 * DAY)); return age >= 18 ? [{ ...v, key: 'egfr', code: EGFR[0], name: 'eGFR (worked out)', value: ckdEpi2021(v.value, age, female) }] : []
  }) : []
  return [...given, ...worked].sort((a, b) => a.at.localeCompare(b.at))
}
/** the square now (the latest eGFR, with the latest ACR within the year before it) and the one a year before (the eGFR nearest 12 months
 *  earlier, at least 9 months before, with its ACR) */
export function squaresOf(egfrs: ValueRow[], values: ValueRow[]): { now: Square | null; before: Square | null } {
  const acrs = values.filter((v) => v.code === ACR).sort(newest)
  const acrBy = (at: string) => acrs.find((a) => a.at <= at && Date.parse(at) - Date.parse(a.at) <= 366 * DAY) ?? null
  const sq = (e: ValueRow): Square => { const acr = acrBy(e.at) ?? (e === egfrs.at(-1) ? acrs[0] ?? null : null); return { g: gOf(e.value), a: acr ? aOf(acr.value) : null, egfr: e, acr } }
  const last = egfrs.at(-1); if (!last) return { now: null, before: null }
  const year = Date.parse(last.at) - 365 * DAY
  const old = egfrs.filter((e) => Date.parse(e.at) <= Date.parse(last.at) - 270 * DAY).sort((a, b) => Math.abs(Date.parse(a.at) - year) - Math.abs(Date.parse(b.at) - year))[0]
  return { now: sq(last), before: old ? sq(old) : null }
}
/** the fall a year (mL/min/1.73 m²), from the eGFR a year before; null with none */
export const fallOf = (now: Square | null, before: Square | null) => now && before ? Math.round((before.egfr.value - now.egfr.value) / Math.max(0.75, (Date.parse(now.egfr.at) - Date.parse(before.egfr.at)) / (365 * DAY))) : null

// ── the CKD panel, each test with what stands beside it ──
const atcOf = (m: Medication) => m.drug_code?.startsWith('atc:') ? m.drug_code.slice(4) : ''
const onAny = (meds: Medication[], atcs: string[], names: RegExp | null = null) => meds.find((m) => atcs.some((a) => atcOf(m).startsWith(a)) || (names && names.test(m.drug_name)))
const words = (m: Medication | undefined) => m ? `${m.drug_name}${m.dose_number != null ? ` ${m.dose_number}${m.dose_unit ? ` ${m.dose_unit}` : ''}` : ''}` : null
export interface PanelRow { key: string; name: string; value: ValueRow | null; beside: string }
const CODE = { hb: 'loinc:718-7', ferritin: 'loinc:2276-4', tsat: 'loinc:2502-3', ca: 'loinc:17861-6', alb: 'loinc:1751-7', phos: 'loinc:2777-1', pth: 'loinc:2731-8', bicarb: 'loinc:1963-8', k: 'loinc:2823-3' }
export function panelOf(values: ValueRow[], meds: Medication[]): PanelRow[] {
  const last = (code: string) => values.filter((v) => v.code === code).sort(newest)[0] ?? null
  const ferritin = last(CODE.ferritin), tsat = last(CODE.tsat), alb = last(CODE.alb), ca = last(CODE.ca)
  const iron = onAny(meds, ['B03A']), esa = onAny(meds, ['B03XA']), binder = onAny(meds, ['V03AE']), vitd = onAny(meds, ['A11CC', 'H05BX'])
  const bicarb = onAny(meds, ['B05CB04', 'A02AH', 'B05XA02'], /bicarbonate|sodamint/i), raas = onAny(meds, ['C09', 'C03DA'])
  return [
    { key: 'hb', name: 'Hb', value: last(CODE.hb), beside: [ferritin && `ferritin ${ferritin.value}`, tsat && `TSAT ${tsat.value} %`, iron ? `on ${words(iron)}` : 'iron not on', esa ? `on ${words(esa)}` : 'ESA not on'].filter(Boolean).join(' · ') },
    { key: 'ca', name: 'Calcium', value: ca, beside: ca && alb ? `corrected for albumin ${alb.value}: ${Math.round((ca.value + 0.8 * (4 - alb.value)) * 10) / 10}` : 'albumin not checked' },
    { key: 'phos', name: 'Phosphate', value: last(CODE.phos), beside: binder ? `on ${words(binder)}` : 'no binder' },
    { key: 'pth', name: 'PTH', value: last(CODE.pth), beside: vitd ? `on ${words(vitd)}` : 'vitamin D not checked' },
    { key: 'bicarb', name: 'Bicarbonate', value: last(CODE.bicarb), beside: bicarb ? `on ${words(bicarb)}` : 'not on bicarbonate' },
    { key: 'k', name: 'Potassium', value: last(CODE.k), beside: raas ? `on ${words(raas)}` : 'no ACEi, ARB or MRA' },
  ]
}
