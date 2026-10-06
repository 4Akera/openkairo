// The record panel's sections (spec/openCare.md §5.1 rule 2 and "The section chips"): one registry for the base's and the packs'.
// Each section has a key, its layer (the base, or the pack its key starts with), a title, its body, a chip word (a count or a state
// in words) and an optional Summary line; a pack's also has its fit (sex and age, declared once by the pack) and the types whose
// entries are its data. The rule (arrange) says which show and in what order: Summary, this department's pack sections, a thin line,
// the base's, other packs' sections that show because of data, then More · n. Pure: component types only, so a node test imports it.
import type { ComponentType } from 'react'
import type { Identity, Organization, ServerEntry } from '../../db/types'
import type { ChartCtx, Rec } from './model/record'
import type { Panel } from './panel/RecordPanel'

export type AgeUnit = 'days' | 'months' | 'years'
export interface Age { n: number; unit: AgeUnit }
/** who a pack's section is for: a sex (any, female, male) and an age from and to, both inclusive in completed units (under 19 is to
 *  18 years). A clinic cannot change it. */
export interface Fit { sex: 'any' | 'female' | 'male'; from?: Age; to?: Age }
export const ANYONE: Fit = { sex: 'any' }
/** a chip's word: a count or a state ("1 supplied", "not asked"); a tone only for a state that asks for something, and the word says it */
export interface ChipWord { word: string; tone?: 'warn' | 'danger' }
/** a section's own entries (a pack's types): each item's latest version, the crossed out gone; the reader's placeholders apart */
export interface Own { shown: ServerEntry[]; hidden: ServerEntry[] }
/** the list drafts of this patient not yet signed, which the list sections count with the signed ones (nka: none known drafted) */
export interface Drafted { problem: number; medication: number; allergy: number; nka: boolean }
/** the Documents files read so far, once the section was opened: how many, and whether earlier pages remain */
export interface DocCount { n: number; more: boolean }
/** what a word, a Summary line and a has-data test read: the one record read, the facts page, the packs' read (their types and the
 *  cross-outs), the Documents count once read, the list drafts, the section's own entries */
export interface SectionInput { rec: Rec; ctx: ChartCtx; identity: Identity; facts?: ServerEntry[]; packs?: ServerEntry[]; documents?: DocCount | null
  drafted?: Drafted; own: Own }
export interface SectionBody { p: Panel; own: Own }
export interface SectionDef {
  key: string                                   // a base section's plain key (problems), a pack's <pack>.<name>
  layer: string                                 // 'base' or the pack
  title: string
  types: string[]                               // a pack's: the types whose entries are its data (a pack type extending a base one included)
  fit: Fit
  has?: (x: SectionInput) => boolean            // has data; default: any entry of its types, hidden ones too
  word: (x: SectionInput) => ChipWord | null
  summary?: (x: SectionInput) => string | null  // a pack's line in the Summary, while its section shows
  Body: ComponentType<SectionBody>
  fold?: boolean                                // its head folds (every one but the Summary)
}
export type SectionIn = Omit<SectionDef, 'layer' | 'types' | 'fit'> & { types?: string[]; fit?: Fit }

const defs: SectionDef[] = []
const layerOf = (key: string) => key.includes('.') ? key.split('.')[0] : 'base'
/** a section; a key is taken once (a second registration is refused); a pack's key is <pack>.<name> */
export function registerSection(s: SectionIn) {
  if (defs.some((d) => d.key === s.key)) { console.error(`openCare: the section ${s.key} is taken`); return }
  const layer = layerOf(s.key)
  defs.push({ fold: true, ...s, layer, types: layer === 'base' ? [] : s.types ?? [], fit: s.fit ?? ANYONE })
}
export const sectionDefs = (): readonly SectionDef[] => defs
/** every pack section's types: read on every chart (in their own read, usePackEntries), so a pack's data is known everywhere */
export const packTypes = () => [...new Set(defs.flatMap((d) => d.types))]

// ── the patient: age and fit ──
const parts = (d: string) => d.slice(0, 10).split('-').map(Number) as [number, number, number]
/** completed days, months or years from a birth date to a day (both YYYY-MM-DD); null when not known */
export function ageIn(birth: string | null, today: string, unit: AgeUnit): number | null {
  if (!birth) return null
  const [by, bm, bd] = parts(birth); const [ty, tm, td] = parts(today)
  if (unit === 'days') return Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(by, bm - 1, bd)) / 86_400_000)
  const months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0)
  return unit === 'months' ? months : Math.floor(months / 12)
}
export interface Who { sex: Identity['gender']; birth: string | null; today: string }
/** does the patient fit: a female-only section leaves out only men, a male-only one only women (other and unknown fit both); an age
 *  not known fits every age */
export function fits(f: Fit, who: Who): boolean {
  if (f.sex === 'female' && who.sex === 'male') return false
  if (f.sex === 'male' && who.sex === 'female') return false
  const at = (a: Age) => ageIn(who.birth, who.today, a.unit)
  if (f.from) { const n = at(f.from); if (n !== null && n < f.from.n) return false }
  if (f.to) { const n = at(f.to); if (n !== null && n > f.to.n) return false }
  return true
}

