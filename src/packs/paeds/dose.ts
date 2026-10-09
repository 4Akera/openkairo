// The dose per kg (spec/openCare.md §5.8, the picture #paeds-dose): what a prescription comes to in mg/kg, worked out from the child's
// latest weight and the clinic's own dose list (the setting paeds.doses), and whether it sits in the clinic's range. Shown,
// never a stop; nothing is stored. With no weight in the last 30 days it says the last one and its date and asks for a weight; it never
// guesses a weight from the age. Pure.

export interface DoseRule { drug: string; route?: string; per: 'day' | 'dose'; from: number; to: number; times_from?: number; times_to?: number; most?: number }
export interface Weighed { kg: number; at: string }
type Q = Record<string, unknown>
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** the clinic's rule for a drug and route: the longest drug name the prescription's starts with ("Amoxicillin + clavulanic acid" before
 *  "Amoxicillin"), its route the prescription's (oral when not said) */
export function ruleFor(rules: DoseRule[] | undefined, drug: string, route?: string | null): DoseRule | null {
  const name = norm(drug); const r = route || 'oral'
  return (rules ?? []).filter((x) => (x.route ?? 'oral') === r && (name === norm(x.drug) || name.startsWith(`${norm(x.drug)} `)))
    .sort((a, b) => b.drug.length - a.drug.length)[0] ?? null
}
/** a syrup's strength from its name or the line: "250 mg/5 ml", "250/5", "120mg/5ml" → mg in one ml */
export function mgPerMl(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:mg)?\s*\/\s*(\d+(?:\.\d+)?)\s*(?:ml)?\b/i)
  if (!m) return null
  const mg = Number(m[1]); const ml = Number(m[2]); return mg > 0 && ml > 0 ? mg / ml : null
}
/** one dose in mg: mg, g and mcg as they are; ml by the syrup's strength (named in the drug or on the line) */
export function doseMg(q: Q, typed = ''): { mg: number; perMl: number | null } | null {
  const n = Number(q.dose_number); const unit = String(q.dose_unit ?? '').toLowerCase()
  if (!Number.isFinite(n) || n <= 0) return null
  const perMl = mgPerMl(`${(q.drug as { name?: string } | undefined)?.name ?? ''} ${typed}`)
  if (unit === 'mg') return { mg: n, perMl }
  if (unit === 'g') return { mg: n * 1000, perMl }
  if (unit === 'mcg' || unit === 'ug') return { mg: n / 1000, perMl }
  if (unit === 'ml' && perMl) return { mg: n * perMl, perMl }
  return null
}
/** doses a day by the frequency's code */
export const TIMES: Record<string, number> = { OD: 1, BD: 2, TDS: 3, QDS: 4, q4h: 6, q6h: 4, q8h: 3, q12h: 2, once: 1, stat: 1 }
const WORD: Record<number, string> = { 1: 'once a day', 2: 'twice a day', 3: 'three times a day', 4: 'four times a day', 6: 'six times a day' }
const r1 = (n: number) => Math.round(n * 10) / 10
const rNice = (n: number) => n >= 100 ? Math.round(n) : n >= 10 ? Math.round(n) : r1(n)
const mgText = (mg: number) => mg >= 1000 && mg % 1000 === 0 ? `${mg / 1000} g` : `${rNice(mg)} mg`
const pronoun = (sex: string | null | undefined) => sex === 'female' ? 'her' : sex === 'male' ? 'him' : 'the child'
const dayMonth = (at: string) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const timeOf = (at: string) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

