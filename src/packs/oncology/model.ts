// The oncology pack's arithmetic and words (spec/openCare.md §5.8; the pictures #onc-plan, #onc-cycle, #onc-unit): the clinic's
// regimens as its setting holds them, BSA by Mosteller, each dose worked out and rounded as the regimen says (mg/m², AUC by Calvert
// with Cockcroft–Gault, mg/kg, flat), the regimen's checks against the latest values (shown, never a stop), the cancer and its
// cycles from the patient's entries. Worked out, never typed. Pure: a node test imports it.

export type Basis = 'm2' | 'auc' | 'kg' | 'flat'
export interface Drug { drug: string; atc?: string; per: number; basis: Basis; round?: number; how?: string; watch?: boolean }
export type Test = 'anc' | 'plt' | 'hb' | 'creat' | 'egfr' | 'bili' | 'alt' | 'ef'
export interface Check { test: Test; min?: number; max?: number }
export interface Regimen { key: string; name: string; site?: string; every_days?: number; cycles?: number; drugs?: Drug[]; premeds?: string[]; checks?: Check[] }
export interface Plan { name: string; site?: string; regimens: string[] }
export interface Regimens { regimens: Regimen[]; plans: Plan[] }

type SettingsOrg = { organization: { id: string }; settings: { key: string; thing_id: string; data: Record<string, unknown> }[] }
/** the clinic's regimens and plans, as its setting stands (none: empty lists) */
export function regimensOf(org: SettingsOrg | null | undefined): Regimens {
  const row = org?.settings.find((s) => s.key === 'oncology.regimens' && s.thing_id === org.organization.id)
  const d = (row?.data ?? {}) as Partial<Regimens>
  return { regimens: d.regimens ?? [], plans: d.plans ?? [] }
}
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '')
/** a regimen by its key or the start of its name ("ac", "folfox", "pac" → Paclitaxel weekly); a word fitting two is not guessed */
export function regimenNamed(list: Regimen[], word: string): Regimen | Regimen[] | null {
  const w = norm(word); if (!w) return null
  const exact = list.filter((r) => norm(r.key) === w || norm(r.name) === w)
  if (exact.length) return exact.length === 1 ? exact[0] : exact
  const starts = list.filter((r) => norm(r.name).startsWith(w) || norm(r.key).startsWith(w))
  return starts.length === 1 ? starts[0] : starts.length ? starts : null
}

// ── body size and kidney ──
/** Mosteller: √(height cm × weight kg ÷ 3600), to two decimals */
export const mosteller = (heightCm: number, weightKg: number) => Math.round(Math.sqrt(heightCm * weightKg / 3600) * 100) / 100
/** Cockcroft–Gault creatinine clearance (mL/min), creatinine in mg/dL; for Calvert's GFR, capped at 125 */
export function cockcroftGault(age: number, weightKg: number, creatMgDl: number, female: boolean): number {
  const c = ((140 - age) * weightKg) / (72 * Math.max(creatMgDl, 0.1)) * (female ? 0.85 : 1)
  return Math.min(125, Math.round(c))
}
/** eGFR by CKD-EPI 2021 (mL/min/1.73 m²), creatinine in mg/dL, an adult's: when the record has creatinine and no eGFR */
export function ckdEpi2021(creatMgDl: number, age: number, female: boolean): number {
  const k = female ? 0.7 : 0.9; const a = female ? -0.241 : -0.302; const r = creatMgDl / k
  return Math.round(142 * Math.min(r, 1) ** a * Math.max(r, 1) ** -1.2 * 0.9938 ** age * (female ? 1.012 : 1))
}
/** a number rounded to the regimen's step (1 mg, 10 mg, 0.1 mg) */
export function roundTo(n: number, step = 1): number {
  const r = Math.round(n / step) * step
  const dp = Math.max(0, -Math.floor(Math.log10(step)))
  return Number(r.toFixed(Math.min(dp, 4)))
}

