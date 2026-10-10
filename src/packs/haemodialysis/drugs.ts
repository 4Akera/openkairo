// The unit's drugs (spec/openCare.md §5.6, D2c): the patient's current medicines given into the vein or under the skin (the base's
// medication list, active, route IV or SC), each with the doctor's timing words and when it was last given (the base's given linked to
// it). Nothing is "due" by a rule: the nurse ticks what is given now and Sign writes the base's given for each. Pure: npm run
// test:haemodialysis.
import { newId } from '@core/db/entries'
import type { EntryIn } from '@core/db/rpc'
import type { EntryData } from '@core/db/shapes.generated'
import type { ListRowData, ServerEntry, TableRead } from '@core/db/types'
import { hm, shortDate, ymd } from '@core/ui/time'
import { latest } from './session'

type Med = EntryData['medication']
export const UNIT_ROUTES = ['iv', 'sc']
export interface UnitDrug { item: string; entry_id: string; data: Med; words: string; timing: string | null; last: string | null }

const routeOf = (m: Partial<Med> | undefined) => (m?.dosage?.route ?? '').trim().toLowerCase()
/** "Epoetin alfa 4000 IU IV" */
export function drugWords(m: Med): string {
  const dose = m.dosage?.dose; const route = routeOf(m)
  return [m.drug?.text, dose?.value && `${dose.value}${dose.unit ? ` ${dose.unit}` : ''}`, route && route.toUpperCase()].filter(Boolean).join(' ')
}
/** the current IV or SC medicines, each with the newest given linked to it (given.medication = its item; each given's latest version,
 *  a crossed-out one left out: the givens come with the patient's cross-outs) */
export function unitDrugs(lists: Pick<TableRead<ListRowData>, 'rows' | 'entries'> | undefined, givens: readonly ServerEntry[]): UnitDrug[] {
  if (!lists) return []
  const out: UnitDrug[] = []; const current = latest(givens, 'given')
  for (const r of lists.rows) {
    if (r.list !== 'medications' || r.status !== 'active') continue
    const e = lists.entries[r.entry_id]; const data = e?.data as Med | undefined
    if (!data || e?.hidden || !UNIT_ROUTES.includes(routeOf(data))) continue
    // each given as it stands now (a correction's later version counts, a crossed-out one does not)
    const last = current.filter((g) => (g.data as { medication?: unknown }).medication === r.item && (g.data as { status?: unknown }).status === 'completed')
      .map((g) => g.occurred_at).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null
    out.push({ item: r.item, entry_id: r.entry_id, data, words: drugWords(data), timing: data.dosage?.timing?.text?.trim() || data.dosage?.text?.trim() || null, last })
  }
  return out.sort((a, b) => a.words.localeCompare(b.words))
}
/** "last given today 10:20", "last given 5 Oct", or "not given yet" */
export function lastWords(last: string | null, now: number): string {
  if (!last) return 'not given yet'
  return ymd(last) === ymd(new Date(now).toISOString()) ? `last given today ${hm(last)}` : `last given ${shortDate(last)}`
}
/** one given of the medicine, now, in the stay */
export function givenEntry(med: Pick<UnitDrug, 'item' | 'data'>, stay: { item: string; patient_id: string }, departmentId: string): EntryIn {
  const d = med.data
  const data: EntryData['given'] = { medication: med.item, drug: d.drug, ...(d.dosage?.dose ? { dose: d.dosage.dose } : {}),
    ...(d.dosage?.route ? { route: d.dosage.route } : {}), status: 'completed' }
  return { id: newId(), type: 'given', patient_id: stay.patient_id, department_id: departmentId, visit_id: stay.item, data }
}
