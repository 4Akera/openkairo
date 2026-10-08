// A pack's own rows under the board (spec/openCare.md §5.6 Q2 and §5.7, the owner 2026-10-08; core change C5): today's work not yet in a
// place — the chemotherapy day unit's cycles signed for today, dialysis's patients due this shift — listed under the base's board, each
// with the base's Admit here as its Start (into a free place, chosen inline) and at most two buttons of the pack's own ("Not today").
// The rows are the pack's (it reads them its own way, a hook); the board draws them the same everywhere, counts them as a view of its
// toolbar, and leaves out a patient already in a place here. Pure: a node test imports it.
import type { EntryIn } from '../../db/rpc'
import type { Department } from '../../db/types'
import { isPackKey } from '../marks'
import { PACK_BUTTONS, type TileWords } from './tiles'

/** one row: who (to admit), the pack's words, since when it counts its minutes, the stay's reason once started */
export interface BoardRow { key: string; patientId: string; number?: number | null; name: string; sexAge?: string; words: TileWords['words']; since?: string | null; reason?: string | null }
export interface BoardRowsCtx { dept: Pick<Department, 'id' | 'packs'>; can: (action: string) => boolean }
export interface BoardRowButton { label: string; show?: (row: BoardRow, ctx: BoardRowsCtx) => boolean; onClick: (row: BoardRow, ctx: BoardRowsCtx) => void | Promise<void> }
export interface BoardRowsRead { rows: BoardRow[]; isLoading?: boolean; error?: unknown }
export interface BoardRows {
  /** the line over the rows ("Today's cycles not in a chair yet · from the cycles signed for today") and the toolbar view's word */
  title: string; view: string
  /** the pack reads its rows (a React hook, called once per board where the department uses the pack) */
  useRows: (dept: Department) => BoardRowsRead
  /** more entries in Start's own set (dialysis: the session begun), handed the stay just opened and its place */
  start?: (row: BoardRow, stay: { id: string; place_id: string; department_id: string }) => EntryIn[]
  /** at most two buttons of the pack's own, after Start */
  buttons?: BoardRowButton[]
}
export interface BoardRowsDef extends BoardRows { pack: string }

const defs: BoardRowsDef[] = []
/** a pack's rows under the board: once per pack, at most two buttons of its own, never the base's words */
export function registerBoardRows(pack: string, r: BoardRows): boolean {
  if (!isPackKey(pack)) { console.error(`openCare: rows under the board belong to a pack: ${pack}`); return false }
  if (defs.some((d) => d.pack === pack)) { console.error(`openCare: ${pack} has its rows under the board already`); return false }
  if ((r.buttons?.length ?? 0) > PACK_BUTTONS) { console.error(`openCare: ${pack}'s rows take at most ${PACK_BUTTONS} buttons of its own`); return false }
  if (r.buttons?.some((b) => ['start', 'admit', 'admit here', 'move', 'discharge'].includes(b.label.trim().toLowerCase()))) { console.error(`openCare: a base word is not ${pack}'s button`); return false }
  defs.push({ ...r, pack }); return true
}
export const boardRowsDefs = (): readonly BoardRowsDef[] => defs
/** the registrations for this department: the packs it uses, in its pack order */
export const boardRowsFor = (list: readonly BoardRowsDef[], dept: Pick<Department, 'packs'>): BoardRowsDef[] =>
  dept.packs.flatMap((p) => list.filter((d) => d.pack === p))
/** the rows shown: a patient already in a place here (or with a stay here) is not listed again */
export const rowsNotIn = (rows: BoardRow[], inHere: Set<string>) => rows.filter((r) => !inHere.has(r.patientId))
/** a row's own buttons that show (one whose show fails is hidden) */
export function rowButtons(def: Pick<BoardRows, 'buttons'>, row: BoardRow, ctx: BoardRowsCtx): BoardRowButton[] {
  return (def.buttons ?? []).filter((b) => { try { return b.show ? b.show(row, ctx) : true } catch (e) { console.error(`openCare: the row button ${b.label} failed`, e); return false } })
}
/** minutes since the row's time, for its last column ("35m") */
export const minutesSince = (at: string | null | undefined, now = Date.now()) => at ? Math.max(0, Math.floor((now - Date.parse(at)) / 60_000)) : null
