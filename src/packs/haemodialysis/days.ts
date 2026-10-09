// Dialysis's days (spec/openCare.md §5.6): a standing slot comes Sat · Mon · Wed or Sun · Tue · Thu, and the unit's week is Saturday …
// Thursday (a Friday belongs to neither pattern; a session can still be moved to one). A clinic day is a 'YYYY-MM-DD' string, read as a
// calendar day (at noon UTC, so no time zone moves it). Pure: npm run test:haemodialysis.
import { ymd } from '@core/ui/time'

export type Days = 'sat_mon_wed' | 'sun_tue_thu'
export const DAYS: [Days, string][] = [['sat_mon_wed', 'Sat · Mon · Wed'], ['sun_tue_thu', 'Sun · Tue · Thu']]
const PATTERN: Record<Days, number[]> = { sat_mon_wed: [6, 1, 3], sun_tue_thu: [0, 2, 4] }
const WORD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const noon = (on: string) => new Date(`${on}T12:00:00Z`)

/** the day of the week, 0 Sunday … 6 Saturday */
export const dowOf = (on: string) => noon(on).getUTCDay()
/** is the day one of the pattern's */
export const onDay = (days: Days, on: string) => (PATTERN[days] ?? []).includes(dowOf(on))
/** the pattern a day belongs to (a Friday: none) */
export const daysOf = (on: string): Days | null => DAYS.find(([d]) => onDay(d, on))?.[0] ?? null
export function addDays(on: string, n: number): string {
  const d = noon(on); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
/** the Saturday the day's week starts on (a Friday's is the Saturday before it) */
export const weekOf = (on: string) => addDays(on, -((dowOf(on) + 1) % 7))
/** the week's six days, Saturday … Thursday */
export const weekDays = (sat: string) => [0, 1, 2, 3, 4, 5].map((n) => addDays(sat, n))
/** 'Sat' */
export const dayWord = (on: string) => WORD[dowOf(on)] ?? '?'
/** 'Sat 10' */
export const dayDate = (on: string) => `${dayWord(on)} ${Number(on.slice(8, 10))}`
/** whole days from a to b */
export const daysBetween = (a: string, b: string) => Math.round((noon(b).getTime() - noon(a).getTime()) / 86_400_000)
/** today in the clinic's zone (once setClinicTimeZone ran) */
export const todayIn = () => ymd(new Date().toISOString())
