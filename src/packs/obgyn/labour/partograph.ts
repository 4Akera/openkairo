// The WHO's modified partograph as numbers (spec/openCare.md §5.6; Q9, as drawn, awaiting the owner): active labour starts at the first
// exam whose cervix is at least the department's setting (4 cm, or 5), the alert line runs from there at 1 cm an hour to 10 cm, the
// action line 4 hours to its right. The latest point left of a line is "past" it (strictly: a point on the line is not), and at 10 cm
// past nothing. Before active labour: latent. Past a line, and a baby's heart under 110 or over 160, are notices, never a stop. The
// weeks and days of the pregnancy, from the LMP or from the weeks said then. Pure: npm run test:labour.
import type { Organization } from '@core/db/types'
import { settingIn } from '@core/screens/settings/form/model'
import { ymd } from '@core/ui/time'
import { FHR_HIGH, FHR_LOW } from './codes'

const HOUR = 3_600_000
const DAY = 86_400_000

/** the cervix from which the partograph starts here (obgyn.partograph; 4 by default) */
export function activeFrom(org: Pick<Organization, 'settings' | 'settingKeys' | 'datatypes'> | undefined, deptId: string): 4 | 5 {
  return settingIn(org, 'obgyn.partograph', deptId).active_from === 5 ? 5 : 4
}

export interface Point { at: string; cervix: number; descent?: number }
export interface Partograph {
  /** where active labour began: the first point at the setting's cervix or more */
  start: { at: string; cervix: number } | null
  /** every point, by time (those before the start are not drawn) */
  points: Point[]
  latest: Point | null
  /** whole hours from the start to now */
  hours: number | null
  past: 'alert' | 'action' | null
  /** when the action line reaches the latest cervix */
  actionAt: string | null
}

/** the alert line's cervix h hours after the start (to 10 cm); null before the start. The action line's is lineAt(start, h − 4) */
export const lineAt = (start: { cervix: number }, h: number): number | null => h < 0 ? null : Math.min(10, start.cervix + h)

export function partographOf(points: Point[], af: number, now: number): Partograph {
  const sorted = [...points].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const latest = sorted[sorted.length - 1] ?? null
  const first = sorted.find((p) => p.cervix >= af)
  if (!first || !latest) return { start: null, points: sorted, latest, hours: null, past: null, actionAt: null }
  const t0 = Date.parse(first.at); const c0 = first.cervix
  const h = (Date.parse(latest.at) - t0) / HOUR; const c = latest.cervix
  const past = c >= 10 ? null : c < c0 + h - 4 ? 'action' : c < Math.min(10, c0 + h) ? 'alert' : null
  return { start: { at: first.at, cervix: c0 }, points: sorted, latest, hours: Math.max(0, Math.floor((now - t0) / HOUR)), past,
    actionAt: new Date(t0 + (4 + Math.min(10, c) - c0) * HOUR).toISOString() }
}

/** a baby's heart rate to tell the doctor about now: under 110 or over 160 a minute */
export const fhrOff = (v: number) => v < FHR_LOW || v > FHR_HIGH

const utc = (d: string) => { const [y, m, x] = d.slice(0, 10).split('-').map(Number); return Date.UTC(y, (m || 1) - 1, x || 1) }
const daysBetween = (from: string, to: string) => Math.floor((utc(to) - utc(from)) / DAY)
export interface Gestation { weeks: number; days: number }
/** the weeks and days today (YYYY-MM-DD): from the LMP when it is a whole date (a month or a year alone is no day to count from);
 *  else the weeks said, plus the days since the day they were said */
export function gestation(p: { lmp?: string; weeks?: number; at: string } | undefined, today: string): Gestation | null {
  if (!p) return null
  const total = p.lmp && /^\d{4}-\d{2}-\d{2}$/.test(p.lmp) ? daysBetween(p.lmp, today) : typeof p.weeks === 'number' ? p.weeks * 7 + Math.max(0, daysBetween(ymd(p.at), today)) : null
  return total == null || total < 0 ? null : { weeks: Math.floor(total / 7), days: total % 7 }
}
export const gestationWords = (g: Gestation) => `${g.weeks}+${g.days} w`
