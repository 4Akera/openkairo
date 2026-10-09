// ObGyn's clinic sums and words (spec/openCare.md §5.7, the pictures #anc-visit … #ob-queue): the weeks and days from the LMP (the
// EDD 280 days on), the fundus against the weeks, what the clinic's schedule says is due at these weeks and for whom, the next visit,
// G and P from the booking, the queue's one word, Hadlock's fetal weight and its centile, the liquor, what gynaecology says is due.
// Worked out, never typed; each a notice, never a stop. Pure.
import type { ServerEntry } from '@core/db/types'

export const DAY = 86_400_000
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const utc = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) }
const today = (now: Date) => Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())

/** weeks and days on a day: from the LMP, else from weeks said on a day */
export interface Gest { weeks: number; days: number }
export function gestOf(p: { lmp?: string | null; weeks?: number | null; at?: string | null }, now: Date): Gest | null {
  let n: number | null = null
  if (p.lmp) n = Math.floor((today(now) - utc(p.lmp)) / DAY)
  else if (p.weeks != null && p.at) n = p.weeks * 7 + Math.floor((today(now) - utc(p.at)) / DAY)
  if (n === null || n < 0) return null
  return { weeks: Math.floor(n / 7), days: n % 7 }
}
export const gestText = (g: Gest | null | undefined) => g ? `${g.weeks}+${g.days} w` : ''
/** the EDD: 280 days from the LMP, or from the weeks said on a day */
export function eddOf(p: { lmp?: string | null; weeks?: number | null; at?: string | null }): string | null {
  if (p.lmp) return ymd(new Date(utc(p.lmp) + 280 * DAY))
  if (p.weeks != null && p.at) return ymd(new Date(utc(p.at) + (280 - p.weeks * 7) * DAY))
  return null
}
export const dayMonth = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** the fundus in cm fits the weeks within the clinic's band, from its week (before it: not judged) */
export function fundusFits(sfh: number | null | undefined, g: Gest | null, band = 2, from = 24): { fits: boolean; words: string } | null {
  if (sfh == null || !g || g.weeks < from) return null
  const lo = g.weeks - band; const hi = g.weeks + band
  return sfh >= lo && sfh <= hi ? { fits: true, words: `fits ${g.weeks} w (±${band})` } : { fits: false, words: `${sfh < lo ? 'under' : 'over'} ${lo}–${hi}` }
}

// ── the clinic's schedule: what is due now, for whom ──
export type Whom = 'everyone' | 'rh_negative' | 'previous_caesarean' | 'age_35' | 'preeclampsia_risk' | 'diabetes'
export interface ScheduleRow { from: number; to: number; what: string; whom: Whom; word?: string }
export interface Booking { gravida?: number; para?: number; miscarriages?: number; before?: string; blood_group?: string; rh?: 'positive' | 'negative'; antibodies?: string; risks?: string[]; risk_note?: string }
export interface Her { age: number | null; booking: Booking | null; problems?: string[] }
/** for whom, worked out from the record: Rh from the blood group, a previous caesarean and other risks from the booking, the age */
export function forHer(whom: Whom, her: Her): boolean {
  const risks = her.booking?.risks ?? []
  switch (whom) {
    case 'everyone': return true
    case 'rh_negative': return her.booking?.rh === 'negative'
    case 'age_35': return (her.age ?? 0) >= 35
    case 'previous_caesarean': case 'preeclampsia_risk': case 'diabetes': return risks.includes(whom) || (whom === 'diabetes' && (her.problems ?? []).some((p) => /diabet/i.test(p)))
  }
}
const wordOf = (r: ScheduleRow) => r.word || r.what.split(' · ')[0]
/** the rows due at these weeks for her, not yet taken (what was taken is kept by its word on the antenatal checks): what is due for her
 *  in particular (Rh negative, a previous caesarean…) first, then the rest, each in the schedule's order */
