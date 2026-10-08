// The cardiology pack's client (spec/openCare.md §5.7; the pictures #cardio-ecg, #cardio-echo, #cardio-hf). In a department that ticks it:
// /ecg (the ECG read here, the base's result with no order), /hf (the heart failure visit: NYHA, the weight, the dry weight), its Heart and
// Heart failure sections, its banner words; /chadsvasc is its declared score. /echo is its order word, offered wherever the Echo room
// (a department using the pack, from its starter setup) works for this one; the Echo room answers on the base's bench with the base's
// result, each measure with its range.
import { registerCard } from '@core/screens/visit/commands'
import { registerCommands } from './commands'
import { registerSection, ANYONE, type SectionInput } from '@core/screens/chart/sections'
import { registerBannerWords, type BannerWord } from '@core/screens/chart/words'
import { problemsOf } from '@core/screens/chart/model/record'
import { EcgCard, HfCard, HfNote } from './Cards'
import { Heart, HeartFailure } from './Sections'
import { ecgLine, ecgOf, isEcg } from './ecg'
import { hfLine, hfOf, isNyha } from './hf'
import { EF, echoOf, ecgsOf, hasHf, nyhaWord, nyhasOf, weightOf } from './heart'

const valuesOf = (x: Pick<SectionInput, 'rec'>) => x.rec.tables['base.values']?.rows ?? []

registerCommands((items, ctx) => <HfNote items={items} ctx={ctx} />)
registerCard({ function: 'result', pack: 'cardiology', Editor: (props) => isEcg(props.q) ? <EcgCard {...props} /> : null,
  line: (q) => isEcg(q) ? ecgLine(ecgOf(q)) : String((q.code as { text?: string } | undefined)?.text ?? 'Result') })
registerCard({ function: 'observation', pack: 'cardiology', Editor: HfCard,
  line: (q) => isNyha(q) ? hfLine(hfOf(q)) : `Dry weight ${(q.value as { quantity?: { value: string } } | undefined)?.quantity?.value ?? '?'} kg` })

// ── the sections: Heart for everyone here; Heart failure, its body only while I50 is on the problem list ──
const ecgOrEcho = (x: SectionInput) => ecgsOf(x.own.shown).length > 0 || valuesOf(x).some((v) => v.code === EF)
registerSection({ key: 'cardiology.heart', title: 'Heart', types: ['result'], fit: ANYONE, Body: Heart, has: ecgOrEcho,
  word: (x) => { const e = echoOf(valuesOf(x), x.own.shown); return e ? { word: `EF ${e.ef} %`, ...(e.ef != null && e.ef < 40 ? { tone: 'warn' as const } : {}) } : { word: 'no echo yet' } },
  summary: (x) => { const [last] = ecgsOf(x.own.shown); const e = echoOf(valuesOf(x), x.own.shown)
    return [last && `ECG ${last.rhythm ?? ''} ${last.rate ?? ''}`.trim(), e && `EF ${e.ef} %`].filter(Boolean).join(' · ') || null } })
const hf = (x: SectionInput) => hasHf(problemsOf(x.rec, x.ctx).active)
registerSection({ key: 'cardiology.hf', title: 'Heart failure', types: ['observation', 'score'], fit: ANYONE, Body: HeartFailure, has: hf,
  word: (x) => { if (!hf(x)) return null; const [n] = nyhasOf(x.own.shown); return n ? { word: `NYHA ${nyhaWord(n.cls)}` } : { word: 'NYHA not written' } } })

// ── its banner words: over the dry weight, NYHA; no echo yet for a patient with none ──
registerBannerWords({ key: 'cardiology.words', types: ['observation', 'result'], words: (x) => {
  const out: BannerWord[] = []; const values = valuesOf(x)
  if (hasHf(problemsOf(x.rec, x.ctx).active)) {
    const w = weightOf(values); if (w.over != null && w.over >= 1) out.push({ word: `+${w.over} kg over dry`, rank: 1, tone: 'warn' })
    const [n] = nyhasOf(x.own.shown); if (n) out.push({ word: `NYHA ${nyhaWord(n.cls)}`, rank: 2 })
  }
  if (!values.some((v) => v.code === EF)) out.push({ word: 'No echo yet', rank: 3 })
  return out
} })
export const key = 'cardiology'
