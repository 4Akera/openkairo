// The haemato pack's client (spec/openCare.md §5.7; the pictures #haem-blood, #haem-bedside, #haem-inr). In a department that ticks
// it: /inr (today's INR, the base's result with no order, and the INR clinic's week, the clinic's table suggesting the week, never
// applying it), /inrplan, /programme; the Transfusions section (the group and screen from the Blood bank, each unit given, the programme,
// iron and chelation) and the Anticoagulation section; its banner words. Blood is ordered and given through the Blood bank's words.
import { registerCard } from '@core/screens/visit/commands'
import { registerSection, ANYONE, type SectionInput } from '@core/screens/chart/sections'
import { registerBannerWords, type BannerWord } from '@core/screens/chart/words'
import { registerCommands, weekLine, type WeekParams } from './commands'
import { InrCard, InrNote, PlanCard, ProgrammeCard, WeekCard } from './Cards'
import { Anticoagulation, Transfusions } from './Sections'
import { latest, programmeOf, resultText, shortGroup, unitsOf } from './blood'
import { planOf, INR } from './weeks'
import { sideOf } from './inr'

registerCommands((items, ctx) => <InrNote items={items} ctx={ctx} />)
registerCard({ function: 'result', pack: 'haemato', Editor: InrCard,
  line: (q) => { const a = (q.analytes as { value?: { value: string }; method?: string }[] | undefined)?.[0]; return /inr/i.test(String((q.code as { text?: string } | undefined)?.text ?? '')) ? `INR ${a?.value?.value ?? '?'} · ${a?.method ?? ''}` : String((q.code as { text?: string } | undefined)?.text ?? 'Result') } })
registerCard({ function: 'haemato.week', pack: 'haemato', Editor: WeekCard, line: (q) => weekLine(q as unknown as WeekParams) })
registerCard({ function: 'haemato.plan', pack: 'haemato', Editor: PlanCard,
  line: (q) => `INR clinic · ${String(q.reason ?? '')} · target ${(q.target as { low: number })?.low}–${(q.target as { high: number })?.high}` })
registerCard({ function: 'haemato.programme', pack: 'haemato', Editor: ProgrammeCard,
  line: (q) => `Transfusion programme · every ${String(q.every_weeks)} weeks · Hb before ${(q.hb as { low: number })?.low}–${(q.hb as { high: number })?.high}` })

const values = (x: Pick<SectionInput, 'rec'>) => x.rec.tables['base.values']?.rows ?? []
const blood = (x: SectionInput) => !!resultText(x.own.shown, '882-1') || unitsOf(x.own.shown).length > 0 || !!programmeOf(x.own.shown)
registerSection({ key: 'haemato.transfusions', title: 'Transfusions', types: ['given', 'result', 'haemato.programme'], fit: ANYONE, Body: Transfusions, has: blood,
  word: (x) => { const us = unitsOf(x.own.shown); if (us[0]?.stopped && Date.now() - Date.parse(us[0].at) < 3 * 86_400_000) return { word: 'stopped', tone: 'danger' }
    const p = programmeOf(x.own.shown); return p ? { word: `${p.every_weeks}-weekly` } : us.length ? { word: `${us.length} ${us.length === 1 ? 'unit' : 'units'}` } : null },
  summary: (x) => { const g = resultText(x.own.shown, '882-1'); const f = latest(values(x), 'loinc:2276-4')[0]; return [g && shortGroup(g.text), f && `ferritin ${f.value}`].filter(Boolean).join(' · ') || null } })
registerSection({ key: 'haemato.anticoag', title: 'Anticoagulation', types: ['haemato.plan', 'haemato.week'], fit: ANYONE, Body: Anticoagulation,
  has: (x) => !!planOf(x.own.shown),
  word: (x) => { const p = planOf(x.own.shown); const [i] = latest(values(x), INR); if (!p || !i) return null
    return { word: `INR ${i.value}`, ...(sideOf(i.value, p.target) !== 'in range' ? { tone: 'warn' as const } : {}) } } })
registerBannerWords({ key: 'haemato.words', types: ['result', 'haemato.plan', 'given'], words: (x) => {
  const out: BannerWord[] = []; const p = planOf(x.own.shown); const [i] = latest(values(x), INR)
  if (p) { out.push({ word: `${p.medicine ? p.medicine.charAt(0).toUpperCase() + p.medicine.slice(1) : 'Warfarin'} · ${p.target.low}–${p.target.high}`, rank: 2 })
    if (i) out.push({ word: `INR ${i.value}`, rank: 1, ...(sideOf(i.value, p.target) !== 'in range' ? { tone: 'warn' as const } : {}) }) }
  const g = resultText(x.own.shown, '882-1'); if (g) out.push({ word: shortGroup(g.text), rank: 3 })
  const f = latest(values(x), 'loinc:2276-4')[0]; if (f && f.value > 1000) out.push({ word: `Ferritin ${f.value}`, rank: 2, tone: 'warn' })
  const [u] = unitsOf(x.own.shown); if (u?.stopped && Date.now() - Date.parse(u.at) < 86_400_000) out.push({ word: 'blood stopped', rank: 1, tone: 'danger' })
  return out
} })
export const key = 'haemato'
