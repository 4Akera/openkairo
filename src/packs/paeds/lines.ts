// Paediatrics' lines under the base's cards (spec/openCare.md §5.8, the pictures #paeds-growth and #paeds-dose; the core's C1): under
// /rx the dose per kg — the latest weight, the mg/kg a prescription comes to and the clinic's range (dose.ts) — and under /v the
// z-scores and centiles of the values being typed, for the age today and the sex, from the loaded WHO tables (the same tables and
// sums the server keeps with the record: lms.ts here, paeds.measure there; who.ts reads the tables once). Shown, never a stop;
// nothing stored. For a child only (under 19). Pure.
import type { CardLineCtx, Words } from '@core/screens/visit/lines'
import { doseLine, type DoseRule } from './dose'
import { centileText, zOff, zText, type Ind } from './growth'
import { lmsAt, zOf, type Lms } from './lms'

type Org = CardLineCtx['org']
/** a clinic-wide setting's value as the clinic saved it (the composer hands the clinic's settings) */
const clinicSetting = (org: Org, key: string) => (org?.settings ?? []).filter((s) => s.key === key).sort((a, b) => (b.recorded_at ?? '').localeCompare(a.recorded_at ?? ''))[0]?.data
const ageDays = (born: string | null | undefined, now: Date) => { if (!born) return null; const [y, m, d] = born.slice(0, 10).split('-').map(Number)
  return Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 86_400_000) }
const child = (ctx: CardLineCtx) => { const n = ageDays(ctx.record?.patient.born_on, ctx.now); return n !== null && n < 6940 ? n : null }

/** under /rx: the weight, the sum, the clinic's range and the ml for this weight; after the draft the mg/kg */
export function rxLine(q: Record<string, unknown>, ctx: CardLineCtx): { rows: Words[]; short?: Words | null } | null {
  if (child(ctx) === null) return null
  const w = [...(ctx.record?.values ?? [])].filter((v) => v.key === 'weight').sort((a, b) => b.at.localeCompare(a.at))[0]
  const rules = ((clinicSetting(ctx.org, 'paeds.doses') as { doses?: DoseRule[] } | undefined)?.doses) ?? []
  const l = doseLine(q, w ? { kg: Number(w.value), at: w.at } : null, rules, ctx.now, ctx.record?.patient.sex)
  if (!l) return null
  const second: Words = [...(l.tag ? [{ text: l.tag.word, tone: l.tag.tone }] : []), ...(l.more ? [l.more] : [])]
  return { rows: [l.tone === 'warn' && !l.tag ? [{ text: l.lead, tone: 'warn' }] : [l.lead], ...(second.length ? [second] : [])],
    short: l.short ? [{ text: l.short, ...(l.tone ? { tone: l.tone } : {}) }] : null }
}

const NAMES: Record<Ind, string> = { wfa: 'weight', lfa: 'length', hcfa: 'head', wfl: 'for length' }
/** under /v: each value's z-score and centile (beyond ±2 in amber), the tables and the age it was read for */
export function vLine(q: Record<string, unknown>, ctx: CardLineCtx, tables: Map<string, Lms> | null): { rows: Words[]; short?: Words | null } | null {
  const days = child(ctx); if (days === null) return null
  const sex = ctx.record?.patient.sex === 'male' ? 'm' : ctx.record?.patient.sex === 'female' ? 'f' : null
  const weight = q.weight != null ? Number(q.weight) : null; const length = q.length != null ? Number(q.length) : q.height != null && days < 731 ? Number(q.height) : null
  const head = q.head != null ? Number(q.head) : null
  if (weight === null && length === null && head === null) return null
  if (!sex) return { rows: ['The sex is not recorded: the WHO tables are read by sex'] }
  if (!tables) return null
  const months = days / 30.4375; const said: (string | { text: string; tone?: 'warn' })[] = []; const outside: string[] = []; let shortWord: string | null = null
  let wasting: number | null = null
  const one = (k: Ind, v: number | null, x: number | null) => {
    if (v === null || x === null) return
    const lms = lmsAt(tables, k, sex, x); if (!lms) { outside.push(NAMES[k]); return }
    const z = zOf(v, lms); const text = `${NAMES[k]} z ${zText(z, 2)} (${centileText(Math.round(phi(z) * 1000) / 10)})`
    said.push(zOff(z) ? { text, tone: 'warn' } : text); if (k === 'wfa' || (!shortWord && zOff(z))) shortWord = `${NAMES[k]} z ${zText(z, 2)}`
    if (k === 'wfl') wasting = z
  }
  one('wfa', weight, months); one('lfa', length, months); one('hcfa', head, months); one('wfl', weight, length !== null && days < 731 ? length : null)
  const age = days < 731 ? `${Math.floor(months)} months` : `${Math.floor(months / 12)} years`
  const rows: Words[] = []
  if (said.length) rows.push(said)
  rows.push(`WHO 2006, ${sex === 'm' ? 'boys' : 'girls'}, ${age} · from the loaded tables, as the record keeps them${outside.length ? ` · beyond the loaded tables: ${outside.join(', ')}` : ''}`)
  // the WHO's words for weight-for-length: below −3 severe, below −2 moderate wasting; above +2 a risk of overweight, +3 obese (shown, never a stop)
  const w = wasting as number | null
  if (w !== null && (w < -2 || w > 2)) rows.push([{ text: w < -3 ? 'Weight-for-length below −3: severe wasting (WHO).' : w < -2 ? 'Weight-for-length below −2: moderate wasting (WHO).'
    : w > 3 ? 'Weight-for-length above +3: obesity (WHO).' : 'Weight-for-length above +2: overweight (WHO).', tone: 'warn' }])
  return { rows, short: shortWord }
}
const phi = (z: number) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989422804 * Math.exp(-z * z / 2)
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return z > 0 ? 1 - p : p }
