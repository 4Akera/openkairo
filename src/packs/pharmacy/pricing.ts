// The pharmacy's own prices (spec/openCare.md §5.4, "A department's own priced lines", owner 2026-10-08): a price on each product of the
// clinic's one list (pharmacy.product), per box, and per strip where it is sold in strips (strip_size, price_strip); no Keep stock needed.
// Shown only where a pack the department uses declares that it charges (chargesHere, core change (d)), never naming that pack; never in
// an entry. What is given is counted in the product's own units — whole boxes, then strips for the rest where it is sold in strips, else
// one box more — and is one box where it cannot be counted in them (a syrup, a cream, an amount not known). Its lines (a name, a
// quantity, an amount: plain numbers, no currency word; the order they belong to) are handed on the Dispensing row (core change (b)) for
// a row action to read: what the order comes to so far — each dispense already given, counted apart (a part, then the rest), and what is
// to give now — so whatever charges hands on only what it does not hold yet, and a rest given later is charged too. Pure (npm run
// test:pharmacy).
import type { Organization } from '@core/db/types'
import type { SettingData } from '@core/db/shapes.generated'
import { dueTotal, type DueLine } from '@core/screens/rows'
import { bareName, sameMedicine } from './substitutes'

export interface PricedProduct { id: string; brand: string; generic?: string; atc?: string; form?: string; pack_size: number
  price_box?: number; strip_size?: number; price_strip?: number }
/** the clinic's one product list, as its settings stand (read me): each product with its id */
export const productsOf = (org: Pick<Organization, 'settings'> | undefined): PricedProduct[] =>
  (org?.settings ?? []).filter((s) => s.key === 'pharmacy.product').map((s) => ({ ...(s.data as Omit<PricedProduct, 'id'>), id: s.thing_id }))
    .sort((a, b) => a.brand.localeCompare(b.brand))

/** the product a medicine given is: the one chosen (with stock kept), else the brand it names, else the only one with its active ingredient */
export function productFor(products: PricedProduct[], drug: string, id?: string): PricedProduct | null {
  if (id) { const p = products.find((x) => x.id === id); if (p) return p }
  const want = bareName(drug); const named = products.find((p) => bareName(p.brand) === want); if (named) return named
  const med = sameMedicine(drug); if (!med) return null
  const same = products.filter((p) => (med.atc && p.atc === med.atc) || (p.generic && bareName(p.generic) === bareName(med.generic)))
  return same.length === 1 ? same[0] : null
}

/** sold in strips: a strip smaller than the box, with its own price */
export const inStrips = (p: Pick<PricedProduct, 'pack_size' | 'strip_size' | 'price_strip'>) =>
  !!p.strip_size && p.strip_size >= 1 && p.strip_size < Math.max(1, p.pack_size) && typeof p.price_strip === 'number'
const COUNTED = new Set(['tablet', 'capsule', 'sachet'])
/** an amount given in the product's own units: whole boxes, then strips for the rest where it is sold in strips (a box more once they
 *  would fill one), else a box more; one box where it cannot be counted in them */
