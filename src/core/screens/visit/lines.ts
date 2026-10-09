// A pack's line under a base card (spec/openCare.md §5.8, core change C1; the owner, 2026-10-08, Q23, Q33, Q22): a pack the department
// uses may add one line, in its own words with a state tone, under the base's /rx card and its draft, and under /v's card — a
// children's pack's dose per kg and z-scores, a renal list. A notice, never a stop: nothing waits for it and nothing is
// stored. One registry, like registerTileLine and registerRowMark: one line per pack and card, only the packs this department uses
// speak, in its pack order, and a pack whose line fails says nothing. Pure: a node test imports it.
import type { Organization } from '../../db/types'
import { isPackKey, stateTone, type StateTone } from '../marks'
import type { Ctx } from './parse'

/** the base cards a pack may add its line under */
export const LINE_CARDS = ['medication', 'vitals'] as const
export type LineCard = typeof LINE_CARDS[number]
/** what a pack's line reads: the card's fields, what the chart shows (the patient, latest values, medicines, allergies), the
 *  department and the packs it uses, the clinic's settings, the moment */
export interface CardLineCtx extends Pick<Ctx, 'record' | 'departmentId'> { packs: string[]; org?: Pick<Organization, 'settings' | 'settingKeys' | 'datatypes'>; now: Date }
export interface LineWord { text: string; tone?: StateTone }
export type Words = string | (string | LineWord)[]
/** a pack's words: its rows in the card (the first the main one), and a short form after the draft's line (none: no word there) */
export interface CardLine { rows: Words[]; short?: Words | null }
export type CardLineFn = (params: Record<string, unknown>, ctx: CardLineCtx) => CardLine | null | undefined
export interface CardLineDef { pack: string; card: LineCard; title: string; line: CardLineFn }

const defs: CardLineDef[] = []
/** a pack's line under a base card, with its title (the pack's name, said over the line): one per pack and card */
export function registerCardLine(pack: string, card: LineCard, title: string, line: CardLineFn): boolean {
  if (!isPackKey(pack)) { console.error(`openCare: a card line belongs to a pack: ${pack}`); return false }
  if (!LINE_CARDS.includes(card)) { console.error(`openCare: ${pack} may add a line only under ${LINE_CARDS.join(', ')}: ${card}`); return false }
  if (defs.some((d) => d.pack === pack && d.card === card)) { console.error(`openCare: ${pack} has its line under ${card} already`); return false }
  defs.push({ pack, card, title: title.trim() || pack, line }); return true
}
export const cardLineDefs = (): readonly CardLineDef[] => defs

/** a line as drawn: the pack, its title, its rows and its short form, each word trimmed, a colour only for a state */
export interface PackCardLine { pack: string; title: string; rows: LineWord[][]; short: LineWord[] }
const wordsOf = (w: Words | null | undefined): LineWord[] => (typeof w === 'string' ? [w] : Array.isArray(w) ? w : []).flatMap((x) => {
  const text = (typeof x === 'string' ? x : x?.text)?.trim(); const tone = typeof x === 'string' ? undefined : stateTone(x?.tone)
  return text ? [tone ? { text, tone } : { text }] : [] })
/** the lines under a card of this function: the packs this department uses, in its pack order; none for a card no pack may add to */
export function cardLinesOf(list: readonly CardLineDef[], fn: string, params: Record<string, unknown>, ctx: CardLineCtx): PackCardLine[] {
  if (!LINE_CARDS.includes(fn as LineCard)) return []
  const out: PackCardLine[] = []
  for (const pack of ctx.packs) {
    const d = list.find((x) => x.pack === pack && x.card === fn); if (!d) continue
    let l: CardLine | null | undefined = null
    try { l = d.line(params, ctx) } catch (e) { console.error(`openCare: the ${fn} line of ${pack} failed`, e) }
    const rows = (l?.rows ?? []).map(wordsOf).filter((r) => r.length)
    if (rows.length) out.push({ pack, title: d.title, rows, short: wordsOf(l?.short) })
  }
  return out
}
/** what a pack's line under a card reads, from the composer's context */
export const lineCtx = (ctx: Pick<Ctx, 'record' | 'departmentId' | 'packs' | 'org' | 'now'>): CardLineCtx =>
  ({ record: ctx.record, departmentId: ctx.departmentId, packs: ctx.packs ?? [], org: ctx.org, now: ctx.now ?? new Date() })
