// NEWS2 as the ward reads it (spec/openCare.md §5.6, piece 1): each NEWS2 the patient has, the newest first, with its band in the
// table's words and whether it is from the stay open now. From them: the banner's word ("NEWS2 6", amber at 5–6, red at 7 or more),
// the section's chip and its Summary line (the stay's trend), and the tile's "no obs yet" for a stay with no vitals ("no obs for 2 h"
// in amber from an hour after admission). On the board, each stay's latest NEWS2 from the pack's own read (bedside.board, the owner's
// C1): "NEWS2 6" on its tile. NEWS2 is for adults (16 and over): a child's word has no colour. Pure: npm run test:bedside.
import type { Organization, PresenceRow, ServerEntry } from '@core/db/types'
import type { Rec } from '@core/screens/chart/model/record'
import { fits, type ChipWord, type Fit, type Own, type SectionInput } from '@core/screens/chart/sections'
import type { BannerWord, WordsInput } from '@core/screens/chart/words'
import type { TileCtx, TileWords } from '@core/screens/ward/tiles'
import { tableOf } from '@core/screens/visit/score'
import { hm, shortDate, ymd } from '@core/ui/time'
import { NEWS2, NEWS2_S2 } from './line'

export const NEWS2_FIT: Fit = { sex: 'any', from: { n: 16, unit: 'years' } }
export const isNews2 = (e: Pick<ServerEntry, 'data'>) => e.data?.score === NEWS2 || e.data?.score === NEWS2_S2
/** the stay open now: the patient's presence row of kind stay, admitted */
export const openStay = (rec: Rec | undefined) => rec?.tables['base.presence']?.rows.find((r) => r.kind === 'stay' && r.state === 'admitted')

export interface News2Row { entry_id: string; at: string; total: number; band: string; tone?: 'warn' | 'danger'; thisStay: boolean }
/** each NEWS2, the newest first (own is sorted so), its band in the table's words */
export function news2Rows(own: Own, rec: Rec | undefined, org: Pick<Organization, 'scores'> | undefined): News2Row[] {
  const stay = openStay(rec)
  return own.shown.filter(isNews2).map((e) => {
    const d = e.data ?? {}
    const t = tableOf(org?.scores, String(d.score), String(d.version)); const b = t?.bands.find((x) => x.key === d.band)
    const row: News2Row = { entry_id: e.id, at: e.occurred_at, total: Number(d.total), band: b?.labels.en ?? String(d.band ?? ''), thisStay: !!stay && e.visit_id === stay.item }
    if (b?.tone === 'warn' || b?.tone === 'danger') row.tone = b.tone
    return row
  })
}
const word = (r: News2Row) => `NEWS2 ${r.total}`

/** the banner's word: the stay's latest NEWS2 (none in the open stay: nothing); its colour only for an adult, whom the bands are for */
export function news2Words(x: WordsInput, now = new Date()): BannerWord[] {
  const r = news2Rows(x.own, x.rec, x.ctx.org).find((y) => y.thisStay); if (!r) return []
  const adult = fits(NEWS2_FIT, { sex: x.identity.gender, birth: x.identity.birth_date, today: ymd(now.toISOString()) })
  return [{ word: word(r), rank: 1, ...(r.tone && adult ? { tone: r.tone } : {}) }]
}
/** the section's chip: the latest NEWS2, coloured only when it is this stay's */
export function news2Chip(x: SectionInput): ChipWord | null {
  const r = news2Rows(x.own, x.rec, x.ctx.org)[0]
  return r ? { word: word(r), ...(r.thisStay && r.tone ? { tone: r.tone } : {}) } : null
}
/** the Summary line: this stay's latest (its time; its day too when not today) and its trend; else the latest of any stay, with its day */
export function news2Summary(x: SectionInput, now = new Date()): string | null {
  const rows = news2Rows(x.own, x.rec, x.ctx.org); const stay = rows.filter((r) => r.thisStay)
  if (stay.length) {
    const last = stay[0]; const first = stay[stay.length - 1]
    const when = ymd(last.at) === ymd(now.toISOString()) ? hm(last.at) : `${shortDate(last.at)} ${hm(last.at)}`
    return [word(last), last.band, when, ...(stay.length >= 2 ? [`${first.total} → ${last.total} this stay`] : [])].join(' · ')
  }
  const r = rows[0]
  return r ? [word(r), r.band, shortDate(r.at)].join(' · ') : null
}
/** the tile's words: a stay admitted with no vitals yet; an hour after admission the words say how long, in amber (never colour alone) */
export function obsTileLine(row: PresenceRow, now: number): TileWords | null {
  if (row.kind !== 'stay' || row.state !== 'admitted' || row.has_vitals) return null
  const hours = Math.floor((now - new Date(row.checked_in_at).getTime()) / 3_600_000)
  return { words: hours >= 1 ? [{ text: `no obs for ${hours} h`, tone: 'warn' }] : ['no obs yet'] }
}

/** the board's read (bedside.board): the patients it names, and each stay's latest NEWS2 by the stay's item */
export interface News2Board { patient_ids: string[]; news2: Record<string, { score: string; version: string; total: number; band: string; at: string }> }
/** the tile's words: the open stay's latest NEWS2 from the board's read (amber at 5–6, red at 7 or more, in its band's tone, the colour
 *  only for an adult); with none, a stay with no obs yet says so (obsTileLine) */
export function tileWords(row: PresenceRow, ctx: Pick<TileCtx, 'org' | 'identity'>, data: unknown, now: number): TileWords | null {
  const all = data && typeof data === 'object' ? (data as { news2?: unknown }).news2 : undefined
  const n = all && typeof all === 'object' && Object.hasOwn(all, row.item) ? (all as News2Board['news2'])[row.item] : undefined
  if (row.kind !== 'stay' || row.state !== 'admitted' || !n || typeof n !== 'object' || typeof n.total !== 'number') return obsTileLine(row, now)
  const tone = tableOf(ctx.org?.scores, n.score, n.version)?.bands.find((b) => b.key === n.band)?.tone
  // an age not known fits: the colour for anyone who may be an adult
  const adult = !ctx.identity || fits(NEWS2_FIT, { sex: ctx.identity.gender, birth: ctx.identity.birth_date ?? null, today: ymd(new Date(now).toISOString()) })
  const word = `NEWS2 ${n.total}`
  return { words: [(tone === 'warn' || tone === 'danger') && adult ? { text: word, tone } : word] }
}
