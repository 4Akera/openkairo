// The triage card's suggestion (spec/openCare.md §5.6): a level from the vitals and the danger signs, a suggestion only — the nurse
// decides. One table of thresholds, the same on either scale, named on the card "(ATS/NEWS2 thresholds)"; it is not the Manchester
// Triage System's flowcharts and discriminators, which are not used. Sources:
// - level 1: ACEM's category-1 descriptors for the Australasian scale (RR under 10, systolic under 80, responds to pain or not at all);
// - level 2: NEWS2's single red parameter (RCP 2017: a 3 in one sign asks an urgent response): RR ≥ 25, SpO₂ ≤ 91, systolic ≤ 90,
//   pulse ≤ 40 or ≥ 131, temperature ≤ 35.0, new confusion or voice;
// - level 3: NEWS2's 2-point bands (RR 21–24, systolic 91–100, pulse 111–130, temperature ≥ 39.1, on oxygen);
// - systolic ≥ 220 and SpO₂ 92–95 follow ACEM's category-3 descriptors (severe hypertension; SaO₂ 90–95 %), not NEWS2.
// The suggestion is the most urgent level any sign gives; it only ever asks for more urgency (a less urgent level asks why, never a
// stop), and none is made under 16. Pure: npm run test:casualty.
import type { Level } from './scale'

export type Sign = 'rr' | 'spo2' | 'sbp' | 'pulse' | 'temp' | 'acvpu' | 'oxygen'
export type Danger = 'airway' | 'breathing' | 'fitting' | 'bleeding' | 'chest_cardiac' | 'stroke' | 'severe_pain' | 'violent'
/** the danger signs in chip order, each with the level it suggests at least */
export const DANGER: { key: Danger; label: string; level: Level }[] = [
  { key: 'airway', label: 'Airway at risk', level: 1 }, { key: 'breathing', label: 'Not breathing well', level: 1 }, { key: 'fitting', label: 'Fitting now', level: 1 },
  { key: 'bleeding', label: 'Bleeding that will not stop', level: 1 }, { key: 'chest_cardiac', label: 'Chest pain like the heart', level: 2 },
  { key: 'stroke', label: 'New weakness or speech loss', level: 2 }, { key: 'severe_pain', label: 'Severe pain', level: 2 }, { key: 'violent', label: 'Violent or a danger to others', level: 2 },
]
export interface Suggestion { level: Level; signs: (Sign | Danger)[] }
/** the words the card names the suggestion's basis with */
export const BASIS = '(ATS/NEWS2 thresholds)'

const num = (x: unknown): number | null => typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() && Number.isFinite(Number(x)) ? Number(x) : null
/** each sign's level from the /v params (systolic, pulse, respiratory_rate, spo2, temperature, consciousness, oxygen), each sign once
 *  at its most urgent level, in Sign order; a sign that gives no level is left out */
export function signLevels(v: Record<string, unknown> | null | undefined): { sign: Sign; level: Level }[] {
  if (!v) return []
  const out: { sign: Sign; level: Level }[] = []
  const add = (sign: Sign, level: Level | null) => { if (level) out.push({ sign, level }) }
  const rr = num(v.respiratory_rate); const spo2 = num(v.spo2); const sbp = num(v.systolic); const p = num(v.pulse); const t = num(v.temperature)
  add('rr', rr === null ? null : rr < 10 ? 1 : rr >= 25 ? 2 : rr >= 21 ? 3 : null)
  add('spo2', spo2 === null ? null : spo2 <= 91 ? 2 : spo2 <= 95 ? 3 : null)
  add('sbp', sbp === null ? null : sbp < 80 ? 1 : sbp <= 90 ? 2 : sbp <= 100 || sbp >= 220 ? 3 : null)
  add('pulse', p === null ? null : p <= 40 || p >= 131 ? 2 : p >= 111 ? 3 : null)
  add('temp', t === null ? null : t <= 35 ? 2 : t >= 39.1 ? 3 : null)
  const c = v.consciousness
  add('acvpu', c === 'p' || c === 'u' ? 1 : c === 'c' || c === 'v' ? 2 : null)
  add('oxygen', v.oxygen === 'oxygen' ? 3 : null)
  return out
}

/** the suggestion: the most urgent level of the vitals and the danger signs, and the signs that give it (the vitals first, then the
 *  danger signs in chip order); none under 16 (an age not known suggests), none with no sign */
export function suggest(v: Record<string, unknown> | null | undefined, danger: readonly Danger[], age: number | null): Suggestion | null {
  if (age !== null && age < 16) return null
  const vit = signLevels(v); const dg = DANGER.filter((d) => danger.includes(d.key))
  const levels = [...vit.map((x) => x.level), ...dg.map((d) => d.level)]
  if (!levels.length) return null
  const level = Math.min(...levels) as Level
  return { level, signs: [...vit.filter((x) => x.level === level).map((x) => x.sign), ...dg.filter((d) => d.level === level).map((d) => d.key)] }
}

/** a sign in words: 'RR 28', 'SpO₂ 92', 'BP 96/60', 'P 124', 'T 34.8', 'ACVPU V', 'on oxygen'; a danger sign its label */
export function signWords(s: Sign | Danger, v: Record<string, unknown> | null | undefined): string {
  const q = v ?? {}
  switch (s) {
    case 'rr': return `RR ${q.respiratory_rate}`
    case 'spo2': return `SpO₂ ${q.spo2}`
    case 'sbp': return `BP ${q.systolic}/${q.diastolic ?? '?'}`
    case 'pulse': return `P ${q.pulse}`
    case 'temp': return `T ${q.temperature}`
    case 'acvpu': return `ACVPU ${String(q.consciousness ?? '').toUpperCase()}`
    case 'oxygen': return 'on oxygen'
    default: return DANGER.find((d) => d.key === s)?.label ?? s
  }
}
/** the suggestion shows while no level is chosen, then only when it is more urgent than the level chosen */
export const shows = (s: Suggestion | null | undefined, chosen: Level | null) => !!s && (chosen === null || chosen > s.level)
/** a level less urgent than the suggestion asks why */
export const needsWhy = (s: Suggestion | null | undefined, chosen: Level | null) => !!s && chosen !== null && chosen > s.level