export function countIn(p: Pick<PricedProduct, 'form' | 'pack_size' | 'strip_size' | 'price_strip'>, units: number | null | undefined): { boxes: number; strips: number } {
  const pack = Math.max(1, Math.floor(p.pack_size || 1))
  const countable = typeof units === 'number' && Number.isFinite(units) && units > 0 && (p.form ? COUNTED.has(p.form) : pack > 1)
  if (!countable) return { boxes: 1, strips: 0 }
  let boxes = Math.floor(units / pack); const rest = units - boxes * pack; let strips = 0
  if (rest > 0) {
    if (inStrips(p)) { strips = Math.ceil(rest / p.strip_size!); if (strips * p.strip_size! >= pack) { boxes += 1; strips = 0 } }
    else boxes += 1
  }
  return { boxes, strips }
}
const round2 = (n: number) => Math.round(n * 100) / 100
/** the lines of one medicine given: its boxes at the box's price, its strips at the strip's; none where the box has no price (free) */
export function linesFor(p: PricedProduct, units: number | null | undefined, order?: string): DueLine[] {
  if (typeof p.price_box !== 'number' || p.price_box < 0) return []
  const { boxes, strips } = countIn(p, units); const o = order ? { order } : {}
  return [...(boxes > 0 ? [{ name: Math.max(1, p.pack_size) > 1 ? `${p.brand} · box` : p.brand, quantity: boxes, amount: round2(boxes * p.price_box), ...o }] : []),
    ...(strips > 0 ? [{ name: `${p.brand} · strip`, quantity: strips, amount: round2(strips * p.price_strip!), ...o }] : [])]
}
/** what one medicine comes to, in words for the card: "2 boxes + 1 strip · 135" (no currency word: the department's own number) */
export function priceWords(lines: DueLine[]): string {
  if (!lines.length) return ''
  const parts = lines.map((l) => { const strip = l.name.endsWith(' · strip'); const box = l.name.endsWith(' · box')
    return strip ? `${l.quantity} ${l.quantity === 1 ? 'strip' : 'strips'}` : box ? `${l.quantity} ${l.quantity === 1 ? 'box' : 'boxes'}` : `× ${l.quantity}` })
  return `${parts.join(' + ')} · ${dueTotal(lines)}`
}
/** a price as typed: a number of nothing or more, to the hundredth (a comma as the point), or none when left empty; NaN when it is not one */
export function priceOf(typed: string): number | undefined {
  const t = typed.trim().replace(',', '.'); if (!t) return undefined
  return /^\d+(\.\d{1,2})?$/.test(t) && Number(t) <= 10_000_000 ? Number(t) : NaN
}
/** a product's prices as saved: the box's, and the strip's with its size; left empty, none (free) */
export function withPrices(p: PricedProduct, box: string, strip: string, size: string): SettingData['pharmacy.product'] | null {
  const pb = priceOf(box); const ps = priceOf(strip); const n = size.trim() === '' ? undefined : Number(size)
  if (Number.isNaN(pb) || Number.isNaN(ps) || (n !== undefined && (!Number.isInteger(n) || n < 1))) return null
  if (ps !== undefined && n === undefined) return null
  const rest: Record<string, unknown> = { ...p }; for (const k of ['id', 'price_box', 'price_strip', 'strip_size']) delete rest[k]
  return { ...(rest as unknown as SettingData['pharmacy.product']), ...(pb !== undefined ? { price_box: pb } : {}), ...(n !== undefined ? { strip_size: n } : {}),
    ...(ps !== undefined ? { price_strip: ps } : {}) }
}
/** a medicine as given so far, one dispense's item (the pack's own table: pharmacy.queue's given) */
export interface Given { drug?: string; quantity?: string; unit?: string; product?: string }
/** an order's lines so far: each dispense given (counted apart, in its product's units), then what is to give now (none: nothing more);
 *  a line of the same name once, its quantities and amounts added; a medicine with no price, or not on the list, hands none */
export function orderLines(products: PricedProduct[], given: readonly Given[], now: { drug: string; units: number | null | undefined; product?: string } | null,
  order: string): DueLine[] {
  const parts = [...given.flatMap((g) => { const p = g.drug ? productFor(products, g.drug, g.product) : null; return p ? linesFor(p, Number(g.quantity), order) : [] }),
    ...(now ? (() => { const p = productFor(products, now.drug, now.product); return p ? linesFor(p, now.units, order) : [] })() : [])]
  const out: DueLine[] = []
  for (const l of parts) { const x = out.find((y) => y.name === l.name)
    if (x) { x.quantity = round2(x.quantity + l.quantity); x.amount = round2(x.amount + l.amount) } else out.push({ ...l }) }
  return out
}
