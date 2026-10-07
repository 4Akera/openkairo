// The pharmacy's stock as its screens read it (spec/openCare.md §5.3): each product of the clinic's one list with what this place has
// and its batches, its minimum here, whether this place keeps it, and what the other places that keep stock have (pharmacy.stock_read
// through the pack's door); the words and choices made from it — an amount in boxes, a product's state (out of stock, low, expiring),
// the batch to give or send from (first to expire), the products a prescription matches, what is low at the other places (a main store
// sends what a pharmacy runs low on), and the boxes that bring a place back to its minimum. Pure (npm run test:pharmacy).
import { bareName, sameMedicine } from './substitutes'

export interface Batch { batch: string; expiry: string; units: number }
/** minimum: this place's, in boxes; kept: this place keeps it (a minimum set here, or anything that moved here) */
export interface Product { id: string; brand: string; generic?: string; atc?: string; strength?: string; form?: string; pack_size: number; unit?: string
  minimum?: number | null; kept?: boolean; eda_code?: string; barcode?: string; on_hand: number; batches: Batch[] }
/** other: the place a sent line went to, or an arrived one came from */
export interface Move { at: string; kind: 'received' | 'counted' | 'expired' | 'damaged' | 'given' | 'sent' | 'arrived'; units: number; batch?: string; expiry?: string
  supplier?: string; invoice?: string; reason?: string; other?: string; by?: string }
/** what another place that keeps stock has of a product it keeps a minimum of (units; its minimum in boxes) */
export interface Elsewhere { department_id: string; product_id: string; units: number; minimum: number }
export interface StockRead { products: Product[]; moves: Move[]; elsewhere?: Elsewhere[] }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
/** units in boxes and loose units: 60 of 30 → "2 boxes", 46 → "1 box + 16", 0 → "none" */
export function inBoxes(units: number, pack: number): string {
  if (units <= 0) return units < 0 ? `${units}` : 'none'
  if (pack <= 1) return String(units)
  const boxes = Math.floor(units / pack); const loose = units % pack
  return boxes ? `${plural(boxes, 'box', 'boxes')}${loose ? ` + ${loose}` : ''}` : String(loose)
}

const DAY = 86_400_000
/** a product's state, the worst first: out of stock, low (below its minimum, in boxes), expiring (a batch within 90 days) */
export function stateOf(p: Pick<Product, 'on_hand' | 'pack_size' | 'minimum' | 'batches'>, today = new Date()): 'out' | 'low' | 'expiring' | null {
  if (p.on_hand <= 0) return 'out'
  if (p.minimum != null && p.on_hand < p.minimum * Math.max(1, p.pack_size)) return 'low'
  if (p.batches.some((b) => b.units > 0 && Date.parse(b.expiry) - today.getTime() < 90 * DAY)) return 'expiring'
  return null
}
/** the batch to give from: the first to expire that has enough; else the first to expire that has any */
export function batchFor(p: Pick<Product, 'batches'>, units: number): Batch | null {
  const live = p.batches.filter((b) => b.units > 0).sort((a, b) => a.expiry.localeCompare(b.expiry))
  return live.find((b) => b.units >= units) ?? live[0] ?? null
}
/** the product to give for a prescribed name: the brand it names when stocked, else (a generic prescribed, or the brand out) the
 *  product with the same active ingredient with the most on hand; none when the pharmacy stocks nothing of it */
export function pickProduct(products: Product[], drug: string): Product | null {
  const { named, same } = productsFor(products, drug)
  if (named && named.on_hand > 0) return named
  return [...same].sort((a, b) => b.on_hand - a.on_hand).find((p) => p.on_hand > 0) ?? named
}
/** the products a prescribed name matches: the one it names (by brand), and the others with the same active ingredient */
export function productsFor(products: Product[], drug: string): { named: Product | null; same: Product[] } {
  const want = bareName(drug); const med = sameMedicine(drug)
  const named = products.find((p) => bareName(p.brand) === want) ?? null
  const same = products.filter((p) => p !== named && ((med?.atc && p.atc === med.atc) || (p.generic && med && bareName(p.generic) === bareName(med.generic))))
  return { named, same }
}

/** the places where a product is below its minimum (out first, then the lowest share of it), as the other places' read says */
export function lowAt(p: Pick<Product, 'id' | 'pack_size'>, elsewhere: Elsewhere[]): Elsewhere[] {
  const pack = Math.max(1, p.pack_size)
  return elsewhere.filter((e) => e.product_id === p.id && e.units < e.minimum * pack).sort((a, b) => a.units / (a.minimum || 1) - b.units / (b.minimum || 1))
}
/** the boxes that bring a place back to its minimum (at least one) */
export const boxesToMinimum = (e: Pick<Elsewhere, 'units' | 'minimum'>, pack: number) => Math.max(1, Math.ceil((e.minimum * Math.max(1, pack) - Math.max(0, e.units)) / Math.max(1, pack)))
