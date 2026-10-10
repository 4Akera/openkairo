// The prescription on A5 (spec §4.6 the chart, §3.13 Printing; the owner's decisions of 2026-10-08): a prescription written in the visit,
// for the patient to take with them to be dispensed outside — the clinic's header, the patient's name as written, age and sex, the
// record number, the date, each medicine with its dose, route, how often and for how long (the block's own line) and the directions in
// Arabic, and the doctor's name and department. No price: nothing of money is in the record. Pure (npm run test:chart).
import type { EntryData } from '../../../db/shapes.generated'
import type { Organization, ServerEntry } from '../../../db/types'
import { ageWords, nameOf } from '../../../db/views'
import { baseOf, type ChartItem } from './items'
import { medLine, type MedLine } from './record'
import { arabicSig } from './arabic'

/** the block's line for a medicine: 1 tablet, by mouth, twice a day, 7 days (what the screen shows; the paper the same) */
export const sigOf = (l: MedLine) => [[l.dose, l.route_words, l.frequency_words, l.prn].filter(Boolean).join(', '), l.days ? `${l.days} days` : null].filter(Boolean).join(', ')

export interface RxLine { drug: string; sig: string; quantity: string | null; instructions: string | null; arabic: string }
export interface RxSheet { set: string; at: string; patient: { name: string; age_sex: string; record: number }; doctor: string; department: string; lines: RxLine[] }
const med = (i: ChartItem) => i.entry.data as EntryData['medication'] | undefined
const ENDED = new Set(['stopped', 'completed'])
const SEX: Record<string, string> = { male: 'M', female: 'F', other: 'X' }

/** a prescription block's medicines that a patient takes away: prescribed (not reported), signed in a visit, standing (not stopped,
 *  crossed out or hidden) */
export const printable = (items: ChartItem[]) => items.filter((i) => i.family === 'medication' && !i.draft && !i.hidden && !i.crossed && !!i.visit_id
  && med(i)?.basis !== 'reported' && !!med(i)?.drug && !ENDED.has(med(i)?.status ?? ''))

/** the sheet for a block's items, or null when it has nothing to take away */
export function prescriptionOf(items: ChartItem[], ctx: { org?: Pick<Organization, 'users' | 'allDepartments'>; patient: { full_name: string; age: number; born_on?: string; sex: string; number: number } }): RxSheet | null {
  const meds = printable(items)
  if (!meds.length) return null
  const first = [...meds].sort((a, b) => a.at.localeCompare(b.at))[0]
  const author = ctx.org?.users.find((u) => u.id === first.entry.author_id)
  return {
    set: first.set_id, at: first.at,
    patient: { name: ctx.patient.full_name, age_sex: [ageWords(ctx.patient.born_on, new Date(), true) || `${ctx.patient.age} y`, SEX[ctx.patient.sex]].filter(Boolean).join(' · '), record: ctx.patient.number },
    doctor: author ? (author.title && !author.name.startsWith(author.title) ? `${author.title} ${author.name}` : author.name) : '', department: nameOf(ctx.org as Organization | undefined, first.entry.department_id) ?? '',
    lines: meds.map((m) => { const l = medLine(med(m))
      return { drug: [l.drug, l.strength].filter(Boolean).join(' '), sig: sigOf(l), quantity: l.quantity, instructions: l.instructions, arabic: arabicSig(l) } }),
  }
}

/** this visit's newest prescription: the set of its latest medicine a patient takes away, as printable() keeps them (each medicine as
 *  it stands, its latest version: prescribed, not stopped nor completed, not crossed out nor hidden) — the one P prints. A stop or a
 *  medicine finished later in the visit has no Print of its own, so it never takes P from the prescription that has one */
export function newestRxSet(entries: ServerEntry[], visitId: string | null | undefined, types?: Organization['types']): string | null {
  if (!visitId) return null
  const latest = new Map<string, ServerEntry>()
  for (const e of entries) { const had = latest.get(e.item); if (!had || e.item_version > had.item_version) latest.set(e.item, e) }
  return [...latest.values()].filter((e) => { const d = e.data as EntryData['medication'] | undefined
    return e.visit_id === visitId && !e.hidden && baseOf(e.type, types) === 'medication' && d?.basis !== 'reported' && !!d?.drug && !ENDED.has(d?.status ?? '') })
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]?.set_id ?? null
}