export type Tone = 'ok' | 'warn'
/** the line under the /rx card and on its draft: the weight, the sum, the clinic's range and what it is in ml for this weight */
export interface DoseLine { lead: string; tag: { word: string; tone: Tone } | null; more: string | null; short: string | null; tone: Tone | null }
export function doseLine(q: Q, weight: Weighed | null, rules: DoseRule[] | undefined, now: Date, sex?: string | null, typed = ''): DoseLine | null {
  const drug = String((q.drug as { name?: string } | undefined)?.name ?? '').trim()
  if (!drug || q.action === 'stop') return null
  const fresh = weight && (now.getTime() - new Date(weight.at).getTime()) <= 30 * 86_400_000
  if (!weight) return { lead: `No weight on record: weigh ${pronoun(sex)} first`, tag: null, more: null, short: 'no weight', tone: 'warn' }
  if (!fresh) return { lead: `No weight in the last 30 days: the last ${weight.kg.toFixed(1)} kg on ${dayMonth(weight.at)} — weigh ${pronoun(sex)}`, tag: null, more: null, short: 'weigh first', tone: 'warn' }
  const sameDay = new Date(weight.at).toDateString() === now.toDateString()
  const kg = weight.kg; const when = sameDay ? `today ${timeOf(weight.at)}` : dayMonth(weight.at)
  const dose = doseMg(q, typed); const rule = ruleFor(rules, drug, q.route as string | null)
  if (!dose) return { lead: `${kg.toFixed(1)} kg ${when}`, tag: null, more: rule ? usual(rule, kg, null) : null, short: null, tone: null }
  const times = q.prn && (!q.frequency || q.frequency === 'PRN') ? null : TIMES[String(q.frequency ?? '')] ?? null
  const perDose = dose.mg / kg
  if (rule?.per === 'dose' || !times) {
    const inRange = rule ? perDose >= rule.from - 1e-9 && perDose <= rule.to + 1e-9 && (!rule.most || dose.mg <= rule.most) : null
    const sum = `${mgText(dose.mg)} a dose = ${r1(perDose)} mg/kg a dose`
    return { lead: `${kg.toFixed(1)} kg ${when} · ${sum}`, tag: inRange === null ? null : { word: inRange ? 'in the clinic\'s range' : 'outside the clinic\'s range', tone: inRange ? 'ok' : 'warn' },
      more: rule ? usual(rule, kg, dose.perMl) : 'not on the clinic\'s dose list', short: `${r1(perDose)} mg/kg a dose${rule && !inRange ? ` · the clinic's usual ${rule.from}–${rule.to}${dose.perMl ? ` (${ml(rule.from * kg / dose.perMl)}–${ml(Math.min(rule.to * kg, rule.most ?? Infinity) / dose.perMl)} ml)` : ''}` : ''}`,
      tone: inRange === null ? null : inRange ? 'ok' : 'warn' }
  }
  const perDay = dose.mg * times / kg
  const inRange = rule ? perDay >= rule.from - 1e-9 && perDay <= rule.to + 1e-9 && (!rule.most || dose.mg <= rule.most) : null
  return { lead: `${kg.toFixed(1)} kg ${when} · ${mgText(dose.mg)} × ${times} = ${mgText(dose.mg * times)} a day = ${Math.round(perDay)} mg/kg/day`,
    tag: inRange === null ? null : { word: inRange ? 'in the clinic\'s range' : 'outside the clinic\'s range', tone: inRange ? 'ok' : 'warn' },
    more: rule ? usual(rule, kg, dose.perMl, times) : 'not on the clinic\'s dose list', short: `${Math.round(perDay)} mg/kg/day`, tone: inRange === null ? null : inRange ? 'ok' : 'warn' }
}
const ml = (n: number) => r1(n).toFixed(1)
/** the clinic's range in words, and what it comes to for this weight (in ml for a syrup) */
function usual(rule: DoseRule, kg: number, perMl: number | null, times?: number): string {
  const doses = rule.times_from ? `${rule.times_from}${rule.times_to && rule.times_to !== rule.times_from ? `–${rule.times_to}` : ''} doses` : null
  const head = `usual ${rule.from}${rule.to !== rule.from ? `–${rule.to}` : ''} mg/kg ${rule.per === 'day' ? 'a day' : 'a dose'}${rule.per === 'day' && doses ? ` in ${doses}` : ''}${rule.most ? ` · most ${mgText(rule.most)} a dose` : ''}`
  const n = rule.per === 'day' ? times ?? rule.times_to ?? rule.times_from ?? null : null
  const lo = rule.per === 'day' ? (n ? rule.from * kg / n : null) : rule.from * kg
  const hi = rule.per === 'day' ? (n ? Math.min(rule.to * kg / n, rule.most ?? Infinity) : null) : Math.min(rule.to * kg, rule.most ?? Infinity)
  if (lo === null || hi === null) return head
  const amount = perMl ? `${ml(lo / perMl)}–${ml(hi / perMl)} ml` : `${rNice(lo)}–${rNice(hi)} mg`
  return `${head} · for ${kg.toFixed(1)} kg that is ${amount}${rule.per === 'day' && n ? ` ${WORD[n] ?? `${n} times a day`}` : ' a dose'}`
}
