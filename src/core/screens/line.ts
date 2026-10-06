// A department's Screens line (spec/openCare.md §4.6, §5.1 rules 1, 5 and 6): drawn as the one row of tabs, and edited in Settings →
// Departments. Pure: the tab row, the ?tab= link and the editor's choices are tested without a screen (npm run test:screens).
import type { Department, Organization } from '../db/types'

export type Declared = Organization['screens'][number]
type Work = Department['work']
type Line = { screens: string[]; opens: string | null }
/** at most this many tabs, then More · n */
export const TAB_LIMIT = 5
/** the one board of places: no pack screen stands in for it, and a department of places never drops it */
export const BOARD = 'base.beds'

const isBase = (s: Declared) => s.layer === 'core' || s.layer === 'base'
const fits = (s: Declared, work: Work) => s.work === work || s.work === 'any'
/** used here: the core's and the base's always, a pack's while this department uses it (ticked, and on for the clinic) */
const usedHere = (s: Declared, packs: string[]) => isBase(s) || packs.includes(s.layer)
/** what the line's screens used here stand in for (a pack screen not used here stands in for nothing) */
const replacedBy = (keys: string[], declared: Declared[], packs: string[]) =>
  new Set(keys.flatMap((k) => { const s = declared.find((x) => x.key === k); return s && usedHere(s, packs) ? s.replaces : [] }))
/** a line without the base screens one of its pack screens stands in for (a pack's list of work in place of the bench) */
const unreplaced = (keys: string[], declared: Declared[], packs: string[]) => {
  const gone = replacedBy(keys, declared, packs)
  return keys.filter((k) => !gone.has(k))
}

/** the line as it can be drawn: each screen declared (its layer on), used here, of the department's work, drawable by this client;
 *  never a base screen another one on the line stands in for */
export function screensOf(d: Pick<Department, 'work' | 'screens' | 'packs'>, declared: Declared[], drawable: (key: string) => boolean): Declared[] {
  const at = (k: string) => declared.find((s) => s.key === k)
  const ok = (s: Declared | undefined): s is Declared => !!s && usedHere(s, d.packs) && fits(s, d.work) && drawable(s.key)
  // a pack screen not used here (unticked, or the pack off) gives back the base screens it stood in for, in its place
  const usable = [...new Set(d.screens.flatMap((k) => ok(at(k)) ? [k] : at(k)?.replaces ?? []))].map(at).filter(ok)
  const keys = unreplaced(usable.map((s) => s.key), declared, d.packs)
  const line = usable.filter((s) => keys.includes(s.key))
  // a department of places always has its one board (§5.1 rule 4), first when the line left it out
  const board = at(BOARD)
  return d.work === 'stays' && ok(board) && !line.includes(board) ? [board, ...line] : line
}

export interface Tab { key: string; label: string }
/** the row: the first tabs, the rest behind More · n (open: shown in the row itself), and the one selected. pinned: the selected
 *  tab is one of the rest, so the row stays open (no Fewer) */
export interface TabRow { first: Tab[]; rest: Tab[]; current: string | null; open: boolean; pinned: boolean }
/** the department's tabs: the line's screens whose action this user holds here (none named: anyone working here), in the line's
 *  order; at most five, then More · n. Selected: the one the link asks for (?tab=), else the one the line opens on, else the first.
 *  A selected tab behind More opens the row and keeps it open. */
export function tabRow(d: Pick<Department, 'work' | 'screens' | 'packs' | 'opens'>, declared: Declared[], may: (action: string) => boolean,
  drawable: (key: string) => boolean, asked?: string | null, moreOpen = false): TabRow {
  const all = screensOf(d, declared, drawable).filter((s) => !s.action || may(s.action)).map((s) => ({ key: s.key, label: s.labels.en ?? s.key }))
  const current = [asked, d.opens].find((k) => !!k && all.some((t) => t.key === k)) ?? all[0]?.key ?? null
  const at = all.findIndex((t) => t.key === current)
  const pinned = at >= TAB_LIMIT
  return { first: all.slice(0, TAB_LIMIT), rest: all.slice(TAB_LIMIT), current, open: moreOpen || pinned, pinned }
}
/** the link for a tab: ?tab= names it, except the one the line opens on (a plain link opens there); other parameters stay */
export function tabSearch(search: string, key: string, opens: string | null): string {
  const q = new URLSearchParams(search)
  if (key === opens) q.delete('tab'); else q.set('tab', key)
  const s = q.toString()
  return s ? `?${s}` : ''
}

// ── the editor (Settings → Departments) ──
/** the base's screens of a work: a department's line until one is chosen */
export const baseLine = (work: Work, declared: Declared[]) => declared.filter((s) => isBase(s) && fits(s, work)).map((s) => s.key)
/** what a department may put on its line: the base's screens of its work and those of the packs it ticks, without a base screen
 *  that one used here on the line stands in for */
export function screenChoices(work: Work, declared: Declared[], packs: string[], line: string[]): Declared[] {
  const gone = replacedBy(line, declared, packs)
  return declared.filter((s) => fits(s, work) && usedHere(s, packs) && !gone.has(s.key))
}
const withOpens = (screens: string[], opens: string | null): Line => ({ screens, opens: opens && screens.includes(opens) ? opens : screens[0] ?? null })
/** the line the editor starts from: as the department shows it (screensOf), so a pack screen not used here is already the base
 *  screens it stood in for, and the admin can save that; it opens where it did, else where its stand-in did */
export function lineHere(d: Pick<Department, 'work' | 'screens' | 'packs' | 'opens'>, declared: Declared[]): Line {
  const screens = screensOf(d, declared, () => true).map((s) => s.key)
  const back = d.opens && !screens.includes(d.opens) ? declared.find((s) => s.key === d.opens)?.replaces.find((k) => screens.includes(k)) ?? null : d.opens
  return withOpens(screens.length ? screens : baseLine(d.work, declared), back)
}
/** ticking or unticking packs: a pack's screens of this work join the line (and the base screens they stand in for leave it) or
 *  leave it; a line left empty takes the base's screens back */
export function lineForPacks(line: Line, work: Work, declared: Declared[], before: string[], after: string[]): Line {
  const keep = line.screens.filter((k) => { const s = declared.find((x) => x.key === k); return !s || isBase(s) || after.includes(s.layer) })
  const added = declared.filter((s) => !isBase(s) && after.includes(s.layer) && !before.includes(s.layer) && fits(s, work) && !keep.includes(s.key)).map((s) => s.key)
  const next = unreplaced([...keep, ...added], declared, after)
  const screens = next.length ? next : baseLine(work, declared)
  // it opens where it did; when that screen left, on the pack's screen that took its place
  return withOpens(screens, screens.includes(line.opens ?? '') ? line.opens : added.find((k) => screens.includes(k)) ?? null)
}
/** one screen on or off the line: on, the base screens it stands in for leave; at least one stays, and the bed board always (null:
 *  it stays as it is) */
export function flipScreen(line: Line, key: string, declared: Declared[], packs: string[]): Line | null {
  if (key === BOARD && line.screens.includes(key)) return null
  const next = line.screens.includes(key) ? line.screens.filter((k) => k !== key) : unreplaced([...line.screens, key], declared, packs)
  return next.length ? withOpens(next, line.opens) : null
}
