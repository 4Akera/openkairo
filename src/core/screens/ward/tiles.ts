// The bed board's tiles (spec/openCare.md §5.1 rule 4): one board per place, the same in every ward, ICU, labour ward, dialysis unit
// and ER. A tile is the base's part on top (who, age, sex, the stay's day, the responsible clinician), then one pack line (each pack
// the department uses says its words there, in the department's pack order), then the buttons: the base's Admit here, Move and
// Discharge first and always in the same place, then at most two of the packs'. A pack's line and buttons may read the pack's own data
// for the board, read once per board by the pack's one load (the owner's C1, 2026-10-08). Pure: a node test imports it.
import type { Department, Identity, Organization, Place, PresenceRow } from '../../db/types'
import { isPackKey, stateTone, type StateTone } from '../marks'
import type { PackData } from '../rows'

/** what a pack's line and buttons read: the department, the bed, the patient, the stay's day (1 the admission's), the rights here; org:
 *  the clinic's directory, its score tables and settings */
export interface TileCtx { dept: Pick<Department, 'id' | 'packs'>; place: Place | null; identity: Identity | null; day: number; can: (action: string) => boolean; org?: Organization }
/** a pack's words on the tile: plain words, or its words one by one, each with a state colour of its own (only that word takes it) */
export interface TileWord { text: string; tone?: StateTone }
export interface TileWords { words: string | (string | TileWord)[] }
/** data: what the pack's load read for this board (undefined while it has not answered, after it failed, or with no load) */
export type TileLineFn = (row: PresenceRow, ctx: TileCtx, data?: unknown) => TileWords | null | undefined
/** a pack's button: its label, when it shows, and what it does (onClick, or a path to open) */
export interface TileButtonIn { label: string; show?: (row: PresenceRow, ctx: TileCtx, data?: unknown) => boolean; onClick?: (row: PresenceRow, ctx: TileCtx, data?: unknown) => void
  path?: (row: PresenceRow, ctx: TileCtx, data?: unknown) => string }
export interface LineDef { pack: string; line: TileLineFn }
export interface ButtonDef extends TileButtonIn { pack: string; key: string }
/** at most this many pack buttons: a pack's own, and on a tile */
export const PACK_BUTTONS = 2

const lines: LineDef[] = []; const buttons: ButtonDef[] = []
/** a pack's words on each tile: one line per pack (a second is refused) */
export function registerTileLine(pack: string, line: TileLineFn): boolean {
  if (!isPackKey(pack)) { console.error(`openCare: a tile line belongs to a pack: ${pack}`); return false }
  if (lines.some((d) => d.pack === pack)) { console.error(`openCare: ${pack} has its tile line already`); return false }
  lines.push({ pack, line }); return true
}
/** a pack's button on a taken bed: at most two per pack (a third is refused), each with onClick or a path */
export function registerTileButton(pack: string, b: TileButtonIn): boolean {
  if (!isPackKey(pack)) { console.error(`openCare: a tile button belongs to a pack: ${pack}`); return false }
  if (!b.label.trim() || !b.onClick === !b.path) { console.error(`openCare: the tile button ${pack} · ${b.label} needs a label and onClick or a path`); return false }
  const mine = buttons.filter((d) => d.pack === pack)
  if (mine.length >= PACK_BUTTONS) { console.error(`openCare: ${pack} has its ${PACK_BUTTONS} tile buttons; ${b.label} is refused`); return false }
  if (mine.some((d) => d.label === b.label)) { console.error(`openCare: ${pack} has a tile button ${b.label} already`); return false }
  if (BASE_LABELS.includes(b.label.trim().toLowerCase())) { console.error(`openCare: ${b.label} is the base's tile button; ${pack} may not take it`); return false }
  buttons.push({ ...b, pack, key: `${pack}:${b.label}` }); return true
}
export const tileLineDefs = (): readonly LineDef[] => lines
export const tileButtonDefs = (): readonly ButtonDef[] => buttons

/** what a pack's load reads with: the department, the clinic, the rights there */
export interface TileLoadCtx { dept: Pick<Department, 'id' | 'packs'>; org: Organization; can: (action: string) => boolean }
/** what a pack reads of its own for the board, once per board (its own door; never another pack's), handed to its line and buttons
 *  as data; again on the clinic's hints and when the stays change, never on a timer (owner, 2026-10-08, C1). It resolves to a value,
 *  never undefined (null for nothing) */
