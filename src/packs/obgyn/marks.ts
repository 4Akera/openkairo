// ObGyn's one word a row on the clinic's queue (spec/openCare.md §5.1 rule 4, §5.7, the picture #ob-queue): read from the pack's own
// table (obgyn.marks: the pregnancy, today's BP, the antenatal check's protein and blood group, the method) for the patients on the
// list, with the clinic's schedule, notices and intervals; the word itself is pregnancy.ts's markWord. A row mark is handed only the row
// (core-v3), so the list's rows are read once from the table, kept here, and drawn from the list's next redraw.
import type { Organization } from '@core/db/types'
import type { MarkCtx, MarkRow, MarkWord } from '@core/screens/marks'
import { read } from '@core/db/rpc'
import { markWord, type Mark } from './pregnancy'
import { gynOf, noticesOf, scheduleOf } from './settings'

type Read = { at: number; rows: Map<string, Mark[]> }
const lists = new Map<string, Read>(); const asking = new Map<string, Set<string>>(); const FRESH = 60_000
let orgNow: Organization | undefined

function ask(dept: string, patient: string) {
  const b = lists.get(dept); if (b && b.rows.has(patient) && Date.now() - b.at < FRESH) return
  const q = asking.get(dept); if (q) { q.add(patient); return }
  asking.set(dept, new Set([patient]))
  queueMicrotask(async () => {
    const ids = [...(asking.get(dept) ?? [])]; asking.delete(dept)
    try {
      const t = await read<{ rows: { patient_id: string; kind: Mark['kind']; at: string; data: Record<string, unknown> }[] }>({ shape: 'table', table: 'obgyn.marks', department_id: dept,
        where: { patient_id: ids }, entries: false, limit: 2000 })
      const next: Read = { at: Date.now(), rows: new Map(lists.get(dept)?.rows ?? []) }
      for (const id of ids) next.rows.set(id, t.rows.filter((r) => r.patient_id === id).map((r) => ({ kind: r.kind, at: r.at, data: r.data })))
      lists.set(dept, next)
    } catch { /* no word; the next draw asks again */ }
  })
}
/** the mark: a warning, what is due, the weeks, or nothing; the organization's settings as the last list read them */
export function obMark(row: MarkRow, ctx: MarkCtx, age: number | null = null, now = new Date()): MarkWord | null {
  if (ctx.list !== 'queue') return null
  if (ctx.org) orgNow = ctx.org as Organization
  ask(ctx.dept.id, row.patient_id)
  const marks = lists.get(ctx.dept.id)?.rows.get(row.patient_id); if (!marks) return null
  return markWord(marks, now, { schedule: scheduleOf(orgNow), notices: noticesOf(orgNow), age, methods: gynOf(orgNow).methods })
}
