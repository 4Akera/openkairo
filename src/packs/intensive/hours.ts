// The ICU chart's hours (spec/openCare.md §5.6): a column is a whole hour; the ICU day starts at the unit's hour (8 by default), and
// the fluid balance counts from it. The clinic's zone keeps whole-hour offsets, so a whole hour is the UTC instant with its minutes and
// seconds at 0; the day's start is found in the clinic's own clock, so it holds across summer time. Pure.
import { hm } from '@core/ui/time'

const HOUR = 3600_000
const pad = (n: number) => String(n).padStart(2, '0')
/** the whole hour an instant falls in */
export function hourOf(iso: string): string {
  const d = new Date(iso); d.setUTCMinutes(0, 0, 0); return d.toISOString()
}
/** the start of the ICU day an instant falls in: the last whole hour at or before it that reads `start`:00 on the clinic's clock */
export function dayStart(iso: string, start: number): string {
  let t = Date.parse(hourOf(iso)); const want = `${pad(start)}:00`
  for (let i = 0; i < 24; i++, t -= HOUR) if (hm(new Date(t).toISOString()) === want) return new Date(t).toISOString()
  return hourOf(iso)
}
/** each whole hour from one instant's to another's, both included (at most two weeks) */
export function hoursFrom(from: string, to: string): string[] {
  const out: string[] = []; const end = Date.parse(hourOf(to))
  for (let t = Date.parse(hourOf(from)); t <= end && out.length < 24 * 14; t += HOUR) out.push(new Date(t).toISOString())
  return out
}
/** a column's head: the hour on the clinic's clock, '08' */
export const hourLabel = (iso: string) => hm(iso).slice(0, 2)
export const plusHours = (iso: string, n: number) => new Date(Date.parse(iso) + n * HOUR).toISOString()