export type TileLoad = (rows: readonly PresenceRow[], ctx: TileLoadCtx) => Promise<unknown>
export interface LoadDef { pack: string; load: TileLoad }
const loads: LoadDef[] = []
/** a pack's one load for the board, shared by its line and its buttons (a second is refused) */
export function registerTileLoad(pack: string, load: TileLoad): boolean {
  if (!isPackKey(pack)) { console.error(`openCare: a tile load belongs to a pack: ${pack}`); return false }
  if (typeof load !== 'function') { console.error(`openCare: the tile load of ${pack} is not a function`); return false }
  if (loads.some((d) => d.pack === pack)) { console.error(`openCare: ${pack} has its tile load already`); return false }
  loads.push({ pack, load }); return true
}
export const tileLoadDefs = (): readonly LoadDef[] => loads
/** a pack's own data for the board (its load's answer), if it has answered */
const dataOf = (data: PackData, pack: string): unknown => Object.hasOwn(data, pack) ? data[pack] : undefined
/** the board's stays as a load's key: the same stays read once */
export const staysKey = (rows: readonly PresenceRow[]) => rows.map((r) => `${r.item}@${r.version}:${r.has_vitals ? 1 : 0}`).sort().join(',')

export interface TileSegment { pack: string; words: TileWord[] }
/** a pack's words, each trimmed, the empty ones dropped; a colour only for a state, on its own word (§5.1 rule 4) */
function wordsOf(w: TileWords['words'] | undefined): TileWord[] {
  const list = typeof w === 'string' ? [w] : Array.isArray(w) ? w : []
  return list.flatMap((x) => { const text = (typeof x === 'string' ? x : x?.text)?.trim(); const tone = typeof x === 'string' ? undefined : stateTone(x?.tone)
    return text ? [tone ? { text, tone } : { text }] : [] })
}
/** the tile's one pack line: each pack this department uses, in its pack order, says its words (with its load's data, when it has
 *  answered); a pack whose words fail says nothing */
export function tileLineOf(list: readonly LineDef[], row: PresenceRow, ctx: TileCtx, data: PackData = {}): TileSegment[] {
  const out: TileSegment[] = []
  for (const pack of ctx.dept.packs) {
    const d = list.find((x) => x.pack === pack); if (!d) continue
    let w: TileWords | null | undefined = null
    try { w = d.line(row, ctx, dataOf(data, pack)) } catch (e) { console.error(`openCare: the tile line of ${pack} failed`, e) }
    const words = wordsOf(w?.words)
    if (words.length) out.push({ pack, words })
  }
  return out
}

export type BaseButton = 'admit' | 'move' | 'discharge'
/** a base button is `off` (drawn, not for this role) for whoever may not admit, so the packs' never take its place */
export type TileAction = { key: BaseButton; label: string; base: true; off: boolean } | { key: string; label: string; base: false; def: ButtonDef }
const BASE: Record<BaseButton, string> = { admit: 'Admit here', move: 'Move', discharge: 'Discharge' }
/** the base's words, never a pack button's (Admit too) */
const BASE_LABELS = [...Object.values(BASE), 'Admit'].map((l) => l.toLowerCase())
/** the tile's buttons in their one order. The base's first and always in their place: a free bed Admit here, a taken one Move and
 *  Discharge (a closed bed none), off for whoever may not admit. Then, on a taken bed, the buttons of the packs this department uses
 *  (its pack order, each pack's in the order it registered) that show for this row; at most two in all. A pack's show that fails
 *  hides its button */
export function tileActions(list: readonly ButtonDef[], bed: { closed: boolean }, taken: { row: PresenceRow; ctx: TileCtx } | null, may: boolean, data: PackData = {}): TileAction[] {
  const base: BaseButton[] = taken ? ['move', 'discharge'] : bed.closed ? [] : ['admit']
  const out: TileAction[] = base.map((k) => ({ key: k, label: BASE[k], base: true, off: !may }))
  if (!taken) return out
  const packs: TileAction[] = []
  for (const pack of taken.ctx.dept.packs) for (const d of list) {
    if (d.pack !== pack || packs.length >= PACK_BUTTONS) continue
    let show = true
    try { show = d.show ? d.show(taken.row, taken.ctx, dataOf(data, pack)) : true } catch (e) { show = false; console.error(`openCare: the tile button ${d.key} failed`, e) }
    if (show) packs.push({ key: d.key, label: d.label, base: false, def: d })
  }
  return [...out, ...packs]
}
/** a stay with no bed here: the packs' buttons only (the base's move and discharge belong to a bed's tile) */
export const noBedActions = (list: readonly ButtonDef[], taken: { row: PresenceRow; ctx: TileCtx }, may: boolean, data: PackData = {}): TileAction[] =>
  tileActions(list, { closed: true }, taken, may, data).filter((a) => !a.base)
