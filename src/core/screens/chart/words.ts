// The banner's pack words (spec/openCare.md §5.1 rule 3): a pack registers words worked out from the patient's record ("1 to
// collect"), each with its rank (1 is the most important). Only the packs this department uses speak; the two best ranked show on
// the banner, the rest wait behind +n, which opens them as a second line in place. Pure: a node test imports it.
import type { Identity, ServerEntry } from '../../db/types'
import type { ChartCtx, Rec } from './model/record'
import { ownOf, type Own } from './sections'

/** one word: what it says, its rank among this department's words (1 first), a tone only for a state that asks for something */
export interface BannerWord { word: string; rank: number; tone?: 'warn' | 'danger' }
/** what a pack's words read: the one record read, who reads where, the patient, and the pack's own entries (its types' latest) */
export interface WordsInput { rec: Rec; ctx: ChartCtx; identity: Identity; own: Own }
export interface WordsDef { key: string; layer: string; types: string[]; words: (x: WordsInput) => BannerWord[] }
export type WordsIn = Omit<WordsDef, 'layer'>

const defs: WordsDef[] = []
/** a pack's words, under <pack>.<name>; a key is taken once */
export function registerBannerWords(w: WordsIn) {
  if (!w.key.includes('.')) { console.error(`openCare: banner words belong to a pack: ${w.key} needs <pack>.<name>`); return }
  if (defs.some((d) => d.key === w.key)) { console.error(`openCare: the banner words ${w.key} are taken`); return }
  defs.push({ ...w, layer: w.key.split('.')[0] })
}
export const wordDefs = (): readonly WordsDef[] => defs
/** every pack's word types, read with the pack sections' (usePackEntries) */
export const wordTypes = () => [...new Set(defs.flatMap((d) => d.types))]

export interface Spoken extends BannerWord { key: string; layer: string }
export interface PackWords { shown: Spoken[]; more: Spoken[] }
export const SHOWN = 2
/** this department's words: only the packs it uses (here, in its own order), best ranked first (ties: the department's pack order,
 *  then each pack's own order); two shown, the rest behind +n. A pack whose words fail says nothing */
export function packWordsOf(list: readonly WordsDef[], x: Omit<WordsInput, 'own'> & { packs?: ServerEntry[] }, here: string[]): PackWords {
  const all: (Spoken & { at: number })[] = []
  for (const d of list) {
    if (!here.includes(d.layer)) continue
    let ws: BannerWord[] = []
    try { ws = d.words({ rec: x.rec, ctx: x.ctx, identity: x.identity, own: ownOf(x.packs, d.types, x.ctx.org?.types) }) } catch (e) { console.error(`openCare: the banner words ${d.key} failed`, e) }
    for (const w of ws) if (w.word) all.push({ ...w, key: d.key, layer: d.layer, at: all.length })
  }
  all.sort((a, b) => a.rank - b.rank || here.indexOf(a.layer) - here.indexOf(b.layer) || a.at - b.at)
  const out = all.map(({ at: _, ...w }) => w)   // eslint-disable-line @typescript-eslint/no-unused-vars
  return { shown: out.slice(0, SHOWN), more: out.slice(SHOWN) }
}
/** the banner's lines: the first holds the shown words and +n; the second, open, the rest (folded: none) */
export function wordLines(w: PackWords, open: boolean) {
  return { first: w.shown, toggle: w.more.length ? `+${w.more.length}` : null, second: open && w.more.length ? w.more : null }
}
