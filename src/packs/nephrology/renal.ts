// The clinic's renal list (spec/openCare.md §5.7, Q33; the setting nephrology.renal_list): a medicine by its ingredient or ATC class, the
// eGFR under which it speaks, and what it says ("metformin: halve under 45, stop under 30"). It speaks on one line under the base's /rx
// card (core change C1, a notice, never a stop) and nowhere else decides anything. Pure (npm run test:nephrology).
import type { Organization, ValueRow } from '@core/db/types'
import { settingIn } from '@core/screens/settings/form/model'
import { EGFR } from './kidney'

export interface RenalRule { medicine: string; atc: string; under: number; says: string }
/** the clinic's list as it stands (a setting of the clinic: its one row, whichever the clinic's id; the declared starter rows until saved) */
export const rulesOf = (org: Pick<Organization, 'settings' | 'settingKeys' | 'datatypes'> & Partial<Pick<Organization, 'organization'>> | undefined): RenalRule[] =>
  (settingIn(org, 'nephrology.renal_list', org?.organization?.id ?? org?.settings.find((s) => s.key === 'nephrology.renal_list')?.thing_id).rules ?? []) as RenalRule[]
/** the latest eGFR the record holds (the laboratory's) */
export const latestEgfr = (values: Pick<ValueRow, 'code' | 'value' | 'at'>[]) => values.filter((v) => EGFR.includes(v.code ?? '')).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null
/** what the list says of a medicine at this eGFR: the rule with the lowest threshold the eGFR is under (stop under 30 before halve under
 *  45), matched by its ATC code's start, else its ingredient's name in the medicine's; null when nothing speaks */
export function renalSays(drug: { name: string; atc?: string | null }, egfr: number | null, rules: RenalRule[]): RenalRule | null {
  if (egfr == null) return null
  const name = drug.name.toLowerCase()
  const hits = rules.filter((r) => egfr < r.under && ((r.atc && drug.atc?.startsWith(r.atc)) || (r.medicine && name.includes(r.medicine.toLowerCase()))))
  return hits.sort((a, b) => a.under - b.under)[0] ?? null
}
/** the line's words: "eGFR 28 (3 Oct): metformin — the clinic's renal list says stop under 30" */
export const renalWords = (r: RenalRule, egfr: { value: number }, when: string) => `eGFR ${egfr.value} (${when}): ${r.medicine} — the clinic's renal list says ${r.says} under ${r.under}`
