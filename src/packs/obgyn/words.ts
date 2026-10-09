// ObGyn's chip words and banner words (spec/openCare.md §5.1 rules 2 and 3, §5.8): Pregnancy's chip the weeks (or "not ended" in amber
// past 44 weeks, or P from the booking when she is not pregnant), Gynaecology's a method past its change; the banner G and P, Rh
// negative while pregnant, a method's change due. Pure.
import type { ServerEntry } from '@core/db/types'
import type { BannerWord } from '@core/screens/chart/words'
import type { ChipWord } from '@core/screens/chart/sections'
import type { Pregnancy } from '@core/screens/chart/model/facts'
import { bookingOf, gestOf, gpOf, methodDue, type MethodRule } from './pregnancy'
import { methodNow } from './gyn'

export function pregnancyWord(preg: Pregnancy | null, own: ServerEntry[], now: Date): ChipWord | null {
  const g = preg?.pregnant ? gestOf({ lmp: preg.lmp, weeks: preg.data.weeks, at: preg.at }, now) : null
  // past 44 weeks and never ended (the base's own word for it: "Pregnancy · check")
  if (preg?.overdue || (g && g.weeks > 44)) return { word: 'not ended', tone: 'warn' }
  if (preg?.pregnant) return g ? { word: `${g.weeks}+${g.days} w` } : { word: 'pregnant' }
  const b = bookingOf(own); return b?.para !== undefined ? { word: `P${(b.para ?? 0) + (preg ? 0 : 1)}` } : null
}
export function gynWord(facts: ServerEntry[] | undefined, rules: MethodRule[], now: Date): ChipWord | null {
  const m = methodNow(facts); if (!m || m.method === 'None') return null
  const d = methodDue(m.method, m.at, rules, now); return d?.past ? { word: `${d.short} due`, tone: 'warn' } : null
}
export function obWords(preg: Pregnancy | null, own: ServerEntry[], rules: MethodRule[], now: Date): BannerWord[] {
  const out: BannerWord[] = []; const b = bookingOf(own); const gp = gpOf(b)
  if (gp) out.push({ word: gp, rank: 1 })
  if (preg?.pregnant && b?.rh === 'negative') out.push({ word: 'Rh negative', rank: 2, tone: 'warn' })
  const m = methodNow(own); const d = m && m.method !== 'None' ? methodDue(m.method, m.at, rules, now) : null
  if (d?.past) out.push({ word: `${d.short} change due`, rank: 2, tone: 'warn' })
  return out
}
