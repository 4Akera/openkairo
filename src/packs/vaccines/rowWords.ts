// The vaccines pack's word on a queue row of any department that ticks it ("9-month vaccines due", "overdue 3 wk"; spec/openCare.md
// §5.8, the pictures #vax-room and #family-day), through the core's (l) of §5.7: the pack's own data read once a list — the doses of the
// patients on it (its table vaccines.doses) and who they are (the queue's own presence rows, for the birth date of a child with no dose
// yet) — then each row's word worked out as the chart's banner works it out. Only on the clinic queue; a failed read says nothing.
import type { Identity, Organization } from '@core/db/types'
import type { OrderWord, PackRow, RowCtx } from '@core/screens/rows'
import { ymd } from '@core/ui/time'
import type { DoseRow } from './data'
import { scheduleOf, type Dose } from './schedule'
import { markWord } from './words'

/** what the list's load hands the words: each patient's birth date and doses */
export interface VaxRows { born: Record<string, string | null>; doses: Record<string, Dose[]> }

/** the read as the words take it (pure) */
export function vaxRowsOf(ids: string[], patients: Record<string, Identity>, doses: DoseRow[]): VaxRows {
  const out: VaxRows = { born: {}, doses: {} }
  for (const id of ids) { out.born[id] = patients[id]?.birth_date ?? null; out.doses[id] = [] }
  for (const r of doses) (out.doses[r.patient_id] ??= []).push({ item: r.item, vaccine: r.vaccine, dose: r.dose, status: r.status, given_at: r.given_at, source: r.source, reason: r.reason, department_id: r.department_id })
  return out
}
/** the row's word: overdue first, else what is due now by age; nothing for a grown-up or a child up to date (pure) */
export function vaxWords(row: Pick<PackRow, 'patient_id'>, ctx: Pick<RowCtx, 'list'> & { org?: Organization }, data: VaxRows | null | undefined, today = ymd(new Date().toISOString())): OrderWord[] {
  if (ctx.list !== 'queue' || !data) return []
  const w = markWord(scheduleOf(ctx.org), data.doses[row.patient_id] ?? [], data.born[row.patient_id], today)
  return w ? [{ word: w.word, ...(w.tone ? { tone: w.tone } : {}) }] : []
}