export interface Body { height?: number | null; weight?: number | null; age?: number | null; female?: boolean; creat?: number | null }
export interface Dose { drug: string; atc?: string; per: number; basis: Basis; worked: number; dose: number; unit: string; how?: string; watch?: boolean; why?: string }
/** each drug's dose for this body at this percent: worked out (per × BSA, × weight, AUC × (GFR + 25), flat) then rounded */
export function dosesOf(r: Regimen, b: Body, percent = 100): { bsa: number | null; gfr: number | null; doses: Dose[]; missing: string | null } {
  const bsa = b.height && b.weight ? mosteller(b.height, b.weight) : null
  const gfr = b.age != null && b.weight && b.creat ? cockcroftGault(b.age, b.weight, b.creat, !!b.female) : null
  const doses: Dose[] = []; let missing: string | null = null
  for (const d of r.drugs ?? []) {
    const f = percent / 100
    const worked = d.basis === 'm2' ? (bsa ? d.per * bsa * f : null) : d.basis === 'kg' ? (b.weight ? d.per * b.weight * f : null)
      : d.basis === 'auc' ? (gfr != null ? d.per * (gfr + 25) * f : null) : d.per * f
    if (worked == null) { missing = d.basis === 'auc' ? 'creatinine, age and weight for Calvert' : d.basis === 'kg' ? "today's weight" : "today's height and weight"; continue }
    const w = Math.round(worked * 10) / 10
    const why = d.basis === 'm2' ? `${d.per} mg/m² × ${bsa}` : d.basis === 'kg' ? `${d.per} mg/kg × ${b.weight} kg` : d.basis === 'auc' ? `AUC ${d.per} × (GFR ${gfr} + 25)` : 'flat'
    doses.push({ drug: d.drug, atc: d.atc, per: d.per, basis: d.basis, worked: w, dose: roundTo(worked, d.round ?? 1), unit: 'mg', how: d.how, watch: d.watch, why: percent !== 100 ? `${why} × ${percent} %` : why })
  }
  return { bsa, gfr, doses, missing }
}
/** a number as the picture writes it: a thin space between thousands ("1 070") */
export const mg = (n: number) => n >= 1000 ? n.toLocaleString('en-US').replace(/,/g, ' ') : String(n)

// ── the checks before a cycle: the regimen's limits against the latest values; shown, never a stop ──
export interface Value { key: string; code: string | null; value: number; at: string }
const CODES: Record<Test, string[]> = { anc: ['751-8', '26499-4'], plt: ['777-3', '26515-7'], hb: ['718-7'], creat: ['2160-0', '38483-4'], egfr: ['98979-8', '62238-1', '33914-3'],
  bili: ['1975-2'], alt: ['1742-6', '1743-4'], ef: ['10230-1', '18043-0'] }
const WORDS: Record<Test, string> = { anc: 'ANC', plt: 'Platelets', hb: 'Hb', creat: 'Creatinine', egfr: 'eGFR', bili: 'Bilirubin', alt: 'ALT', ef: 'EF' }
const KEYS: Record<Test, string[]> = { anc: ['anc'], plt: ['plt'], hb: ['hb'], creat: ['creat'], egfr: ['egfr'], bili: ['tbil', 'bili'], alt: ['alt'], ef: ['ef'] }
/** the latest value of a test, by its keys or its LOINC codes */
export function latestOf(values: Value[], t: Test): Value | null {
  return values.filter((v) => KEYS[t].includes(v.key) || (v.code && CODES[t].includes(v.code.replace(/^loinc:/, '')))).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null
}
export interface Checked { test: Test; text: string; ok: boolean | null; at: string | null }
const limit = (c: Check) => c.min != null && c.max != null ? `${c.min}–${c.max}` : c.min != null ? `${c.min} or more` : c.max != null ? `under ${c.max}` : ''
/** each check: the value and its limit in words, ok or not (null: no value in the record) */
export function checksOf(r: Regimen, values: Value[], egfr?: number | null): Checked[] {
  return (r.checks ?? []).map((c) => {
    const v = latestOf(values, c.test); const n = v?.value ?? (c.test === 'egfr' && egfr != null ? egfr : null)
    if (n == null) return { test: c.test, text: `${WORDS[c.test]} · not in the record · ${limit(c)}`, ok: null, at: null }
    if (!v && c.test === 'egfr') return { test: c.test, text: `eGFR ${n} · worked out from creatinine · ${limit(c)}`, ok: (c.min == null || n >= c.min) && (c.max == null || n <= c.max), at: null }
    const ok = (c.min == null || n >= c.min) && (c.max == null || n <= c.max)
    const unit = c.test === 'ef' ? ' %' : ''
    return { test: c.test, text: `${WORDS[c.test]} ${n}${unit} · ${limit(c)}${unit}`, ok, at: v?.at ?? null }
  })
}

// ── the cancer and its cycles, from the patient's entries ──
export interface Entry { id: string; item: string; type: string; occurred_at: string; recorded_at: string; data?: Record<string, unknown> }
export interface CancerWords { site?: string; side?: string; morphology?: { text: string; codings?: { system: string; code: string }[] }; grade?: string
  tnm?: { t?: string; n?: string; m?: string; edition?: string }; stage?: string; markers?: { name: string; value: string }[]; intent?: string
  plan?: { step: string; status: 'done' | 'now' | 'todo'; text?: string }[]; regimen?: string }
export interface Cancer { entry: Entry; name: string; code: string | null; words: CancerWords; active: boolean }
export interface CycleWords { regimen: string; name?: string; cycle: number; of?: number; day: number; height?: number; weight?: number; bsa?: number; percent?: number
  decision: 'give' | 'delay' | 'reduce'; delay_days?: number; doses?: { drug: string; per?: number; basis?: Basis; worked?: number; dose: number; unit: string; how?: string }[]
  checks?: { text: string; ok?: boolean }[]; toxicity?: { term: string; grade: number }[]; premeds?: string[]; added?: string[] }