export const dueNow = (rows: ScheduleRow[] | undefined, weeks: number | null, her: Her, taken: string[] = []) =>
  weeks === null ? [] : (rows ?? []).filter((r) => weeks >= r.from && weeks <= r.to && forHer(r.whom, her) && !taken.includes(wordOf(r)))
    .map((r, i) => ({ r, i })).sort((a, b) => Number(a.r.whom === 'everyone') - Number(b.r.whom === 'everyone') || a.i - b.i).map((x) => x.r)
export const dueWord = (r: ScheduleRow) => wordOf(r)

/** the next visit's weeks by the clinic's intervals (every 4 to 28, 2 to 36, then weekly) */
export function nextVisit(weeks: number, every: { until: number; weeks: number }[] | undefined): number {
  const step = [...(every ?? [])].sort((a, b) => a.until - b.until).find((e) => weeks < e.until)?.weeks ?? 1
  return weeks + step
}

/** the booking: the first antenatal check of the pregnancy that says it (the reader's own; a hidden one says nothing) */
export const bookingOf = (es: ServerEntry[] | undefined): Booking | null =>
  ((es ?? []).filter((e) => !e.hidden && e.type === 'obgyn.anc').sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
    .map((e) => (e.data as { obgyn?: { booking?: Booking } } | undefined)?.obgyn?.booking).find(Boolean)) ?? null
/** G and P as the clinic says them: G3 P1+1 (births, then miscarriages) */
export function gpOf(b: Booking | null | undefined): string | null {
  if (!b?.gravida) return null
  return `G${b.gravida} P${b.para ?? 0}${b.miscarriages ? `+${b.miscarriages}` : ''}`
}

// ── the queue's one word ──
export interface Mark { kind: 'pregnancy' | 'bp' | 'anc' | 'method'; at: string; data: Record<string, unknown> }
export interface Notices { bp_sys: number; bp_dia: number; protein: '+' | '++' | '+++' }
const PROTEIN = ['nil', 'trace', '+', '++', '+++']
const sameDay = (a: string, now: Date) => new Date(a).toDateString() === now.toDateString()
/** the word: a warning first (today's BP from the notice, urine protein), then what the schedule says is due, then the weeks; a
 *  pregnancy past 42 weeks never ended says the birth is not written; a woman not pregnant gets a word only when something is due */
export function markWord(marks: Mark[], now: Date, x: { schedule?: ScheduleRow[]; notices: Notices; age: number | null; methods?: MethodRule[] }): { word: string; tone?: 'warn' | 'info' } | null {
  const latest = (k: Mark['kind']) => marks.filter((m) => m.kind === k).sort((a, b) => b.at.localeCompare(a.at))[0]
  const bp = latest('bp'); const anc = latest('anc'); const preg = latest('pregnancy')
  if (bp && sameDay(bp.at, now) && (Number(bp.data.sys) >= x.notices.bp_sys || Number(bp.data.dia) >= x.notices.bp_dia)) return { word: `BP ${bp.data.sys}/${bp.data.dia}`, tone: 'warn' }
  if (anc && sameDay(anc.at, now) && PROTEIN.indexOf(String(anc.data.protein)) >= PROTEIN.indexOf(x.notices.protein)) return { word: `protein ${anc.data.protein}`, tone: 'warn' }
  const pregnant = preg && preg.data.status === 'current' && preg.data.pregnant
  if (pregnant) {
    const g = gestOf({ lmp: preg.data.lmp as string | undefined, weeks: preg.data.weeks as number | undefined, at: preg.at }, now)
    if (g && g.weeks >= 42) return { word: 'birth not written', tone: 'info' }
    const ancs = marks.filter((m) => m.kind === 'anc')
    const rh = ancs.map((m) => m.data.rh).find(Boolean) as Booking['rh'] | undefined
    const taken = ancs.flatMap((m) => (m.data.taken as string[] | undefined) ?? [])
    const due = dueNow(x.schedule, g?.weeks ?? null, { age: x.age, booking: rh ? { rh } : null }, taken).filter((r) => r.whom !== 'everyone' || !['booking bloods', 'dating scan'].includes(dueWord(r)) || ancs.length === 0)
    if (due.length) return { word: `${dueWord(due[0])} due`, tone: 'info' }
    return g ? { word: `${g.weeks} w` } : null
  }
  const m = latest('method'); const due = m ? methodDue(String(m.data.method ?? ''), m.at, x.methods, now) : null
  return due && due.past ? { word: `${due.short} change due`, tone: 'info' } : null
}

