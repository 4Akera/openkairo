// The obgyn pack's client, its clinic part (spec/openCare.md §5.7, the pictures #anc-visit … #ob-settings; the labour ward's part comes
// with the beds lane). Where a department uses it: the Pregnancy and Gynaecology sections, /anc (the base's vitals and the antenatal
// check), /obus (the clinic's scan, a base result with no order), /fp (the method; a device put in, the base's procedure), /periods,
// /pn (the visit after the birth; a birth elsewhere ends the pregnancy once), EPDS through the base's score card (/epds), its banner
// words (G and P, Rh negative, a change due) and its one word a row on the queue.
import { registerSection } from '@core/screens/chart/sections'
import { registerBannerWords } from '@core/screens/chart/words'
import { registerCard, registerCommand } from '@core/screens/visit/commands'
import { registerRowMark } from '@core/screens/marks'
import { pregnancyOf } from '@core/screens/chart/model/facts'
import { ANC, PERIODS, PN, parseAnc, parseFp, parsePeriods, parsePn, parseScan, ancLine, pnLine, scanLine, scanIn, periodsLine, type AncO, type PeriodsO, type PnO } from './lines'
import { AncCard, InsertCard, MethodCard, PnCard, ScanCard } from './Cards'
import { GynaecologyBody, PregnancyBody } from './Sections'
import { gynWord, obWords, pregnancyWord } from './words'
import { gynOf } from './settings'
import { obMark } from './marks'

const KEY = 'obgyn'
const day = (ctx: { org?: unknown }) => { void ctx; return new Date().toISOString().slice(0, 10) }
// the pregnancy's record (women 10–55): the base's pregnancy, the antenatal checks, the visit after the birth
registerSection({ key: 'obgyn.pregnancy', title: 'Pregnancy', types: [ANC, PN], fit: { sex: 'female', from: { n: 10, unit: 'years' }, to: { n: 55, unit: 'years' } }, Body: PregnancyBody,
  has: (x) => x.own.shown.length + x.own.hidden.length > 0 || !!pregnancyOf(x.facts, x.ctx.org?.types, day(x.ctx))?.pregnant,
  word: (x) => pregnancyWord(pregnancyOf(x.facts, x.ctx.org?.types, day(x.ctx)), x.own.shown, new Date()),
  summary: (x) => { const p = pregnancyOf(x.facts, x.ctx.org?.types, day(x.ctx)); const w = pregnancyWord(p, x.own.shown, new Date()); return p?.pregnant && w ? `pregnant · ${w.word}` : null } })
// gynaecology (women 10 and over): the periods, the method and its change, cervical screening
registerSection({ key: 'obgyn.gynaecology', title: 'Gynaecology', types: [PERIODS], fit: { sex: 'female', from: { n: 10, unit: 'years' } }, Body: GynaecologyBody,
  word: (x) => gynWord(x.facts, gynOf(x.ctx.org).methods, new Date()) })
// the banner: G and P, Rh negative while pregnant, a method's change due (the antenatal checks and the observations with the packs' types)
registerBannerWords({ key: 'obgyn.mother', types: [ANC, 'observation', 'pregnancy'], words: (x) => obWords(pregnancyOf(x.own.shown, x.ctx.org?.types, day(x.ctx)), x.own.shown, gynOf(x.ctx.org).methods, new Date()) })
// the queue: one word a row
registerRowMark(KEY, (row, ctx) => obMark(row, ctx))

const cmd = { pack: KEY, group: 'record' as const, groupTitle: 'ObGyn' }
registerCommand({ ...cmd, name: 'anc', title: 'Antenatal visit', label: 'Antenatal visit — BP and weight, the fundus, the baby\'s heart, the lie, urine', example: '/anc bp 118/74 wt 71 sfh 29 fhr 144 ceph nil',
  action: 'write:obgyn.anc', writes: ['vitals', ANC], parse: (rest, ctx) => parseAnc(rest, ctx),
  empty: (ctx) => { const r = parseAnc('', ctx); return r && 'ok' in r ? r.ok : [] } })
registerCommand({ ...cmd, name: 'obus', title: 'Scan in the clinic', label: 'Scan in the clinic — the four measures, the fetal weight worked out, the liquor', example: '/obus bpd 78 hc 288 ac 245 fl 57 dvp 1.8 post ceph fhr 146',
  action: 'write:result', writes: ['result'], parse: (rest, ctx) => parseScan(rest, ctx), empty: (ctx) => { const r = parseScan('', ctx); return r && 'ok' in r ? r.ok : [] } })
registerCommand({ ...cmd, name: 'fp', title: 'Contraception', label: 'Contraception — the method from today (an IUD or implant put in: the procedure)', example: '/fp hormonal iud',
  action: 'write:observation', writes: ['observation', 'procedure'], parse: (rest) => parseFp(rest) })
registerCommand({ ...cmd, name: 'periods', title: 'Periods', label: 'Periods — the LMP, the cycle, the days, the flow, pain', example: '/periods lmp 2026-09-21 26-28 8-9 heavy clots moderate',
  action: 'write:obgyn.periods', writes: [PERIODS], parse: (rest) => parsePeriods(rest) })
registerCommand({ ...cmd, name: 'pn', title: 'After the birth', label: 'The visit after the birth — BP, bleeding, the wound, feeding; a birth elsewhere', example: '/pn bp 122/78 bleeding none wound healed breast',
  action: 'write:obgyn.postnatal', writes: ['vitals', PN, 'pregnancy', 'breastfeeding'], parse: (rest, ctx) => parsePn(rest, ctx), empty: (ctx) => { const r = parsePn('', ctx); return r && 'ok' in r ? r.ok : [] } })

registerCard({ function: ANC, pack: KEY, Editor: AncCard, line: (q) => ancLine(((q as { obgyn?: AncO }).obgyn ?? {}) as AncO) })
registerCard({ function: PN, pack: KEY, Editor: PnCard, line: (q) => pnLine(((q as { obgyn?: PnO }).obgyn ?? {}) as PnO) })
registerCard({ function: PERIODS, pack: KEY, Editor: () => null, line: (q) => periodsLine(((q as { obgyn?: PeriodsO }).obgyn ?? {}) as PeriodsO) })
// the clinic's scan is a base result: its card, in departments that use obgyn (a result draft is made by /obus only)
registerCard({ function: 'result', pack: KEY, Editor: ScanCard, line: (q) => { const r = q as { service?: { name?: string }; conclusion?: string }
  return r.service?.name === 'Scan in the clinic' ? scanLine(scanIn(q as Record<string, unknown>)) : r.conclusion ?? r.service?.name ?? 'Result' } })
// the method and a device put in are base entries: their cards draw only for obgyn's own (the contraception code, a device inserted)
registerCard({ function: 'observation', pack: KEY, Editor: MethodCard, line: (q) => { const v = (q as { value?: { text?: string } }).value?.text; return v ? `Contraception · ${v.toLowerCase()} from today` : 'Observation' } })
registerCard({ function: 'procedure', pack: KEY, Editor: InsertCard, line: (q) => { const d = q as { concept?: { text?: string }; outcome?: string; note?: string }
  return [d.concept?.text, d.note, d.outcome].filter(Boolean).join(' · ') } })
export const key = KEY
