// ObGyn's settings as its cards, sections and mark read them (spec/openCare.md §5.1 rule 7, §5.7, the picture #ob-settings): the
// antenatal schedule, the visits and the fundus band, the notices, gynaecology's intervals — clinic-wide, on the pack's page, each with
// the drawn starter rows as its shape's defaults. Pure.
import type { Organization } from '@core/db/types'
import { settingIn } from '@core/screens/settings/form/model'
import type { MethodRule, Notices, ScheduleRow } from './pregnancy'

type Org = Pick<Organization, 'settings' | 'settingKeys' | 'datatypes' | 'organization'> | undefined
export const scheduleOf = (org: Org) => (settingIn(org, 'obgyn.schedule', org?.organization.id).rows ?? []) as ScheduleRow[]
export function visitsOf(org: Org) {
  const s = settingIn(org, 'obgyn.visits', org?.organization.id)
  return { every: (s.every ?? []) as { until: number; weeks: number }[], band: s.fundus_band ?? 2, from: s.fundus_from ?? 24 }
}
export function noticesOf(org: Org): Notices & { efw_low: number; efw_high: number; dvp_low: number; dvp_high: number } {
  const s = settingIn(org, 'obgyn.notices', org?.organization.id)
  return { bp_sys: s.bp_sys ?? 140, bp_dia: s.bp_dia ?? 90, protein: (s.protein ?? '++') as Notices['protein'], efw_low: s.efw_low ?? 10, efw_high: s.efw_high ?? 90, dvp_low: s.dvp_low ?? 2, dvp_high: s.dvp_high ?? 8 }
}
export function gynOf(org: Org): { screening: 'pap3' | 'hpv5' | 'both5'; methods: MethodRule[] } {
  const s = settingIn(org, 'obgyn.gynaecology', org?.organization.id)
  return { screening: (s.screening ?? 'pap3') as 'pap3' | 'hpv5' | 'both5', methods: (s.methods ?? []) as MethodRule[] }
}
export const SCREENING: Record<'pap3' | 'hpv5' | 'both5', { years: number; words: string }> = { pap3: { years: 3, words: 'every 3 years' }, hpv5: { years: 5, words: 'HPV every 5 years' }, both5: { years: 5, words: 'Pap and HPV every 5 years' } }
