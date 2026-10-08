// The nephrology pack's client (spec/openCare.md §5.7; the picture #renal-ckd). It adds no record type: in a department that ticks it, the
// Kidneys section (the KDIGO square from the latest eGFR and ACR, eGFR over time, the CKD panel), its banner words, and the clinic's renal
// list (its setting) speaking on one line under the base's /rx card as the medicine is typed, a notice, never a stop.
import { registerSection, ANYONE, type SectionInput } from '@core/screens/chart/sections'
import { registerBannerWords, type BannerWord } from '@core/screens/chart/words'
import { Kidneys } from './Kidneys'
import { A, G, egfrSeries, fallOf, riskOf, squaresOf, squareWord } from './kidney'

const stage = (x: Pick<SectionInput, 'rec' | 'identity'>) => {
  const values = x.rec.tables['base.values']?.rows ?? []
  const egfrs = egfrSeries(values, x.identity.birth_date ?? null, x.identity.gender === 'female'); return { egfrs, ...squaresOf(egfrs, values) }
}
const TONE = [undefined, undefined, 'warn', 'danger'] as const
registerSection({ key: 'nephrology.kidneys', title: 'Kidneys', types: [], fit: ANYONE, Body: Kidneys, has: (x) => { const s = stage(x); return !!s.now && s.now.g >= 2 },
  word: (x) => { const { now } = stage(x); if (!now) return null; const r = riskOf(now); const tone = r != null ? TONE[r] : undefined
    return { word: squareWord(now), ...(tone ? { tone } : {}) } },
  summary: (x) => { const { now, before } = stage(x); if (!now) return null; const f = fallOf(now, before)
    return `${G[now.g][0]}${now.a != null ? ` ${A[now.a][0]}` : ''} · eGFR ${now.egfr.value}${f != null && f > 0 ? `, falling ${f} a year` : ''}` } })
registerBannerWords({ key: 'nephrology.words', types: [], words: (x) => {
  const { now, before } = stage(x); if (!now) return []; const out: BannerWord[] = []; const r = riskOf(now)
  out.push({ word: `CKD ${squareWord(now)}`, rank: 1, ...(r === 3 ? { tone: 'danger' as const } : r === 2 ? { tone: 'warn' as const } : {}) })
  const f = fallOf(now, before); if (f != null && f >= 5) out.push({ word: `eGFR ${now.egfr.value} ↓`, rank: 2, tone: 'warn' })
  return out
} })
export const key = 'nephrology'
