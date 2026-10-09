// The chart's items (spec/openCare.md §5.6): every version of an item together, oldest first, so a setting carried on from the hour
// before is the version in force then, never a second entry. An item crossed out, redacted or hidden is left out. Pure.
import type { ServerEntry } from '@core/db/types'
import { plusHours } from './hours'

export interface Item { item: string; type: string; versions: ServerEntry[] }
const order = (a: ServerEntry, b: ServerEntry) => a.occurred_at.localeCompare(b.occurred_at) || a.item_version - b.item_version

/** the entries as items: each entry once, grouped by item, its versions oldest first; an item whose latest version is crossed out,
 *  redacted or hidden is dropped. The type is the first version's */
export function itemsOf(entries: readonly ServerEntry[]): Item[] {
  const seen = new Set<string>(); const by = new Map<string, ServerEntry[]>()
  for (const e of entries) {
    if (seen.has(e.id)) continue
    seen.add(e.id); const list = by.get(e.item) ?? []; list.push(e); by.set(e.item, list)
  }
  const out: Item[] = []
  for (const [item, list] of by) {
    list.sort((a, b) => a.item_version - b.item_version)
    const last = list[list.length - 1]
    if (last.type === 'crossed_out' || last.redacted || last.hidden) continue
    out.push({ item, type: list[0].type, versions: list })
  }
  return out
}
/** the version in force at an instant: the latest written before it */
export function inForce(it: Item, at: string): ServerEntry | null {
  const t = Date.parse(at); let best: ServerEntry | null = null
  for (const v of it.versions) if (Date.parse(v.occurred_at) < t && (!best || order(best, v) < 0)) best = v
  return best
}
/** the latest version written in the hour that begins at `hour` */
export function inHour(it: Item, hour: string): ServerEntry | null {
  const from = Date.parse(hour); const to = Date.parse(plusHours(hour, 1)); let best: ServerEntry | null = null
  for (const v of it.versions) { const t = Date.parse(v.occurred_at); if (t >= from && t < to && (!best || order(best, v) < 0)) best = v }
  return best
}
export const latestOf = (it: Item): ServerEntry => it.versions[it.versions.length - 1]
