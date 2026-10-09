// Radiology's switches as its screens read them (spec/openCare.md §5.5; the setting radiology.options, on the department's card):
// pregnant asked at the door, on unless another place always asks. Pure.
import type { Organization } from '@core/db/types'
import { settingIn } from '@core/screens/settings/form/model'

export interface Options { ask_pregnant: boolean }
export function optionsOf(org: Pick<Organization, 'settings' | 'settingKeys' | 'datatypes'> | undefined, departmentId: string): Options {
  const s = settingIn(org, 'radiology.options', departmentId)
  return { ask_pregnant: s.ask_pregnant ?? true }
}
