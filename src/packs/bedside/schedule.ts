// The ward's dose times (spec/openCare.md §5.6, piece 3): the setting bedside.round as it stands for a ward (each timing's times, the
// minutes after its time a dose turns late, the night time for a once-a-day medicine prescribed "at night"), the timings in the round's
// words, and a local day and time in the clinic's zone. The server's twin is bedside.round_of, timing, half, cover and per_day in the
// migration: npm run test:drug-round holds the copies equal. Pure.
import type { Organization } from '@core/db/types'
import { settingIn } from '@core/screens/settings/form/model'
import { FREQUENCY } from '@core/screens/chart/model/labels'
import { shortDate } from '@core/ui/time'

export type Timing = 'OD' | 'BD' | 'q12h' | 'TDS' | 'q8h' | 'QDS' | 'q6h' | 'q4h'
export interface Round { times: { timing: Timing; at: string }[]; late_after: number; night: string }
/** the shape's defaults (the owner's picture): q4h is one a ward may add */
export const DEFAULT_ROUND: Round = {
  times: [{ timing: 'OD', at: '08:00' }, { timing: 'BD', at: '08:00 20:00' }, { timing: 'q12h', at: '08:00 20:00' }, { timing: 'TDS', at: '06:00 14:00 22:00' },
    { timing: 'q8h', at: '06:00 14:00 22:00' }, { timing: 'QDS', at: '06:00 12:00 18:00 00:00' }, { timing: 'q6h', at: '02:00 08:00 14:00 20:00' }],
  late_after: 60, night: '22:00',
}
/** the ward's round as it stands: its setting over the defaults */
export function roundOf(org: Organization | undefined, departmentId: string | null | undefined): Round {
  return { ...DEFAULT_ROUND, ...settingIn(org, 'bedside.round', departmentId) } as Round
}

const CODES: Record<string, string> = { OD: 'OD', QD: 'OD', BD: 'BD', BID: 'BD', TDS: 'TDS', TID: 'TDS', QDS: 'QDS', QID: 'QDS', Q4H: 'q4h', Q6H: 'q6h',
  Q8H: 'q8h', Q12H: 'q12h', STAT: 'stat', ONCE: 'once' }
/** a prescription's timing in the round's words: the composer's codes and HL7's alike; anything else as written; none, null */
export function timingOf(code: string | null | undefined): string | null {
  if (!code) return null
  return CODES[code.toUpperCase()] ?? code
}
/** half the time between two doses (hours): a dose recorded without its time counts for the nearest time within it */
export const HALF_HOURS: Record<string, number> = { OD: 12, BD: 6, q12h: 6, TDS: 4, q8h: 4, QDS: 3, q6h: 3, q4h: 2 }
export const halfHours = (timing: string | null | undefined) => HALF_HOURS[timing ?? ''] ?? 12
/** how long after a first dose its own ward times stand under it (minutes): three quarters of the interval, once a day half a day */
export const COVER_MIN: Record<string, number> = { OD: 720, BD: 540, q12h: 540, TDS: 360, q8h: 360, QDS: 270, q6h: 270, q4h: 180 }
/** doses a day of a timing: the ward's times it takes, and a course of n days is n times it */
export const PER_DAY: Record<string, number> = { OD: 1, BD: 2, q12h: 2, TDS: 3, q8h: 3, QDS: 4, q6h: 4, q4h: 6 }
/** a once-a-day medicine prescribed "at night" (the composer's words for nocte and hs): given at the ward's night time. No timing: not a
 *  night one (it is "times not set") */
export const isNight = (timing: string | null | undefined, instructions?: string | null) => timing === 'OD' && /^at night/i.test(instructions ?? '')
/** the ward's times for a timing ("08:00"…); a night medicine the night time; none set for it, null */
export function timesFor(r: Round, timing: string | null | undefined, instructions?: string | null): string[] | null {
  if (isNight(timing, instructions)) return [r.night]
  const t = r.times.find((x) => x.timing === timing)
  return t ? t.at.trim().split(/\s+/) : null
}

// ── a local day and time in the clinic's zone ──
const fmt = new Map<string, Intl.DateTimeFormat>()
const partsOf = (ms: number, zone: string) => {
  let f = fmt.get(zone)
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); fmt.set(zone, f) }
  return Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value])) as Record<string, string>
}
/** the zone's offset at an instant, in ms */
const offsetAt = (ms: number, zone: string) => {
  const p = partsOf(ms, zone)
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000
}
/** the clinic's day of an instant: 2026-03-10 */
export function localYmd(ms: number, zone: string): string { const p = partsOf(ms, zone); return `${p.year}-${p.month}-${p.day}` }
/** a day n days after another */
export function addDays(ymd: string, n: number): string { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }
/** a local day and time in the zone, as an instant (ms): two passes on the zone's offset, so a time in a spring-forward gap reads as
 *  Postgres reads it (at the offset before the gap) */
