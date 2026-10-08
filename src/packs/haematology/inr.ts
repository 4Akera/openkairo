// The INR clinic (spec/openCare.md §5.7, Q37, Q38; the picture #haem-inr), worked out, never typed: time in range (Rosendaal, over the
// last six months of INRs), the clinic's dosing table's suggestion for the new week (shown, never applied), the week spread over its days in
// half tablets (Saturday first, as the week runs in Egypt), the medicines on the list that change the INR, and her table in Arabic. Pure
// (npm run test:haematology).
import type { Medication } from '@core/db/types'

export const DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
export const DAYS_AR = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']
export interface Target { low: number; high: number }
export interface Row { from: number; to: number; change: number; next_days: number; says: string }
export interface Point { at: string; value: number }
const DAY = 86_400_000
const round1 = (n: number) => Math.round(n * 10) / 10

/** time in range by Rosendaal: each day between two INRs takes the value on the line between them; the share of days in the target band,
 *  over the window before `now` (182 days); null with fewer than two INRs in it */
export function timeInRange(points: Point[], t: Target, now: Date, days = 182): number | null {
  const from = now.getTime() - days * DAY; const ps = [...points].sort((a, b) => a.at.localeCompare(b.at))
  let inside = 0, all = 0
  for (let i = 1; i < ps.length; i++) {
    const a = ps[i - 1], b = ps[i]; const t0 = Date.parse(a.at), t1 = Date.parse(b.at); if (t1 <= from) continue
    const n = Math.round((t1 - t0) / DAY); if (n <= 0) continue
    for (let d = 0; d < n; d++) { const at = t0 + d * DAY; if (at < from) continue
      const v = a.value + (b.value - a.value) * d / n; all++; if (v >= t.low - 1e-9 && v <= t.high + 1e-9) inside++ }
  }
  return all ? Math.round(inside / all * 100) : null
}
/** the clinic's table row for an INR (its bands are for a target of 2–3; another target moves them by its distance from 2–3) */
export function rowFor(inr: number, table: Row[], t: Target = { low: 2, high: 3 }): Row | null {
  const shift = t.low - 2; return table.find((r) => inr >= r.from + (r.from > 0 ? shift : 0) && inr <= r.to + shift) ?? null
}
/** the week's total the row suggests, in half tablets */
export const suggest = (was: number, row: Row | null, tablet = 5) => row ? Math.max(0, Math.round(was * (1 + row.change / 100) / (tablet / 2)) * (tablet / 2)) : was
export const total = (days: number[]) => round1(days.reduce((s, d) => s + d, 0))
/** a week spread to a new total, a half tablet at a time: up on the day with the least (the first such), down on the day with the most
 *  (the last such), so the doses stay even */
export function spread(days: number[], to: number, tablet = 5): number[] {
  const out = [...days]; const step = tablet / 2; let diff = Math.round((to - total(days)) / step)
  for (; diff > 0; diff--) { const m = Math.min(...out); out[out.indexOf(m)] = round1(m + step) }
  for (; diff < 0; diff++) { const m = Math.max(...out); const i = out.lastIndexOf(m); out[i] = round1(Math.max(0, m - step)) }
  return out
}
/** what changed, in words: "Mon up to 5" */
export const changed = (was: number[], now: number[]) => DAYS.flatMap((d, i) => now[i] === was[i] ? [] : [`${d} ${now[i] > was[i] ? 'up' : 'down'} to ${now[i]}`]).join(' · ')
/** a day's dose in tablets, in Arabic: قرص, نصف قرص, قرص ونصف, قرصين */
export function tabletsAr(mg: number, tablet = 5): string {
  const n = mg / tablet
  return n === 0 ? 'لا شيء' : n === 0.5 ? 'نصف قرص' : n === 1 ? 'قرص' : n === 1.5 ? 'قرص ونصف' : n === 2 ? 'قرصين' : `${n} قرص`
}
/** "5 mg tablets: one a day, half on Thursday" */
export function tabletsEn(days: number[], tablet = 5): string {
  const words = (mg: number) => { const n = mg / tablet; return n === 0.5 ? 'half' : n === 1 ? 'one' : n === 1.5 ? 'one and a half' : n === 2 ? 'two' : n === 0 ? 'none' : `${n}` }
  const counts = new Map<number, number>(); days.forEach((d) => counts.set(d, (counts.get(d) ?? 0) + 1))
  const usual = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
  const others = DAYS.flatMap((d, i) => days[i] === usual ? [] : [`${words(days[i])} on ${({ Sat: 'Saturday', Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' } as const)[d]}`])
  return `${tablet} mg tablets: ${words(usual)} a day${others.length ? `, ${others.join(', ')}` : ''}`
}

/** the medicines on the list that change the INR (shown, never a stop): by ATC */
const RAISES: [string, string][] = [['J01FA', 'macrolide'], ['J01MA', 'quinolone'], ['J01XD01', 'metronidazole'], ['P01AB01', 'metronidazole'], ['J01EE01', 'co-trimoxazole'],
  ['J02AC01', 'fluconazole'], ['C01BD01', 'amiodarone'], ['M01A', 'NSAID: bleeding'], ['B01AC06', 'aspirin: bleeding']]
const LOWERS: [string, string][] = [['J04AB02', 'rifampicin'], ['N03AF01', 'carbamazepine'], ['N03AB02', 'phenytoin']]
export interface Interaction { med: Medication; effect: 'raises INR' | 'lowers INR'; why: string }
export function interactionsOf(meds: Medication[]): Interaction[] {
  const atc = (m: Medication) => m.drug_code?.startsWith('atc:') ? m.drug_code.slice(4) : ''
  return meds.flatMap((m) => { const r = RAISES.find(([a]) => atc(m).startsWith(a)); const l = LOWERS.find(([a]) => atc(m).startsWith(a))
    return r ? [{ med: m, effect: 'raises INR', why: r[1] } as Interaction] : l ? [{ med: m, effect: 'lowers INR', why: l[1] } as Interaction] : [] })
}
/** an INR against the target: low, in range, high */
export const sideOf = (inr: number, t: Target) => inr < t.low ? 'low' : inr > t.high ? 'high' : 'in range'
