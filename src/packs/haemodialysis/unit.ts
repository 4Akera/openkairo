// The Dialysis unit's setting (spec/openCare.md §5.6, haemodialysis.unit on the department's card): its shifts' start times, a session's
// hours, and the chairs kept for HBV and HCV, named as on the board (a place has no key; a name that matches no chair is passed over;
// case and spaces aside). A patient with an HBV or HCV isolation alert in another chair, or anyone else in a kept one, is shown, never
// stopped. Pure: npm run test:haemodialysis.
import type { Organization, Place } from '@core/db/types'
import { settingIn } from '@core/screens/settings/form/model'

export interface Unit { shifts: string[]; hours: number; hbv: string[]; hcv: string[] }
export type Kept = 'hbv' | 'hcv' | null
const SHIFTS = ['07:00', '11:30', '16:00']
/** a chair's name for matching: case and spaces aside */
const fold = (name: string) => name.toLowerCase().replace(/\s+/g, '')

type Org = Pick<Organization, 'settings' | 'settingKeys' | 'datatypes'> | undefined
/** the unit's setting, its defaults where it says nothing */
export function unitOf(org: Org, departmentId: string): Unit {
  const s = settingIn(org, 'haemodialysis.unit', departmentId)
  const shifts = (s.shifts ?? []).filter((x) => typeof x === 'string' && x)
  const hours = typeof s.hours === 'number' && s.hours > 0 ? s.hours : 4
  const names = (xs: unknown) => Array.isArray(xs) ? xs.filter((x): x is string => typeof x === 'string').map(fold).filter(Boolean) : []
  return { shifts: shifts.length ? shifts : SHIFTS, hours, hbv: names(s.hbv_chairs), hcv: names(s.hcv_chairs) }
}
/** what a chair is kept for, by its name */
export function keptFor(place: Pick<Place, 'name'> | null | undefined, u: Pick<Unit, 'hbv' | 'hcv'>): Kept {
  if (!place?.name) return null
  const n = fold(place.name)
  return u.hbv.includes(n) ? 'hbv' : u.hcv.includes(n) ? 'hcv' : null
}
/** the unit's chairs, by position (closed ones too: the board shows them closed) */
export const chairsOf = (org: Pick<Organization, 'places'> | undefined, departmentId: string): Place[] =>
  (org?.places ?? []).filter((p) => p.department_id === departmentId).sort((a, b) => a.position - b.position)
/** the patient's isolation against the chair's kept-for, in words (shown, never a stop); a patient with both HBV and HCV belongs in the
 *  HBV chair (HBV is the one that needs its own chair), so the HBV chair fits them */
export function chairWarning(isolation: readonly string[], kept: Kept, chair: string): string | null {
  const hbv = isolation.includes('hbv')
  if (hbv && kept !== 'hbv') return `HBV: ${chair} is not kept for HBV`
  if (isolation.includes('hcv') && kept !== 'hcv' && !(hbv && kept === 'hbv')) return `HCV: ${chair} is not kept for HCV`
  if (kept && !isolation.includes(kept)) return `${chair} is kept for ${kept.toUpperCase()}`
  return null
}
/** 'Shift 2 · 11:30' */
export const shiftWords = (u: Pick<Unit, 'shifts'>, n: number) => `Shift ${n} · ${u.shifts[n - 1] ?? '?'}`
/** the shift on at this clock time ('HH:MM'): 0 before the first */
export const shiftNow = (u: Pick<Unit, 'shifts'>, hhmm: string) => u.shifts.reduce((on, s, i) => s <= hhmm ? i + 1 : on, 0)