// ── a section's own entries ──
type Types = Organization['types'] | undefined
const baseType = (type: string, types: Types) => types?.find((t) => t.key === type)?.base_type ?? null
/** the entries of these types (the packs' read holds their cross-outs too): each item's latest; an item crossed out or redacted (a
 *  misfiled entry, its data blanked) is gone; a hidden one stays a placeholder, apart */
export function ownOf(entries: ServerEntry[] | undefined, of: string[], types?: Types): Own {
  if (!of.length || !entries?.length) return { shown: [], hidden: [] }
  const mine = new Set(entries.filter((e) => of.includes(e.type) || of.includes(baseType(e.type, types) ?? '')).map((e) => e.item))
  const latest = new Map<string, ServerEntry>()
  for (const e of entries) { if (!mine.has(e.item)) continue; const was = latest.get(e.item); if (!was || e.item_version > was.item_version) latest.set(e.item, e) }
  const live = [...latest.values()].filter((e) => !e.redacted && e.type !== 'crossed_out' && baseType(e.type, types) !== 'crossed_out')
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.recorded_at.localeCompare(a.recorded_at))
  return { shown: live.filter((e) => !e.hidden), hidden: live.filter((e) => e.hidden) }
}
export const hasData = (own: Own) => own.shown.length + own.hidden.length > 0

// ── the rule ──
/** one section as the rule sees it: its key and layer, a pack's fit, whether the patient has its data and whether all of it is private */
export interface Candidate { key: string; layer: string; fit: Fit; data: boolean; hiddenOnly: boolean }
/** why a section is in the row: the base's (always), this department's pack (used here and the patient fits, or data), another
 *  pack's data, or behind More. private: what it holds is all hidden from this reader, so its chip says it exists and nothing more */
export interface Placed { key: string; why: 'base' | 'here' | 'data' | 'more'; private: boolean }
/** lead: the Summary and this department's pack sections, before the thin line; rest: the base's, then other packs' with data; more:
 *  the others, behind More · n */
export interface Arranged { lead: Placed[]; rest: Placed[]; more: Placed[] }
export const SUMMARY = 'summary'
/** a pack's section shows when (this department uses its pack and the patient fits) or the patient has its data; the base's always.
 *  here: the packs this department uses; on: the packs on for the clinic (a pack off with no data on this chart waits nowhere) */
export function arrange(cs: Candidate[], here: string[], on: string[], who: Who): Arranged {
  const out: Arranged = { lead: [], rest: [], more: [] }; const data: Placed[] = []
  const put = (c: Candidate, why: Placed['why']): Placed => ({ key: c.key, why, private: why !== 'more' && c.data && c.hiddenOnly })
  for (const c of cs) if (c.key === SUMMARY) out.lead.push(put(c, 'base'))
  for (const c of cs) {
    if (c.key === SUMMARY) continue
    if (c.layer === 'base') { out.rest.push(put(c, 'base')); continue }
    const used = here.includes(c.layer)
    if (used && (c.data || fits(c.fit, who))) out.lead.push(put(c, 'here'))
    else if (c.data) data.push(put(c, 'data'))
    else if (on.includes(c.layer)) out.more.push(put(c, 'more'))
  }
  out.rest.push(...data)
  return out
}
/** the word on a chip: a private section's is "private", whatever its pack would say */
export const PRIVATE_WORD: ChipWord = { word: 'private' }

// ── the panel: the rule over the registry, each section's word, the packs' Summary lines ──
/** where and when: the packs this department uses, those on for the clinic, today in the clinic (YYYY-MM-DD) */
export interface Where { here: string[]; on: string[]; today: string }
export type Shown = Placed & { def: SectionDef; own: Own; word: ChipWord | null }
/** a pack's line in the Summary: its section's title and what it says now */
export interface PackLine { key: string; label: string; line: string }
export interface Sections { lead: Shown[]; rest: Shown[]; more: Shown[]; lines: PackLine[] }
/** the record panel's sections: each placed by the rule, with its word (private: the fact only) and, for a pack's that shows with
 *  something the reader may see, its Summary line. x: everything but own, which is worked out here from the packs' read */
export function sectionsOf(list: readonly SectionDef[], x: Omit<SectionInput, 'own'>, w: Where): Sections {
  const types = x.ctx.org?.types; const by = new Map(list.map((d) => [d.key, d]))
  const owns = new Map(list.map((d) => [d.key, ownOf(x.packs, d.types, types)]))
  const input = (d: SectionDef): SectionInput => ({ ...x, own: owns.get(d.key)! })
  const a = arrange(list.map((d) => { const own = owns.get(d.key)!
    return { key: d.key, layer: d.layer, fit: d.fit, data: d.layer !== 'base' && (d.has ? d.has(input(d)) : hasData(own)), hiddenOnly: !own.shown.length && own.hidden.length > 0 } }),
    w.here, w.on, { sex: x.identity.gender, birth: x.identity.birth_date, today: w.today })
  const full = (p: Placed): Shown => { const def = by.get(p.key)!; return { ...p, def, own: owns.get(p.key)!, word: p.private ? PRIVATE_WORD : def.word(input(def)) } }
  const lead = a.lead.map(full); const rest = a.rest.map(full)
  const lines = [...lead, ...rest].flatMap((s) => { const line = !s.private && s.def.summary?.(input(s.def)); return line ? [{ key: s.key, label: s.def.title, line }] : [] })
  return { lead, rest, more: a.more.map(full), lines }
}