export interface Cycle { entry: Entry; words: CycleWords; status: string; due: string }
const ACTIVE = new Set(['active', 'recurrence', 'relapse'])
export function cancersOf(entries: Entry[]): Cancer[] {
  return entries.filter((e) => e.type === 'oncology.cancer' && e.data).map((e) => {
    const d = e.data as { concept?: { text?: string; codings?: { code: string }[] }; clinical_status?: string; oncology?: CancerWords }
    return { entry: e, name: d.concept?.text ?? 'Cancer', code: d.concept?.codings?.[0]?.code ?? null, words: d.oncology ?? {}, active: ACTIVE.has(d.clinical_status ?? 'active') }
  }).sort((a, b) => b.entry.occurred_at.localeCompare(a.entry.occurred_at))
}
export function cyclesOf(entries: Entry[]): Cycle[] {
  return entries.filter((e) => e.type === 'oncology.cycle' && e.data).map((e) => {
    const d = e.data as { status?: string; due?: string; oncology?: CycleWords }
    return { entry: e, words: d.oncology ?? { regimen: '', cycle: 0, day: 1, decision: 'give' as const }, status: d.status ?? 'active', due: d.due ?? e.occurred_at }
  }).sort((a, b) => a.due.localeCompare(b.due))
}
/** the cycle's short words: "AC 3 of 4" (the banner), "AC C3 D1" (a chair), "Paclitaxel W3" (weekly) */
export const cycleShort = (w: Pick<CycleWords, 'name' | 'regimen' | 'cycle' | 'of'>) => `${w.name ?? w.regimen} ${w.cycle}${w.of ? ` of ${w.of}` : ''}`
export const cycleTile = (w: Pick<CycleWords, 'name' | 'regimen' | 'cycle' | 'day'>, weekly = false) =>
  `${(w.name ?? w.regimen).replace(/ weekly$/i, '')} ${weekly ? 'W' : 'C'}${w.cycle}${weekly ? '' : ` D${w.day}`}`
/** the next cycle of a regimen for this patient: one after the last given or signed of it */
export const nextCycle = (cycles: Cycle[], regimen: string) => Math.max(0, ...cycles.filter((c) => c.words.regimen === regimen && c.status !== 'revoked').map((c) => c.words.cycle)) + 1
/** the cumulative doxorubicin (mg/m²) given so far: each cycle's per × percent */
export const anthracycline = (cycles: Cycle[]) => cycles.filter((c) => c.status !== 'revoked' && c.words.decision !== 'delay')
  .reduce((t, c) => t + (c.words.doses ?? []).filter((d) => /doxorubicin|epirubicin/i.test(d.drug) && d.basis === 'm2').reduce((s, d) => s + (d.per ?? 0) * (c.words.percent ?? 100) / 100, 0), 0)
/** the stage chip word: "IIB · AC 3" while a cycle is planned or given, else the stage */
export function chipWord(cancer: Cancer | undefined, cycles: Cycle[]): string | null {
  if (!cancer) return null
  const last = [...cycles].reverse().find((c) => c.status !== 'revoked')
  return [cancer.words.stage, last && `${last.words.name ?? last.words.regimen} ${last.words.cycle}`].filter(Boolean).join(' · ') || 'on record'
}
/** the banner's words: the cancer in two words ("Breast · IIB"), then where the regimen is ("AC 3 of 4") */
export function bannerWords(cancer: Cancer | undefined, cycles: Cycle[]): string[] {
  if (!cancer) return []
  const site = cancer.words.site ? cancer.words.site.charAt(0).toUpperCase() + cancer.words.site.slice(1) : cancer.name.split(/[ ,]/)[0]
  const last = [...cycles].reverse().find((c) => c.status !== 'revoked')
  return [[site, cancer.words.stage].filter(Boolean).join(' · '), last ? cycleShort(last.words) : ''].filter(Boolean)
}
/** the toxicities CTCAE v5 asks after each cycle, with their codes (MedDRA LLT, as CTCAE v5 names them) */
export const TOXICITIES: { key: string; term: string; code: string; grades: number[] }[] = [
  { key: 'fn', term: 'Febrile neutropenia', code: '10016288', grades: [0, 3, 4] },
  { key: 'nausea', term: 'Nausea', code: '10028813', grades: [0, 1, 2, 3] },
  { key: 'vomiting', term: 'Vomiting', code: '10047700', grades: [0, 1, 2, 3, 4] },
  { key: 'mucositis', term: 'Mucositis oral', code: '10028130', grades: [0, 1, 2, 3, 4] },
  { key: 'diarrhoea', term: 'Diarrhea', code: '10012735', grades: [0, 1, 2, 3, 4] },
  { key: 'neuropathy', term: 'Peripheral sensory neuropathy', code: '10034620', grades: [0, 1, 2, 3, 4] },
  { key: 'fatigue', term: 'Fatigue', code: '10016256', grades: [0, 1, 2, 3] },
]
/** the four the picture asks for a regimen's cycle: febrile neutropenia, nausea, mucositis, neuropathy */
export const ASKED = ['fn', 'nausea', 'mucositis', 'neuropathy']
