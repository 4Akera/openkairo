import type { Allergy, Medication, Problem } from '../../../db/types'
import { ALLERGENS, CROSS, DRUGS, PROBLEMS, REACTIONS } from './data'
import type { Drug } from './types'
export type { Allergen, Drug, ProblemTerm } from './types'
export { ALLERGENS, DRUGS, PROBLEMS, REACTIONS }

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
/** rank: exact name or synonym · name starts · a word starts · anywhere */
function rank<T>(items: T[], q: string, names: (t: T) => string[], limit: number): T[] {
  const s = norm(q); if (!s) return []
  const scored = items.map((t) => { const ns = names(t).map(norm); let best = 9
    for (const n of ns) { const r = n === s ? 0 : n.startsWith(s) ? 1 : n.split(' ').some((w) => w.startsWith(s)) ? 2 : s.length >= 3 && n.includes(s) ? 3 : 9; if (r < best) best = r }
    return [best, t] as const }).filter(([b]) => b < 9)
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, t]) => t)
}
export const suggestDrugs = (q: string, n = 6) => rank(DRUGS, q, (d) => [d.name, ...d.synonyms], n)
export const suggestProblems = (q: string, n = 6) => rank(PROBLEMS, q, (p) => [p.name, ...p.abbr], n)
export const suggestAllergens = (q: string, n = 6) => rank(ALLERGENS, q, (a) => [a.name, ...a.synonyms], n)
/** a typed word names one item: its name, or a synonym only it has ("ppi" and "ms" name several, so they only suggest) */
function finder<T>(items: T[], name: (t: T) => string, others: (t: T) => string[]) {
  const byName = new Map<string, T>(); const bySyn = new Map<string, T | null>()
  for (const t of items) { byName.set(norm(name(t)), t); for (const o of new Set(others(t).map(norm))) bySyn.set(o, bySyn.has(o) && bySyn.get(o) !== t ? null : t) }
  return (q: string): T | undefined => { const s = norm(q); return byName.get(s) ?? bySyn.get(s) ?? undefined }
}
export const findDrug = finder(DRUGS, (d) => d.name, (d) => d.synonyms)
export const findProblem = finder(PROBLEMS, (p) => p.name, (p) => p.abbr)
export const findAllergen = finder(ALLERGENS, (a) => a.name, (a) => a.synonyms)
/** the allergy class of a recorded allergy: its stored class, else what its name says */
export const classOfAllergy = (a: Pick<Allergy, 'class_code' | 'substance_name'>) => a.class_code ?? findAllergen(a.substance_name)?.allergy_class ?? findDrug(a.substance_name)?.allergy_class ?? null
/** the drug a name means: the whole name, else the longest run of its words the lists know ("Amoxicillin susp" → Amoxicillin) */
export function resolveDrug(name: string): Drug | undefined {
  const whole = findDrug(name); if (whole) return whole
  const ws = name.split(/[\s/+,()-]+/).filter((w) => w.length >= 3)
  for (let k = ws.length; k >= 1; k--) for (let i = 0; i + k <= ws.length; i++) { const d = findDrug(ws.slice(i, i + k).join(' ')); if (d) return d }
  return undefined
}
export const classOfDrug = (name: string): string | null => findAllergen(name)?.allergy_class ?? resolveDrug(name)?.allergy_class ?? null
const known = (name: string) => !!resolveDrug(name) || !!findAllergen(name)

