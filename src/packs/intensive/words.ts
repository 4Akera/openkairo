// Critical care's banner words (spec/openCare.md §5.6, piece I2), only where the department uses the pack and only in an open stay in a
// department that uses it:
// "Ventilated d3" or "NIV d1" from an open ventilation (rank 1), the stay's latest "SOFA n" (rank 2), and "goals not done" in amber
// (rank 2) while no goals were signed since the ICU day began. Piece I3: "Killip I–IV" (rank 2) from the stay's reperfusion record. No infusion word: the banner's types are read on every chart in one page,
// and an infusion's hourly versions would push the other words off it. Pure: npm run test:intensive.
import type { BannerWord, WordsInput } from '@core/screens/chart/words'
import { stayDay } from '@core/screens/chart/model/encounter'
import { AIRWAY, airwayOf } from './codes'
import { dayStart } from './hours'
import { killipWords } from './reperfusion'
import { SOFA } from './sofa'
import { unitOf } from './unit'

export function icuWords(x: WordsInput, now = new Date()): BannerWord[] {
  // an open stay in a department that uses the pack: a ward's stay has no round, so no SOFA or goals words
  const usesPack = (id: string) => !!x.ctx.org?.departments.find((d) => d.id === id)?.packs.includes('intensive')
  const stay = x.rec.tables['base.presence']?.rows.find((r) => r.kind === 'stay' && r.state === 'admitted' && usesPack(r.department_id)); if (!stay) return []
  const unit = unitOf(x.ctx.org, stay.department_id); const iso = now.toISOString(); const out: BannerWord[] = []
  // the open ventilation, wherever it began; the newest if two
  const vent = x.own.shown.filter((e) => airwayOf(e) && e.data?.status === 'in-progress')
    .map((e) => ({ kind: airwayOf(e)!, since: String((e.data?.performed as { value?: string } | undefined)?.value ?? e.occurred_at) }))
    .sort((a, b) => b.since.localeCompare(a.since))[0]
  if (vent) out.push({ word: `${AIRWAY[vent.kind].short} d${stayDay(vent.since, iso)}`, rank: 1 })
  const mine = x.own.shown.filter((e) => e.visit_id === stay.item)
  const sofa = mine.filter((e) => e.type === 'score' && e.data?.score === SOFA).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0]
  if (sofa) out.push({ word: `SOFA ${sofa.data?.total}`, rank: 2 })
  // the stay's reperfusion record (one a stay; its latest version)
  const rep = mine.filter((e) => e.type === 'intensive.reperfusion').sort((a, b) => b.item_version - a.item_version || b.occurred_at.localeCompare(a.occurred_at))[0]
  const killip = killipWords(typeof rep?.data?.killip === 'string' ? rep.data.killip : undefined)
  if (killip) out.push({ word: `Killip ${killip}`, rank: 2 })
  const start = Date.parse(dayStart(iso, unit.dayStarts))
  if (!mine.some((e) => e.type === 'intensive.goals' && Date.parse(e.occurred_at) >= start)) out.push({ word: 'goals not done', rank: 2, tone: 'warn' })
  return out
}