export function zoned(ymd: string, hm: string, zone: string): number {
  const [y, m, d] = ymd.split('-').map(Number); const [h, mi] = hm.split(':').map(Number)
  const local = Date.UTC(y, m - 1, d, h, mi)
  const first = local - offsetAt(local, zone)
  return local - offsetAt(first, zone)
}
/** every time the ward gives at (any timing, and the night time) */
export const wardTimes = (r: Round) => [...new Set([...r.times.flatMap((t) => t.at.trim().split(/\s+/)), r.night])].sort()
/** the next ward time after now, any timing or the night time */
export function nextTime(r: Round, now: number, zone: string): number | null {
  const today = localYmd(now, zone)
  const all = [0, 1].flatMap((k) => wardTimes(r).map((hm) => zoned(addDays(today, k), hm, zone))).filter((t) => t > now).sort((a, b) => a - b)
  return all[0] ?? null
}

/** a time's state at now, as the server reads it (bedside.stay_doses) */
export type SlotState = 'given' | 'not_given' | 'upcoming' | 'due' | 'late' | 'missed'

// ── the first dose (3b): what /rx says under its card on a ward ──
/** "14:00" in the zone */
export function localHm(ms: number, zone: string): string { const p = partsOf(ms, zone); return `${p.hour}:${p.minute}` }
/** R5 for one medicine signed at `signed`: a first dose (none as needed, at night or with no ward times; stat and once that dose
 *  alone); the ward times it stands for (from the late time before it to the greater of twice the late time and the cover after it);
 *  its next ward time after it (a night medicine: its first night time at or after it) */
export function firstCover(r: Round, timing: string | null, instructions: string | null | undefined, signed: number, zone: string): { first: boolean; stands: number[]; next: number | null } {
  if (timing === 'stat' || timing === 'once') return { first: true, stands: [], next: null }
  const day = localYmd(signed, zone)
  const around = (hms: string[]) => [-1, 0, 1, 2, 3].flatMap((k) => hms.map((hm) => zoned(addDays(day, k), hm, zone))).sort((a, b) => a - b)
  if (isNight(timing, instructions)) return { first: false, stands: [], next: around([r.night]).find((x) => x >= signed) ?? null }
  const hms = timesFor(r, timing, instructions); if (!hms) return { first: false, stands: [], next: null }
  const late = r.late_after * 60_000; const cover = Math.max(2 * late, (COVER_MIN[timing ?? ''] ?? 0) * 60_000)
  const all = around(hms); const stands = all.filter((x) => x > signed - late && x <= signed + cover)
  return { first: true, stands, next: all.find((x) => x > signed && !stands.includes(x)) ?? null }
}
/** a time's words from the day it is signed: "22:00", "08:00 tomorrow", "08:00 on 12 Mar" */
function whenWords(ms: number, from: number, zone: string): string {
  const d = localYmd(ms, zone); const today = localYmd(from, zone)
  return `${localHm(ms, zone)}${d === today ? '' : d === addDays(today, 1) ? ' tomorrow' : ` on ${shortDate(new Date(ms).toISOString())}`}`
}
/** the note under a /rx medication draft on a ward (only a start; null with no frequency yet): when its first dose will be due */
export function firstDoseWords(q: Record<string, unknown>, r: Round, now: number, zone: string): { text: string; tone?: 'warn' } | null {
  if (q.action !== 'start') return null
  if (q.prn) return { text: 'As needed: on the round\'s As needed list' }
  const timing = timingOf(typeof q.frequency === 'string' ? q.frequency : null); if (!timing) return null
  if (timing === 'stat' || timing === 'once') return { text: 'One dose, as soon as it is signed' }
  const instructions = typeof q.instructions_text === 'string' ? q.instructions_text : null
  const c = firstCover(r, timing, instructions, now, zone)
  if (isNight(timing, instructions)) return { text: `On this ward: at night, ${r.night} — the first dose ${c.next !== null && localYmd(c.next, zone) !== localYmd(now, zone) ? 'tomorrow night' : 'tonight'}, ${r.night}` }
  const hms = timesFor(r, timing, instructions)
  if (!hms) return { text: `This ward has no times for ${FREQUENCY[timing] ?? timing}: it waits under "Times not set · ask the doctor" until the ward sets them (Settings → Departments)`, tone: 'warn' }
  const days = new Set(c.stands.map((x) => localYmd(x, zone)))
  const stands = !c.stands.length ? '' : days.size === 1 ? ` (it stands for the ${c.stands.map((x) => localHm(x, zone)).join(' and ')} ${c.stands.length > 1 ? 'doses' : 'dose'}${whenWords(c.stands[0], now, zone).slice(5)})`
    : ` (it stands for the ${c.stands.map((x) => whenWords(x, now, zone)).join(' and ')} doses)`
  return { text: `On this ward: ${hms.join(' · ')} — the first dose as soon as it is signed${stands}${c.next !== null ? `, then ${whenWords(c.next, now, zone)}` : ''}` }
}
