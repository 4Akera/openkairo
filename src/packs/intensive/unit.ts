// The unit's setting (intensive.unit, a department's): the hour its ICU day starts, and the infusions it runs by pump, each with its
// usual bag and its kind. Settings → Departments → the ICU draws it from the declared shape. Pure.
import type { Organization } from '@core/db/types'
import type { IntensiveUnitSetting } from '@core/db/shapes.generated'
import { settingIn } from '@core/screens/settings/form/model'
import type { Bag } from './rates'

/** one of the unit's infusions, as its setting holds it */
export type UnitInfusion = IntensiveUnitSetting['infusions'][number]
export interface UnitSetting { dayStarts: number; infusions: UnitInfusion[] }
export type DoseUnit = UnitInfusion['dose_unit']

/** the department's setting, with the shape's defaults: the day from 08:00, no infusions */
export function unitOf(org: Organization | undefined, deptId: string): UnitSetting {
  const s = settingIn(org, 'intensive.unit', deptId)
  return { dayStarts: typeof s.day_starts === 'number' ? s.day_starts : 8, infusions: Array.isArray(s.infusions) ? s.infusions : [] }
}
export const infusionOf = (unit: UnitSetting, key: string | undefined): UnitInfusion | null => unit.infusions.find((r) => r.key === key) ?? null
/** a drug that holds the blood pressure up: the board says its dose in amber, and the MAP beside it */
export const isPressor = (row: UnitInfusion | null | undefined) => row?.kind === 'vasopressor' || row?.kind === 'inotrope'
/** its word on the board: its own short word, else its name with a small first letter */
export const shortOf = (row: UnitInfusion) => row.short?.trim() || row.name.charAt(0).toLowerCase() + row.name.slice(1)
/** a dose unit in words, as the setting's form says it */
export const DOSE_WORDS: Record<DoseUnit, string> = { 'ug/kg/min': 'µg/kg/min', 'ug/min': 'µg/min', 'ug/h': 'µg/h', 'mg/h': 'mg/h', 'mg/kg/h': 'mg/kg/h', 'g/h': 'g/h', 'units/h': 'units/h' }
/** the row's usual bag, when it has one */
export const bagOf = (row: UnitInfusion | null | undefined): Bag | null =>
  row && typeof row.amount === 'number' && typeof row.volume === 'number' && row.amount_unit ? { amount: row.amount, unit: row.amount_unit, volume: row.volume } : null
