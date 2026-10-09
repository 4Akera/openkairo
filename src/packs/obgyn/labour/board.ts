// The labour ward's words on the board and the banner (spec/openCare.md §5.6). The tile (the owner's C1, read through C7's hook): for a
// stay in labour (a labour examination or a pregnancy standing), "G2 P1 · 39+2 w · 6 cm · 4 h", then past the alert line (amber) or
// the action line (red), and the baby's heart in red when it is off ("FHR 100 at 10:55"); each word only when known, nothing before
// the board's read lands. The banner: past a line, the baby's heart off; never G and P, which the clinic's own words say from the
// antenatal booking (rule 3: one fact once). The board's last answer is kept here for the tile's Partograph button, which gets no
// read (C7).
// Pure: npm run test:labour.
import type { PresenceRow } from '@core/db/types'
import type { BannerWord, WordsInput } from '@core/screens/chart/words'
import type { TileButtonIn, TileCtx, TileWord, TileWords } from '@core/screens/ward/tiles'
import { hm, ymd } from '@core/ui/time'
import { EXAM, isFhr } from './codes'
import { activeFrom, fhrOff, gestation, gestationWords, partographOf, type Point } from './partograph'

export interface ExamPoint { at: string; cervix?: number; descent?: number; gravida?: number; para?: number }
export interface LabourStay { exams: ExamPoint[]; fhr?: { value: number; at: string }; pregnancy?: { lmp?: string; weeks?: number; at: string } }
/** obgyn.board's answer: the patients it names, and each admitted stay's exams, the baby's latest heart rate and the pregnancy */
export interface LabourBoard { patient_ids: string[]; stays: Record<string, LabourStay> }

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
/** a stay's part of the board's answer, read defensively; null when the answer does not name it */
export function stayOf(data: unknown, item: string): LabourStay | null {
  const stays = isObj(data) ? data.stays : undefined
  const s = isObj(stays) && Object.hasOwn(stays, item) ? stays[item] : undefined
  return isObj(s) && Array.isArray(s.exams) ? s as unknown as LabourStay : null
}
/** in labour: a labour examination, or a pregnancy standing */
export const inLabour = (s: LabourStay | null | undefined): boolean => !!s && (s.exams.length > 0 || !!s.pregnancy)
/** G and P as the latest exam that says gravida said them: "G2 P1", or "G2" */
export function gpOf(exams: readonly ExamPoint[]): string | null {
  const e = [...exams].reverse().find((x) => typeof x.gravida === 'number')
  return e ? `G${e.gravida}${typeof e.para === 'number' ? ` P${e.para}` : ''}` : null
}
const pointsOf = (exams: readonly { at: string; cervix?: unknown; descent?: unknown }[]): Point[] => exams.flatMap((e) => typeof e.cervix === 'number'
  ? [{ at: e.at, cervix: e.cervix, ...(typeof e.descent === 'number' ? { descent: e.descent } : {}) }] : [])

/** the tile's words for a stay in labour, from the board's read; null when not in labour or not read */
export function tileWords(row: PresenceRow, ctx: Pick<TileCtx, 'org' | 'dept'>, data: unknown, now: number): TileWords | null {
  const s = stayOf(data, row.item); if (!s || !inLabour(s)) return null
  const p = partographOf(pointsOf(s.exams), activeFrom(ctx.org, ctx.dept.id), now)
  const g = gestation(s.pregnancy, ymd(new Date(now).toISOString()))
  const words: (string | TileWord)[] = []
  const gp = gpOf(s.exams); if (gp) words.push(gp)
  if (g) words.push(gestationWords(g))
  if (p.latest) words.push(p.latest.cervix >= 10 ? 'fully dilated' : `${p.latest.cervix} cm`)
  if (p.start) words.push(`${p.hours} h`); else if (p.latest) words.push('latent')
  if (p.past === 'action') words.push({ text: 'past action line', tone: 'danger' }); else if (p.past === 'alert') words.push({ text: 'past alert line', tone: 'warn' })
  if (s.fhr && typeof s.fhr.value === 'number' && fhrOff(s.fhr.value)) words.push({ text: `FHR ${s.fhr.value} at ${hm(s.fhr.at)}`, tone: 'danger' })
  return words.length ? { words } : null
}

/** the banner's words: the open stay's partograph past a line, the baby's latest heart off; none without an open stay or an exam */
export function labourWords(x: WordsInput, now = new Date()): BannerWord[] {
  const stay = x.rec.tables['base.presence']?.rows.find((r) => r.kind === 'stay' && r.state === 'admitted'); if (!stay) return []
  const exams = x.own.shown.filter((e) => e.type === EXAM && e.visit_id === stay.item); if (!exams.length) return []
  const p = partographOf(pointsOf(exams.map((e) => ({ at: e.occurred_at, cervix: e.data?.cervix }))), activeFrom(x.ctx.org, stay.department_id), now.getTime())
  const out: BannerWord[] = []
  if (p.past === 'action') out.push({ word: 'past action line', rank: 1, tone: 'danger' }); else if (p.past === 'alert') out.push({ word: 'past alert line', rank: 1, tone: 'warn' })
  const f = x.own.shown.find((e) => isFhr(e) && e.visit_id === stay.item)
  const n = Number((f?.data?.value as { quantity?: { value?: unknown } } | undefined)?.quantity?.value)
  if (f && Number.isFinite(n) && fhrOff(n)) out.push({ word: `FHR ${n}`, rank: 1, tone: 'danger' })
  return out
}

// the board's last answer, per department, for the tile's buttons (a button gets no read since C7): kept by the hook, read by show
const last = new Map<string, unknown>()
export const rememberBoard = (deptId: string, data: unknown) => { last.set(deptId, data) }
export const lastBoard = (deptId: string) => last.get(deptId)
/** the tile's Partograph button (L1c): for a reader who may read the record here, while she is in labour by the board's last good
 *  answer (none until it lands, none once a read fails), it opens the Labour tab at her */
export const partographButton: TileButtonIn = { label: 'Partograph',
  show: (row, ctx) => ctx.can('read:record') && inLabour(stayOf(lastBoard(ctx.dept.id), row.item)),
  path: (row) => `/?tab=obgyn.labour&stay=${encodeURIComponent(row.item)}` }