// ── gynaecology: when a method is due again ──
export interface MethodRule { method: string; every: number; unit: 'weeks' | 'months' | 'years' }
/** a method's due day from when it started and the clinic's interval (the longest rule its name starts with) */
export function methodDue(method: string, from: string, rules: MethodRule[] | undefined, now: Date): { on: string; past: boolean; short: string; months: number } | null {
  const r = [...(rules ?? [])].filter((x) => method.toLowerCase().startsWith(x.method.toLowerCase()) || x.method.toLowerCase().startsWith(method.toLowerCase()))
    .sort((a, b) => b.method.length - a.method.length)[0]
  if (!r) return null
  const d = new Date(utc(from))
  if (r.unit === 'weeks') d.setUTCDate(d.getUTCDate() + 7 * r.every); else d.setUTCMonth(d.getUTCMonth() + (r.unit === 'years' ? 12 * r.every : r.every))
  const months = Math.round((today(now) - d.getTime()) / (30.44 * DAY))
  return { on: ymd(d), past: d.getTime() < today(now), short: /iud/i.test(method) ? 'IUD' : method.split(/[ ,(]/)[0], months }
}

// ── the clinic's scan: Hadlock's fetal weight (1985, from BPD, HC, AC and FL) and its centile (Hadlock 1991: the mean by weeks, SD 12.7%) ──
export function efw(mm: { bpd?: number; hc?: number; ac?: number; fl?: number }): number | null {
  const { bpd, hc, ac, fl } = mm; if (!bpd || !hc || !ac || !fl) return null
  const [B, H, A, F] = [bpd / 10, hc / 10, ac / 10, fl / 10]
  return Math.round(10 ** (1.3596 - 0.00386 * A * F + 0.0064 * H + 0.00061 * B * A + 0.0424 * A + 0.174 * F))
}
const phi = (z: number) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989422804 * Math.exp(-z * z / 2)
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return z > 0 ? 1 - p : p }
export function efwCentile(grams: number, g: Gest): number {
  const ga = g.weeks + g.days / 7; const mean = Math.exp(0.578 + 0.332 * ga - 0.00354 * ga * ga)
  return Math.round(phi((grams - mean) / (0.127 * mean)) * 100)
}
export const hadlockMean = (ga: number) => Math.exp(0.578 + 0.332 * ga - 0.00354 * ga * ga)
/** the weeks a measure fits (Hadlock's 1984 single-parameter regressions, mm → weeks) */
export function fitsWeeks(k: 'bpd' | 'hc' | 'ac' | 'fl', mm: number): Gest | null {
  const c = mm / 10
  const w = k === 'bpd' ? 9.54 + 1.482 * c + 0.1676 * c * c : k === 'hc' ? 8.96 + 0.54 * c + 0.0003 * c ** 3 : k === 'ac' ? 8.14 + 0.753 * c + 0.0036 * c * c : 10.35 + 2.46 * c + 0.17 * c * c
  if (!Number.isFinite(w) || w < 10 || w > 44) return null
  const days = Math.round(w * 7); return { weeks: Math.floor(days / 7), days: days % 7 }
}
const ordinal = (n: number) => { const t = n % 100; return `${n}${t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}` }
export const centileWord = (c: number) => c < 1 ? 'below 1st' : c > 99 ? 'above 99th' : `${ordinal(c)}`
