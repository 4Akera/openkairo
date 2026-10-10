// The paediatrics pack's client (spec/openCare.md §5.8, the pictures #paeds-growth … #paeds-ward). In a department that uses it: the
// Growth section (the WHO z-scores and centiles the server worked out from the base's vitals, the curve), Development (/dev, the
// clinic's milestones for the age) and the Newborn checks (base entries by its codes); its banner words (the age and the weight, a
// z-score beyond ±2, a hearing screen to repeat); its line on the children's ward board (the weight and its age, Holliday–Segar's
// maintenance); its lines under the base's /rx and /v cards (the dose per kg, the z-scores: the core's line under a card, C1).
import { registerSection } from '@core/screens/chart/sections'
import { registerBannerWords } from '@core/screens/chart/words'
import { registerCommand, registerCard } from '@core/screens/visit/commands'
import { registerTileLine } from '@core/screens/ward/tiles'
import { registerCardLine } from '@core/screens/visit/lines'
import { registerRenderer } from '@core/renderers'
import { Tag } from '@core/ui'
import { GrowthBody } from './GrowthSection'
import { DevCard, DevelopmentBody, NewbornBody } from './Development'
import { DEV, devLine, hearingRefer, newbornOf, recordedOf, summaryOf, type DevData } from './develop'
import { growthSummary, growthWord, childWords } from './words'
import { rowsOf } from './growth'
import { wardLine } from './ward'
import { registerOrderWords } from '@core/screens/rows'
import { growthWords, type GrowthRows } from './rowWords'
import { loadGrowth } from './rowLoad'
import { rxLine, vLine } from './lines'
import { whoTables } from './who'

const KEY = 'paeds'
// Growth: under 19 (§5.1 rule 2); its data is the pack's own table, filled from the base's vitals
registerSection({ key: 'paeds.growth', title: 'Growth', types: [], fit: { sex: 'any', to: { n: 18, unit: 'years' } }, Body: GrowthBody,
  has: (x) => rowsOf(x.rec.tables as never).length > 0, word: (x) => growthWord(rowsOf(x.rec.tables as never)), summary: (x) => growthSummary(rowsOf(x.rec.tables as never)) })
// Development: under 6, the pack's own checks
registerSection({ key: 'paeds.development', title: 'Development', types: [DEV], fit: { sex: 'any', to: { n: 5, unit: 'years' } }, Body: DevelopmentBody,
  word: () => null, summary: (x) => { const c = recordedOf(x.own.shown).pop(); return c ? devLine(c.entry.data as unknown as DevData).replace('Development · ', '') : null } })
// the newborn checks: under 2, read from the base's observations and procedures (the facts page)
registerSection({ key: 'paeds.newborn', title: 'Newborn checks', types: [], fit: { sex: 'any', to: { n: 1, unit: 'years' } }, Body: NewbornBody,
  has: (x) => newbornOf(x.facts).length > 0, word: (x) => hearingRefer(newbornOf(x.facts)) ? { word: 'refer', tone: 'warn' } : null,
  summary: (x) => { const rows = newbornOf(x.facts); return rows.length ? rows.filter((r) => r.refer).map((r) => `hearing: ${r.text}`)[0] ?? `${rows.length} checks recorded` : null } })
// the banner: the age and the weight; a z-score beyond ±2; a hearing screen that said refer (procedures read with the packs' types)
registerBannerWords({ key: 'paeds.child', types: ['procedure'], words: (x) => childWords(rowsOf(x.rec.tables as never), x.identity, newbornOf(x.own.shown)) })
// /dev: the clinic's list for the age under the line
registerCommand({ name: 'dev', pack: KEY, group: 'record', groupTitle: 'Paediatrics', title: 'Development', label: 'Development check — the milestones for the age',
  example: '/dev', action: 'write:paeds.development', writes: [DEV],
  parse: () => ({ ok: [{ function: DEV, kind: 'development', line: 'Development', params: {}, action: 'write:paeds.development' }] }),
  empty: () => [{ function: DEV, kind: 'development', line: 'Development', params: {}, action: 'write:paeds.development' }] })
registerCard({ function: DEV, pack: KEY, Editor: DevCard, line: (q) => devLine(q as Partial<DevData>) })
// a check in the record: the list, each area's milestones, the plan
registerRenderer(DEV, {
  Full: ({ data }) => { const p = (data as unknown as DevData).paeds
    return <div className="grid gap-1 text-13"><p className="text-muted">The {p.list} list at {p.age_months} months{p.version ? ` · ${p.version}` : ''}</p>
      <ul className="grid gap-0.5">{p.items.map((i, n) => <li key={n} className="flex items-baseline gap-2"><Tag tone={i.yes ? 'ok' : 'warn'}>{i.yes ? 'yes' : 'not yet'}</Tag><span>{i.text}</span></li>)}</ul>
      {(p.plan ?? []).length > 0 && <p className="text-muted">Plan: {p.plan!.join(', ')}</p>}
      <p className="text-12 text-faint">{summaryOf(p.items, p.plan)}</p></div> },
})
// under the base's /rx card and its draft: the dose per kg; under /v: the z-scores of the values being typed (C1)
registerCardLine(KEY, 'medication', 'Paediatrics', rxLine)
registerCardLine(KEY, 'vitals', 'Paediatrics', (q, ctx) => vLine(q, ctx, whoTables()))
// the children's ward board: the weight and its age, maintenance by Holliday–Segar (no tile button: Give and Obs are ward nursing's)
registerTileLine(KEY, (row, ctx) => wardLine(row, ctx))
// its word on a queue row ("weight z −2.3"): the core's (l), the growth table read once a list (2026-10-10)
registerOrderWords(KEY, { load: loadGrowth, words: (row, ctx, data) => growthWords(row, ctx, data as GrowthRows | null) })
export const key = KEY