export interface Warning { level: 'block' | 'caution'; text: string }
const said = (a: Pick<Allergy, 'substance_name' | 'reactions_text' | 'severity'>) => `${a.substance_name}${a.reactions_text ? ` (${a.reactions_text}${a.severity ? `, ${a.severity}` : ''})` : a.severity ? ` (${a.severity})` : ''}`
/** one allergy against one drug: the same drug or class blocks; a cross-reacting class blocks or cautions as the lists say */
function clash(drugName: string, a: Pick<Allergy, 'substance_name' | 'class_code' | 'reactions_text' | 'severity'>): Warning | null {
  const cls = classOfDrug(drugName); const ac = classOfAllergy(a)
  if (norm(a.substance_name) === norm(drugName)) return { level: 'block', text: `Allergy: ${said(a)}. This is the same drug.` }
  if (ac && cls && ac === cls) return { level: 'block', text: `Allergy: ${said(a)}. ${drugName} is in the same class (${cls.replace(/_/g, ' ')}).` }
  const r = ac && cls ? CROSS.find((x) => x.allergy_class === ac && x.also.includes(cls) && x.also.length) : undefined
  return r ? { level: r.level === 'warn' ? 'block' : 'caution', text: `Allergy: ${said(a)}. ${drugName} (${cls!.replace(/_/g, ' ')}) may cross-react — ${r.note}` } : null
}
/** prescribing a drug to this patient: its allergies, the same drug already active or drafted, a drug the lists do not know */
export function drugWarnings(drugName: string, allergies: Allergy[], meds: Medication[], editingId?: string | null): Warning[] {
  const active = allergies.filter((x) => x.status === 'active'); const n = norm(drugName)
  const out = active.map((a) => clash(drugName, a)).filter((w): w is Warning => !!w)
  if (active.length && !known(drugName) && !active.some((a) => norm(a.substance_name) === n))
    out.push({ level: 'caution', text: `${drugName} is not in the drug list, so it was not checked against the allergies (${active.map((a) => a.substance_name).join(', ')}). Pick it from the suggestions if it is there.` })
  const same = meds.find((m) => m.status === 'active' && m.id !== editingId && (norm(m.drug_name) === n || (m.drug_code && findDrug(drugName) && m.drug_code === `atc:${findDrug(drugName)!.atc}`)))
  if (same && !same.started_on) out.push({ level: 'caution', text: `${same.drug_name} is already written in this visit — edit that one instead.` })
  else if (same) out.push({ level: 'caution', text: `Already taking ${same.drug_name} ${same.dose_number ?? ''}${same.dose_unit ? ` ${same.dose_unit}` : ''} ${same.frequency ?? ''} — repeat or change it instead of starting it again.` })
  return out
}
const MASS: Record<string, number> = { g: 1000, mg: 1, mcg: 0.001, ug: 0.001, microgram: 0.001, micrograms: 0.001 }
/** a dose far from the drug's usual strengths (10× over or under) blocks: most often mg typed for mcg */
export function doseWarnings(drugName: string, dose: number | null | undefined, unit: string | null | undefined): Warning[] {
  const d = findDrug(drugName); if (!d || dose == null || !unit || !d.strengths.length) return []
  const u = unit.toLowerCase(); const lo = Math.min(...d.strengths); const hi = Math.max(...d.strengths)
  const v = u === d.unit ? dose : MASS[u] && MASS[d.unit] ? dose * MASS[u] / MASS[d.unit] : null
  if (v === null || (v <= hi * 10 && v >= lo / 10)) return []
  const near = (x: number) => x >= lo / 2 && x <= hi * 2
  const hint = u !== d.unit && near(dose) ? ` Did you mean ${dose} ${d.unit}?` : d.unit === 'mg' && near(dose / 1000) ? ` Did you mean ${dose} mcg?` : ''
  return [{ level: 'block', text: `${dose} ${unit} is far from ${d.name}'s usual strengths (${d.strengths.join(' / ')} ${d.unit}).${hint}` }]
}
export const duplicateMedication = (drugName: string, meds: Medication[]) => { const n = norm(drugName); return meds.find((m) => m.status === 'active' && norm(m.drug_name) === n) }
/** recording an allergy: every medicine taken or written in this visit that it clashes with, by the same rules as prescribing */
export function allergyWarnings(substance: string, meds: Medication[], classCode?: string | null): Warning[] {
  const a = { substance_name: substance, class_code: classCode ?? findAllergen(substance)?.allergy_class ?? classOfDrug(substance), reactions_text: null, severity: null }
  return meds.filter((m) => m.status === 'active').flatMap((m) => { const w = clash(m.drug_name, a)
    return w ? [{ level: w.level, text: `${m.started_on ? 'Taking' : 'Written in this visit:'} ${m.drug_name} — ${w.text.replace(/^Allergy: [^.]*\.\s*/, '')} Stop or change it.` }] : [] })
}
export const duplicateProblem = (name: string, problems: Problem[]) => { const n = norm(name); const t = findProblem(name); return problems.find((p) => p.status === 'active' && (norm(p.name) === n || (t && p.code === `icd10:${t.icd10}`))) }
