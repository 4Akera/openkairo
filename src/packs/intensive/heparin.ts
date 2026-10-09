// Heparin by aPTT (spec/openCare.md §5.6, piece I3): the unit's table (intensive.heparin, a department's setting) suggests the next rate
// from the latest aPTT written after the heparin's latest change; the nurse signs it like any titration, and nothing is stopped. The
// advice is the client's, from the chart's reads (no op). Pure: npm run test:intensive.
import type { Organization } from '@core/db/types'
import type { IntensiveHeparinSetting } from '@core/db/shapes.generated'
import { settingIn } from '@core/screens/settings/form/model'
import { hm, ymd } from '@core/ui/time'
import { hourOf } from './hours'
import type { UnitInfusion } from './unit'

/** the unit's target and its table: whole seconds that touch, open only at the two ends; a change in units/h, a stop first in minutes,
 *  the next aPTT in hours */
export type HeparinTable = IntensiveHeparinSetting
/** the department's table, or null when it has none */
export function heparinOf(org: Organization | undefined, deptId: string): HeparinTable | null {
  const s = settingIn(org, 'intensive.heparin', deptId)
  return typeof s.low === 'number' && typeof s.high === 'number' && Array.isArray(s.steps) && s.steps.length ? { low: s.low, high: s.high, steps: s.steps } : null
}
/** the heparin infusion: a unit row of kind anticoagulant dosed in units/h */
export const isHeparin = (row: UnitInfusion | null | undefined) => row?.kind === 'anticoagulant' && row.dose_unit === 'units/h'
/** a whole number with its thousands apart: 1 100 */
export const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

export interface HeparinAdvice { text: string; dose: number; change: number; hold: number | null; next: string }
/** when the heparin's latest change counts from: its time; or the end of its hour when it was charted in an hour's column (a whole
 *  hour) and signed after an aPTT taken in that hour, so that aPTT counts as acted on. One signed before the aPTT acted on nothing */
export function heparinSince(hep: { latestAt: string; recordedAt: string }, aptt: { at: string } | null): string {
  const at = Date.parse(hep.latestAt); const a = aptt ? Date.parse(aptt.at) : NaN
  const whole = Date.parse(hourOf(hep.latestAt)) === at
  return whole && a >= at && a < at + 3600_000 && Date.parse(hep.recordedAt) > a ? new Date(at + 3600_000).toISOString() : hep.latestAt
}
/** the advice belongs to a column that holds or follows the aPTT: the change it suggests is never charted before it */
export const adviceFits = (column: string, aptt: { at: string } | null) => !!aptt && Date.parse(column) + 3600_000 > Date.parse(aptt.at)

/** the table's suggestion for the latest aPTT, or null: no aPTT, no heparin running, or an aPTT already acted on (not after the
 *  heparin's latest change). Step i holds v when v ≥ its min and v < the next step's min, so a decimal between two whole-second steps
 *  (49.5) falls in the lower one, never in none; the first step holds everything below it and the last everything above */
export function heparinAdvice(aptt: { value: number; at: string } | null, heparin: { dose: number; since: string } | null, t: HeparinTable): HeparinAdvice | null {
  if (!aptt || !heparin || !Number.isFinite(aptt.value) || !Number.isFinite(heparin.dose) || Date.parse(aptt.at) <= Date.parse(heparin.since)) return null
  const v = aptt.value
  const step = t.steps.find((s, i) => v >= (i === 0 ? -Infinity : s.min ?? -Infinity) && v < (t.steps[i + 1]?.min ?? Infinity)); if (!step) return null
  const dose = Math.max(0, heparin.dose + step.change); const change = dose - heparin.dose; const hold = step.hold ?? null
  const next = new Date(Date.parse(aptt.at) + step.next * 3600_000).toISOString(); const day = ymd(next) !== ymd(aptt.at) ? ' tomorrow' : ''
  const what = change > 0 ? `raise by ${grouped(change)} units/h to ${grouped(dose)}` : change < 0 ? `lower by ${grouped(-change)} units/h to ${grouped(dose)}` : 'no change'
  return { text: `aPTT ${v} s at ${hm(aptt.at)} (target ${t.low}–${t.high} s) → ${what}${hold ? `; stop for ${hold} min first` : ''} · next aPTT ${hm(next)}${day}`,
    dose, change, hold, next }
}
