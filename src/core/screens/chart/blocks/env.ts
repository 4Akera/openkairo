// What every block reads besides its item (chart-plan.md §1.3): who reads and where, the directory for names and labels, the
// record's derived tables (a value before, a problem's name, an order about a medicine), and what a click does. The chart provides it; the
// /design gallery provides a sample one, where nothing is read or written (sample) and each action says what it would do.
import { createContext, useContext, type ReactNode } from 'react'
import type { Draft } from '../../../db/entries'
import type { Organization, ServerEntry, ServerRecord } from '../../../db/types'
import { nameOf, userName } from '../../../db/views'
import { hm, shortDate, ymd } from '../../../ui/time'
import type { ChartItem } from '../model/items'

export interface BlockEnv {
  org?: Organization                         // type labels, users, departments, services (their steps), places
  me?: string; departmentId?: string         // the reader and the chart's department: Details, Open anyway and Reviewed read and write there
  can?: (action: string) => boolean
  tables?: ServerRecord['tables']            // the one record read: values before, names of items, orders and their answers
  compact?: boolean                          // the glance: bodies say less
  sample?: boolean                           // the gallery: nothing is read or written
  startOpen?: string[]                       // entries whose Details start open (the gallery; an entry opened from a link)
  onOpen?: (entryId: string) => void         // an answer, a value: open that entry
  onEdit?: (d: Draft) => void                // a draft block's edit and remove
  onRemove?: (d: Draft) => void
  draftLine?: (d: Draft) => ReactNode        // the packs' short words after a draft's line (a dose per kg under /rx: core change C1)
  onSample?: (what: string) => void          // the gallery: what an action would have done
}
export const BlockContext = createContext<BlockEnv>({})
/** a group block's body (a prescription, a requisition, the problems, the allergies): it draws each item through ItemFrame */
export interface GroupProps { items: ChartItem[] }
export const useBlockEnv = () => useContext(BlockContext)

/** a person's and a department's names from the directory */
export const personName = (env: BlockEnv, id: string | null | undefined) => userName(env.org, id)
export const placeName = (env: BlockEnv, id: string | null | undefined) => nameOf(env.org, id)
/** a problem's or a medicine's name, by its item, from the lists (a prescription's "for", a given dose's medicine) */
export function itemName(env: BlockEnv, item: string | null | undefined): string | null {
  const t = env.tables?.['base.lists']; const row = item ? t?.rows.find((r) => r.item === item || r.entry_id === item) : undefined
  const d = row ? t!.entries[row.entry_id]?.data as { concept?: { text?: string }; drug?: { text?: string } } | undefined : undefined
  return d?.concept?.text ?? d?.drug?.text ?? null
}
/** the value of a key or code before an entry (base.values, the newest first): a vitals tile's and an analyte's "was" */
export function valueBefore(env: BlockEnv, e: Pick<ServerEntry, 'id' | 'item' | 'occurred_at'>, match: (v: { key: string; code: string | null }) => boolean) {
  return (env.tables?.['base.values']?.rows ?? []).filter((v) => v.entry_id !== e.id && v.item !== e.item && v.at < e.occurred_at && match(v))
    .sort((a, b) => b.at.localeCompare(a.at))[0] ?? null
}

/** the draft look (design-system.md §4.5): dashed, on a faint accent */
export const DRAFT_LOOK = 'border border-dashed border-accent-line bg-accent-soft/30'
/** a time as the record shows it: 14:05 today, else 12 Jun · 14:05 */
export const when = (at: string) => ymd(at) === ymd(new Date().toISOString()) ? hm(at) : `${shortDate(at)} · ${hm(at)}`
/** a block's time gutter: shown only when it differs from its set's (a draft has none; another day shows the date) */
export function gutter(at: string, setAt: string | null | undefined, draft = false) {
  if (draft) return null
  if (!setAt) return hm(at)
  return ymd(at) !== ymd(setAt) ? shortDate(at) : hm(at) !== hm(setAt) ? hm(at) : null
}
