// ObGyn's one word a row on the clinic's queue (spec/openCare.md §5.1 rule 4, §5.8, the picture #ob-queue): read from the pack's own
// table (obgyn.marks: the pregnancy, today's BP, the antenatal check's protein and blood group, the method) for the patients on the
// list, with the clinic's schedule, notices and intervals; the word itself is pregnancy.ts's markWord. Read once a list through the
// core's (l) of §5.7 (it replaced the small store kept here while a mark was handed only the row, 2026-10-10): the table's read hands
// each woman's identity too, so her age counts for the schedule's rows by age (35 or older).
import type { Identity, Organization } from '@core/db/types'
import { ageOf } from '@core/db/views'
import type { OrderWord, PackRow, RowCtx } from '@core/screens/rows'
import { markWord, type Mark } from './pregnancy'
import { gynOf, noticesOf, scheduleOf } from './settings'

/** each patient's marks and age, as the list's load hands them */
export type ObRows = Record<string, { marks: Mark[]; age: number | null }>
export type MarkRow = { patient_id: string; kind: Mark['kind']; at: string; data: Record<string, unknown> }

/** the read as the word takes it (pure) */
export function obRowsOf(ids: string[], rows: MarkRow[], patients: Record<string, Identity>, now = new Date()): ObRows {
  return Object.fromEntries(ids.map((id) => [id, { marks: rows.filter((r) => r.patient_id === id).map((r) => ({ kind: r.kind, at: r.at, data: r.data })),
    age: patients[id]?.birth_date ? ageOf(patients[id].birth_date, now) : null }]))
}
/** the mark (pure): a warning, what is due, the weeks, or nothing */
export function obWordsOf(row: Pick<PackRow, 'patient_id'>, ctx: Pick<RowCtx, 'list'> & { org?: Organization }, data: ObRows | null | undefined, now = new Date()): OrderWord[] {
  const r = ctx.list === 'queue' ? data?.[row.patient_id] : undefined; if (!r?.marks.length) return []
  const w = markWord(r.marks, now, { schedule: scheduleOf(ctx.org), notices: noticesOf(ctx.org), age: r.age, methods: gynOf(ctx.org).methods })
  return w ? [{ word: w.word, ...(w.tone ? { tone: w.tone } : {}) }] : []
}
