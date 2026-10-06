// A pack's marks on the department's lists (spec/openCare.md §5.1 rules 1 and 4): the desk, the clinic queue and the bench draw, in
// one place on each row, a short word from each pack the department uses ("Rx to collect"), at most one per pack, in the
// department's pack order. A word takes a colour only for a state (ok, info, warn, danger); a pack never has a colour of its own.
// Pure: a node test imports it.
import type { Department, OrderRow, Organization } from '../db/types'

/** the colours a pack word may take: states only */
export const STATE_TONES = ['ok', 'info', 'warn', 'danger'] as const
export type StateTone = typeof STATE_TONES[number]
/** a tone a pack gave, kept only when it is a state's */
export const stateTone = (t: unknown): StateTone | undefined => STATE_TONES.includes(t as StateTone) ? t as StateTone : undefined
/** a pack's own key: a layer, never the core's or the base's */
export const isPackKey = (k: string) => /^[a-z][a-z0-9_]*$/.test(k) && k !== 'core' && k !== 'base'

/** the lists that carry marks */
export type MarkList = 'desk' | 'queue' | 'bench'
/** what a mark reads of a row: the patient, the visit (the desk and the queue; none on the bench), and the orders on the row (the
 *  visit's own, or on the bench the ones sent here) */
export interface MarkRow { patient_id: string; visit_id: string | null; orders: OrderRow[] }
export interface MarkCtx { list: MarkList; dept: Pick<Department, 'id' | 'packs'>; org?: Pick<Organization, 'services'> }
export interface MarkWord { word: string; tone?: StateTone }
export type MarkFn = (row: MarkRow, ctx: MarkCtx) => MarkWord | null | undefined
export interface MarkDef { pack: string; mark: MarkFn }
/** a mark as a row draws it */
export interface Mark extends MarkWord { key: string }

const defs: MarkDef[] = []
/** a pack's mark: one per pack (a second is refused) */
export function registerRowMark(pack: string, mark: MarkFn): boolean {
  if (!isPackKey(pack)) { console.error(`openCare: row marks belong to a pack: ${pack}`); return false }
  if (defs.some((d) => d.pack === pack)) { console.error(`openCare: ${pack} has its row mark already`); return false }
  defs.push({ pack, mark }); return true
}
export const rowMarkDefs = (): readonly MarkDef[] => defs

/** a row's marks: only the packs this department uses, in its pack order, one each; a pack whose mark fails says nothing */
export function marksOf(list: readonly MarkDef[], row: MarkRow, ctx: MarkCtx): Mark[] {
  const out: Mark[] = []
  for (const pack of ctx.dept.packs) {
    const d = list.find((x) => x.pack === pack); if (!d) continue
    let m: MarkWord | null | undefined = null
    try { m = d.mark(row, ctx) } catch (e) { console.error(`openCare: the row mark of ${pack} failed`, e) }
    const word = m?.word?.trim(); const tone = stateTone(m?.tone)
    if (word) out.push({ key: pack, word, ...(tone ? { tone } : {}) })
  }
  return out
}

/** a visit's row (the queue, the desk) as a mark reads it */
export const visitMarkRow = (r: { id: string; patient: { id: string }; orders: OrderRow[] }): MarkRow => ({ patient_id: r.patient.id, visit_id: r.id, orders: r.orders })
/** a bench row, one patient and the orders sent here */
export const benchMarkRow = (g: { patient: { id: string }; rows: { order: OrderRow }[] }): MarkRow => ({ patient_id: g.patient.id, visit_id: null, orders: g.rows.map((r) => r.order) })
