// The pharmacy's section in the chart (spec/openCare.md §5.1 rule 2): what was dispensed — the product, how much, when — from the
// pharmacy.dispense entries this reader sees (each item's latest: prepared, given, or not given and why), with its chip word
// ("2 supplied") and its Summary line (the last supply). A dispense with no products (not given) is named by the medicine it answers:
// its order (the base's orders) is about that medication (the base's lists). Fit: anyone. Pure.
import type { ChipWord, Own } from '@core/screens/chart/sections'
import type { Rec } from '@core/screens/chart/model/record'
import { shortDate } from '@core/ui/time'

type Q = { value?: string; unit?: string }
type Line = { drug?: { text?: string }; dose?: Q; quantity?: Q }
type Data = { status?: string; reason?: string; pharmacy?: { items?: Line[] } }
export interface SuppliedItem { product: string; dose: string | null; quantity: string | null }
export interface Supplied { entry_id: string; at: string; department_id: string; state: 'given' | 'prepared' | 'not_given'; items: SuppliedItem[]; reason: string | null
  medicine: string | null }   // the medicine it answers (named when it lists no products)

const amount = (q: Q | undefined) => q?.value ? `${q.value}${q.unit ? ` ${q.unit}` : ''}` : null
const STATE: Record<string, Supplied['state']> = { completed: 'given', cancelled: 'not_given', rejected: 'not_given', 'in-progress': 'prepared' }
/** the medicine a dispense answers: the order it refers to, the medication that order is about, that medication's drug */
export function answeredOf(rec: Rec | undefined, refersTo: string | null): string | null {
  const orders = rec?.tables['base.orders']; const lists = rec?.tables['base.lists']
  const about = refersTo ? orders?.rows.find((o) => o.source_entries.includes(refersTo))?.about_item : null
  const row = about ? lists?.rows.find((x) => x.list === 'medications' && x.item === about) : undefined
  const m = row ? lists?.entries[row.entry_id] : undefined
  return (m && !m.hidden ? (m.data as { drug?: { text?: string } } | undefined)?.drug?.text : null) || null
}
/** each dispense, the newest first; one with no state it knows (none, or data blanked) is left out */
export function suppliedOf(own: Own, rec?: Rec): Supplied[] {
  return own.shown.flatMap((e) => {
    const d = (e.data ?? {}) as Data; const state = d.status ? STATE[d.status] : undefined
    if (!state) return []
    return [{ entry_id: e.id, at: e.occurred_at, department_id: e.department_id, state, reason: d.reason ?? null, medicine: answeredOf(rec, e.refers_to),
      items: (d.pharmacy?.items ?? []).map((i) => ({ product: i.drug?.text || 'Medicine', dose: amount(i.dose), quantity: amount(i.quantity) })) }]
  })
}
/** a supply's products and amounts: Metformin 1 g × 60 tablets; with none, the medicine it answers */
export const whatText = (s: Supplied) => s.items.map((i) => [i.product, i.quantity && `× ${i.quantity}`].filter(Boolean).join(' ')).join(', ') || s.medicine || ''
const given = (rows: Supplied[]) => rows.filter((r) => r.state === 'given')

/** how many were supplied; else how many wait prepared; else that it was not given */
export function suppliedWord(rows: Supplied[]): ChipWord | null {
  const n = given(rows).length; if (n) return { word: `${n} supplied` }
  const prepared = rows.filter((r) => r.state === 'prepared').length; if (prepared) return { word: `${prepared} prepared` }
  return rows.length ? { word: 'not given' } : null
}
/** the last supply and when, and how many in all: "Metformin 1 g × 60 tablets · 27 Sep · 2 supplied" */
export function suppliedLine(rows: Supplied[]): string | null {
  const all = given(rows); const last = all[0]
  if (!last) return null
  return [whatText(last) || 'Supplied', shortDate(last.at), all.length > 1 ? `${all.length} supplied` : null].filter(Boolean).join(' · ')
}
