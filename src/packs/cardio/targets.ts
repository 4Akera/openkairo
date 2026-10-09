// The clinic's target doses for the four heart failure groups (spec/openCare.md §5.7, Q32; the setting cardio.hf_targets on the pack's
// page, starting from ESC 2021). Pure.
import type { Organization } from '@core/db/types'
import { settingIn } from '@core/screens/settings/form/model'
import type { Target } from './heart'

export const targetsOf = (org: Pick<Organization, 'settings' | 'settingKeys' | 'datatypes' | 'organization'> | undefined): Target[] =>
  (settingIn(org, 'cardio.hf_targets', org?.organization.id).targets ?? []) as Target[]
