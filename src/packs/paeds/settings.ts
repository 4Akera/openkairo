// Paediatrics' settings as its cards read them (spec/openCare.md §5.1 rule 7, §5.7): the clinic's dose list (paeds.doses) and its
// milestones (paeds.milestones), both clinic-wide, on the pack's page. Pure.
import type { Organization } from '@core/db/types'
import { settingIn } from '@core/screens/settings/form/model'
import type { DoseRule } from './dose'
import type { Milestone } from './develop'

type Org = Pick<Organization, 'settings' | 'settingKeys' | 'datatypes' | 'organization'> | undefined
export const dosesOf = (org: Org): DoseRule[] => (settingIn(org, 'paeds.doses', org?.organization.id).doses ?? []) as DoseRule[]
export function milestonesOf(org: Org): { source: string | null; milestones: Milestone[] } {
  const s = settingIn(org, 'paeds.milestones', org?.organization.id)
  return { source: s.source ?? null, milestones: (s.milestones ?? []) as Milestone[] }
}
