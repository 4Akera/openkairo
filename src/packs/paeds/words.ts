// Paediatrics' words: the Growth chip and Summary line, and its banner words (spec/openCare.md §5.1 rules 2 and 3, §5.8): the age and
// the latest weight ("11 mo · 7.5 kg"), then a z-score beyond ±2 ("weight z −2.1", amber) and a newborn hearing screen that said refer
// and was not repeated. Pure.
import type { Identity } from '@core/db/types'
import type { BannerWord } from '@core/screens/chart/words'
import type { ChipWord } from '@core/screens/chart/sections'
import { ageText, kgText, latestOf, latestWeight, zOff, zText, type GrowthRow, type Ind } from './growth'
import type { NewbornRow } from './develop'

const NAME: Record<Ind, string> = { wfa: 'weight', lfa: 'length', hcfa: 'head', wfl: 'for length' }
/** the first z-score beyond ±2 among the latest values (weight-for-age first) */
function offOf(rows: GrowthRow[]): { k: Ind; z: number } | null {
  const l = latestOf(rows)
  for (const k of ['wfa', 'wfl', 'lfa', 'hcfa'] as Ind[]) { const z = l[k]?.z[k]?.z; if (z !== undefined && zOff(z)) return { k, z } }
  return null
}
/** the Growth chip: a z-score beyond ±2 in amber, else the latest weight */
export function growthWord(rows: GrowthRow[]): ChipWord | null {
  const off = offOf(rows); if (off) return { word: `z ${zText(off.z)}`, tone: 'warn' }
  const w = latestWeight(rows); return w?.weight != null ? { word: kgText(w.weight) } : null
}
/** the Summary line: the latest weight, length and head with their z-scores */
export function growthSummary(rows: GrowthRow[]): string | null {
  const l = latestOf(rows); if (!rows.length) return null
  const part = (k: Ind, v: number | null | undefined, unit: string, name = '') => v == null ? null : `${name}${v.toFixed(1)} ${unit}${l[k]?.z[k] ? ` z ${zText(l[k]!.z[k]!.z)}` : ''}`
  return [part('wfa', l.wfa?.weight, 'kg'), part('lfa', l.lfa?.length, 'cm'), part('hcfa', l.hcfa?.head, 'cm', 'head ')].filter(Boolean).join(' · ') || null
}
/** completed days from a birth date to today */
const daysSince = (birth: string, now: Date) => { const [y, m, d] = birth.slice(0, 10).split('-').map(Number); return Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 86_400_000) }
/** the banner's words for a child (none for anyone 19 or over): the age and latest weight, a z-score beyond ±2, the hearing to repeat */
export function childWords(rows: GrowthRow[], who: Pick<Identity, 'birth_date'>, newborn: NewbornRow[], now = new Date()): BannerWord[] {
  if (!who.birth_date) return []
  const days = daysSince(who.birth_date, now); if (days < 0 || days >= 6940) return []
  const w = latestWeight(rows); const out: BannerWord[] = [{ word: [ageText(days), w?.weight != null ? kgText(w.weight) : null].filter(Boolean).join(' · '), rank: 1 }]
  const off = offOf(rows); if (off) out.push({ word: `${NAME[off.k]} z ${zText(off.z)}`, rank: 2, tone: 'warn' })
  if (newborn.some((r) => r.refer)) out.push({ word: 'hearing: refer, not repeated', rank: 2, tone: 'warn' })
  return out
}
