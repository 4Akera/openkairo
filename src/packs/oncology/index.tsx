// The oncology pack's client (spec/openCare.md §5.7; the pictures #onc-plan, #onc-cycle, #onc-unit). The Cancer section and its banner
// words; /cancer (a new cancer's card; on one already recorded, today's ECOG) and /chemo (the cycle to the day unit, each dose worked
// out, the checks shown, the toxicity graded, each drug sent where prescriptions go), offered wherever the day unit works for the department;
// the day unit's tile line (the regimen and cycle, a dose reduced, a reaction watch) and its rows of today's cycles not in a chair yet.
import { ANYONE, registerSection } from '@core/screens/chart/sections'
import { registerBannerWords } from '@core/screens/chart/words'
import { registerCard, registerCommand } from '@core/screens/visit/commands'
import { registerTileLine } from '@core/screens/ward/tiles'
import { registerBoardRows } from '@core/screens/ward/rows'
import { bannerWords, cancersOf, cyclesOf, chipWord, latestOf } from './model'
import { parseCancer, parseChemo } from './line'
import { CancerCard, CancerNote, CycleCard, cancerCardLine, cycleCardLine } from './Cards'
import { CancerSection, entriesOf, valuesIn } from './Section'
import { saw, seenEntries, seenRegimens } from './seen'
import { setCycleReader, tileWords } from './unit'
import { readCycles } from './unitRead'
import { cycleRows } from './rows'

const TYPES = ['oncology.cancer', 'oncology.cycle']
registerSection({ key: 'oncology.cancer', title: 'Cancer', types: TYPES, fit: ANYONE, Body: CancerSection,
  word: (x) => { const es = entriesOf(x.own); saw(x.ctx.org, x.identity.id, es); const w = chipWord(cancersOf(es)[0], cyclesOf(es)); return w ? { word: w } : null },
  summary: (x) => { const es = entriesOf(x.own); const c = cancersOf(es)[0]; if (!c) return null
    const last = [...cyclesOf(es)].reverse().find((y) => y.status !== 'revoked'); const today = new Date().toISOString().slice(0, 10)
    const vals = valuesIn(x.rec); const anc = latestOf(vals, 'anc'); const ef = latestOf(vals, 'ef')
    return [`${c.name}${c.words.stage ? ` ${c.words.stage}` : ''}`, last && `${last.words.name ?? last.words.regimen} ${last.words.cycle}${last.due.slice(0, 10) === today ? ' today' : ''}`,
      anc && `ANC ${anc.value}`, ef && `EF ${ef.value} %`].filter(Boolean).join(' · ') } })
registerBannerWords({ key: 'oncology.cancer', types: TYPES, words: (x) => { const es = entriesOf(x.own); saw(x.ctx.org, x.identity.id, es)
  return bannerWords(cancersOf(es)[0], cyclesOf(es)).map((word, i) => ({ word, rank: i + 1 })) } })

registerCommand({ name: 'cancer', pack: 'oncology', groupTitle: 'Oncology', title: 'Cancer', label: "The cancer's record: stage, markers, intent, plan; today's ECOG",
  example: '/cancer ecog 1', action: 'write:observation', writes: ['oncology.cancer', 'observation'],
  parse: (rest, ctx) => parseCancer(rest, ctx, seenEntries(ctx.record?.patient?.id)),
  empty: (ctx) => { const r = parseCancer('', ctx, seenEntries(ctx.record?.patient?.id)); return r && 'ok' in r ? r.ok : [] },
  note: (items, ctx) => <CancerNote items={items} ctx={ctx} /> })
registerCommand({ name: 'chemo', pack: 'oncology', orders: true, section: 'Chemotherapy', groupTitle: 'Oncology', title: 'Chemotherapy cycle',
  label: 'A cycle to the day unit: BSA, each dose, the checks, toxicity, Give · Delay · Reduce', example: '/chemo ac 3 · /chemo pac 4 reduce 20 · /chemo folfox delay 7',
  action: 'write:order', writes: ['oncology.cycle', 'medication', 'observation'],
  parse: (rest, ctx) => parseChemo(rest, ctx, { regimens: seenRegimens(), entries: seenEntries(ctx.record?.patient?.id) }) })
registerCard({ function: 'oncology.cycle', pack: 'oncology', Editor: CycleCard, line: cycleCardLine })
registerCard({ function: 'oncology.cancer', pack: 'oncology', Editor: CancerCard, line: cancerCardLine })

setCycleReader(readCycles)
registerTileLine('oncology', (row, ctx) => tileWords(row, ctx))
// today's cycles not in a chair yet, under the board, each with the base's Admit here as its Start (core change C5)
registerBoardRows('oncology', cycleRows)
export const key = 'oncology'
