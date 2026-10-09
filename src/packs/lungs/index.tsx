// The lungs pack's client (spec/openCare.md §5.7; the picture #chest-spiro). In a department that ticks it: /spiro (the base's
// result, worked out against GLI-2012 by the server), /technique, /flare and /plan (the base's observations in its terms), CAT, mMRC, ACT
// and the GOLD group as declared scores, the Chest section and its banner words.
import { registerCard } from '@core/screens/visit/commands'
import { registerSection, ANYONE, type SectionInput } from '@core/screens/chart/sections'
import { registerBannerWords, type BannerWord } from '@core/screens/chart/words'
import { problemsOf } from '@core/screens/chart/model/record'
import type { ServerEntry } from '@core/db/types'
import { registerCommands } from './commands'
import { SpiroCard, ObsCard } from './Cards'
import { Chest } from './Chest'
import { GOLD_WORD, hasAsthma, hasCopd, lastSpiro, scoresOf, termOf } from './airways'
import { isSpiro } from './spiro'

registerCommands()
const analytes = (q: Record<string, unknown>) => (q.analytes as { key: string; value?: { value: string } }[] | undefined) ?? []
registerCard({ function: 'result', pack: 'lungs', Editor: (props) => isSpiro(props.q) ? <SpiroCard {...props} /> : null,
  line: (q) => { if (!isSpiro(q)) return String((q.code as { text?: string } | undefined)?.text ?? 'Result')
    const v = (k: string) => analytes(q).find((a) => a.key === k)?.value?.value; const after = v('fev1_post') != null
    const words = String(q.conclusion ?? ''); const grade = words.match(/GOLD \d/)?.[0]
    return ['Spirometry', after ? 'after bronchodilator' : null, `FEV1 ${v(after ? 'fev1_post' : 'fev1') ?? '?'} L${v('fev1_pct') ? ` (${v('fev1_pct')} %)` : ''}`,
      v(after ? 'ratio_post' : 'ratio') ? `FEV1/FVC ${v(after ? 'ratio_post' : 'ratio')}` : null, /not reversible/.test(words) ? 'not reversible' : /reversible/.test(words) ? 'reversible' : null, grade].filter(Boolean).join(' · ') } })
registerCard({ function: 'observation', pack: 'lungs', Editor: ObsCard,
  line: (q) => { const k = termOf({ data: q } as unknown as ServerEntry); const t = String((q.value as { text?: string } | undefined)?.text ?? '')
    return k === 'action_plan' ? 'Action plan · Arabic' : k === 'flare' ? `Flare · ${t}${q.note ? ` · ${String(q.note)}` : ''}` : k === 'inhaler_technique' ? `Inhaler technique · ${t}` : t } })

const mine = (x: SectionInput) => x.own.shown.some((e) => (e.type === 'result' && isSpiro(e.data)) || (e.type === 'score' && String(e.data?.score ?? '').startsWith('lungs.')) || termOf(e))
registerSection({ key: 'lungs.chest', title: 'Chest', types: ['result', 'observation', 'score', 'given'], fit: ANYONE, Body: Chest, has: mine,
  word: (x) => { const s = scoresOf(x.own.shown); const asthma = hasAsthma(problemsOf(x.rec, x.ctx).active)
    if (asthma && s.act) return { word: `ACT ${s.act.total}`, ...(s.act.total < 20 ? { tone: 'warn' as const } : {}) }
    if (s.gold) return { word: `GOLD ${GOLD_WORD[s.gold.band] ?? s.gold.band}`, ...(s.gold.band === 'e' ? { tone: 'warn' as const } : {}) }
    return lastSpiro(x.own.shown) ? { word: 'spirometry' } : null },
  summary: (x) => { const s = scoresOf(x.own.shown); return [s.gold && `GOLD ${GOLD_WORD[s.gold.band] ?? s.gold.band}`, s.cat && `CAT ${s.cat.total}`, s.act && `ACT ${s.act.total}`].filter(Boolean).join(' · ') || null } })
registerBannerWords({ key: 'lungs.words', types: ['score'], words: (x) => {
  const s = scoresOf(x.own.shown); const out: BannerWord[] = []; const probs = problemsOf(x.rec, x.ctx).active
  if (s.gold && (hasCopd(probs) || !hasAsthma(probs))) out.push({ word: `GOLD ${GOLD_WORD[s.gold.band] ?? s.gold.band}`, rank: 1, ...(s.gold.band === 'e' ? { tone: 'warn' as const } : {}) })
  if (s.cat) out.push({ word: `CAT ${s.cat.total}`, rank: 2 })
  if (s.act && hasAsthma(probs)) out.push({ word: `ACT ${s.act.total}`, rank: 1, ...(s.act.total < 20 ? { tone: 'warn' as const } : {}) })
  return out
} })
export const key = 'lungs'
