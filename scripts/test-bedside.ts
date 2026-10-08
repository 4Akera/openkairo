// Ward nursing, piece 1 (spec/openCare.md §5.6): /obs and its grammar, the two drafts it gives (the base's vitals and NEWS2 as the
// base's score), the notes under the cards (RCP 2017's response), the banner's word, the section's chip and Summary line, and the
// tile's "no obs yet". Pure: no browser, no database.   npm run test:bedside
import assert from 'node:assert/strict'
import { setClinicTimeZone, hm, shortDate } from '../src/core/ui/time'
import '../src/packs/bedside/obs'
import { NEWS2, NEWS2_S2, obsLine, obsNotes, scale2Choice } from '../src/packs/bedside/line'
import { news2Chip, news2Summary, news2Words, obsTileLine } from '../src/packs/bedside/news2'
import { parse, type Ctx, type Parsed } from '../src/core/screens/visit/parse'
import { commandsFor } from '../src/core/screens/visit/commands'
import { keyOf, type ScoreParams, type ScoreResult } from '../src/core/screens/visit/score'
import { ownOf, type SectionInput } from '../src/core/screens/chart/sections'
import { tileLineOf, type TileCtx } from '../src/core/screens/ward/tiles'
import { E, ctx as chartCtx, org, presence, record, table } from './chart-fixtures'
import type { Identity, Organization, ScoreItem, ScoreTable, ServerEntry } from '../src/core/db/types'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }

// the two tables as the migration declares them: keys, labels and bands (the points are the server's)
const item = (key: string, en: string, input: ScoreItem['input'] = 'number', choices: string[] = []): ScoreItem =>
  ({ key, labels: { en }, input, ...(choices.length ? { choices: choices.map((value) => ({ value, points: 0, labels: { en: value } })) } : {}) })
const bands = (tail = '') => [{ key: 'low', labels: { en: `Low${tail}` }, min: 0, max: 4, tone: null }, { key: 'medium', labels: { en: `Medium${tail}` }, min: 5, max: 6, tone: 'warn' as const },
  { key: 'high', labels: { en: `High${tail}` }, min: 7, max: 20, tone: 'danger' as const }]
const common = { version: '2017', layer: 'bedside', short: 'NEWS2', source: 'Royal College of Physicians', coding: null, retired_at: null, declared_at: '2026-10-08T00:00:00Z' }
const OX = item('oxygen', 'Air or oxygen', 'choice', ['air', 'oxygen']); const AC = item('consciousness', 'Consciousness (ACVPU)', 'choice', ['a', 'c', 'v', 'p', 'u'])
const N1: ScoreTable = { ...common, key: NEWS2, alias: 'news2', labels: { en: 'NEWS2 (SpO₂ scale 1)' }, bands: bands(),
  items: [item('rr', 'Respiration rate'), item('spo2', 'SpO₂ (scale 1)'), OX, item('sbp', 'Systolic blood pressure'), item('pulse', 'Pulse'), AC, item('temp', 'Temperature')] }
const N2: ScoreTable = { ...common, key: NEWS2_S2, alias: 'news2s2', labels: { en: 'NEWS2 (SpO₂ scale 2: target 88–92 %)' }, bands: bands(' · scale 2'),
  items: [item('rr', 'Respiration rate'), item('spo2_s2', 'SpO₂ (scale 2)', 'choice', ['le83', '84_85', '86_87', '88_92', 'ge93_air', '93_94_o2', '95_96_o2', 'ge97_o2']), OX,
    item('sbp', 'Systolic blood pressure'), item('pulse', 'Pulse'), AC, item('temp', 'Temperature')] }
const ctx: Ctx = { departmentId: 'ward', services: [], templates: [], departments: [], problems: [], scores: [N1, N2], packs: ['bedside'] }

const drafts = (line: string, c: Ctx = ctx): Parsed[] => { const r = parse(line, c); assert.ok(r && 'ok' in r, `${line} → ${JSON.stringify(r)}`); return r.ok }
const err = (line: string, c: Ctx = ctx) => { const r = parse(line, c); assert.ok(r && 'error' in r, `${line} should be refused, got ${JSON.stringify(r)}`); return r.error }
const score = (ps: Parsed[]) => ps[1].params as unknown as ScoreParams
const FULL = { rr: '22', spo2: '94', oxygen: 'air', sbp: '105', pulse: '104', consciousness: 'a', temp: '38.4' }

test('/obs is offered only where the department uses Ward nursing; elsewhere typing it says where', () => {
  assert.ok(commandsFor({ packs: ['bedside'] }).some((c) => c.name === 'obs'))
  assert.ok(!commandsFor({ packs: [] }).some((c) => c.name === 'obs'))
  assert.equal(err('/obs 105/68 104 38.4 94 22 air a', { ...ctx, packs: [], usedIn: () => ['Medical Ward'] }), '/obs is used in: Medical Ward')
})
test('the line of the picture: the base\'s vitals and NEWS2, everything answered', () => {
  const ps = drafts('/obs 105/68 104 38.4 94 22 air a')
  assert.equal(ps.length, 2)
  assert.deepEqual(ps[0].params, { systolic: 105, diastolic: 68, pulse: 104, temperature: 38.4, spo2: 94, respiratory_rate: 22 })
  assert.equal(ps[0].line, 'BP 105/68 · P 104 · T 38.4 · SpO₂ 94 · RR 22'); assert.equal(ps[0].action, 'write:vitals'); assert.equal(ps[0].function, 'vitals')
  const p = score(ps)
  assert.equal(p.score, NEWS2); assert.equal(p.version, '2017'); assert.deepEqual(p.inputs, FULL); assert.equal(ps[1].action, 'write:score'); assert.equal(p.result, null)
})
test('by name and in any order; each word of ACVPU and of oxygen; glued names', () => {
  const p = score(drafts('/obs rr 22 spo2 94 bp 105/68 p 104 t 38.4 oxygen v'))
  assert.deepEqual(p.inputs, { ...FULL, oxygen: 'oxygen', consciousness: 'v' })
  const word = (w: string) => score(drafts(`/obs 105/68 ${w}`)).inputs
  assert.equal(word('pain').consciousness, 'p'); assert.equal(word('confused').consciousness, 'c'); assert.equal(word('unresponsive').consciousness, 'u')
  assert.equal(word('alert').consciousness, 'a'); assert.equal(word('ox').oxygen, 'oxygen'); assert.equal(word('p 90').pulse, '90', 'a bare p is the pulse')
  const g = drafts('/obs 105/68 p104 rr22 spo294 t38.4 air a')
  assert.deepEqual(g[0].params, { systolic: 105, diastolic: 68, pulse: 104, temperature: 38.4, spo2: 94, respiratory_rate: 22 }); assert.deepEqual(score(g).inputs, FULL)
})
test('s2: SpO₂ scale 2, its answer from the saturation and air or oxygen', () => {
  const ps = drafts('/obs 132/80 96 37.1 91 20 oxygen a s2'); const p = score(ps)
  assert.equal(p.score, NEWS2_S2); assert.equal(p.inputs.spo2_s2, '88_92'); assert.equal(p.inputs.spo2, undefined); assert.equal(ps[0].params.spo2, 91, 'the vitals keep the number')
  const cases: [number, 'air' | 'oxygen' | undefined, string | undefined][] = [[80, undefined, 'le83'], [83, 'air', 'le83'], [84, undefined, '84_85'], [85, 'oxygen', '84_85'],
    [86, undefined, '86_87'], [87, undefined, '86_87'], [88, undefined, '88_92'], [92, 'oxygen', '88_92'], [93, 'air', 'ge93_air'], [99, 'air', 'ge93_air'],
    [93, 'oxygen', '93_94_o2'], [94, 'oxygen', '93_94_o2'], [95, 'oxygen', '95_96_o2'], [96, 'oxygen', '95_96_o2'], [97, 'oxygen', 'ge97_o2'], [100, 'oxygen', 'ge97_o2'],
    [95, undefined, undefined], [93, undefined, undefined]]
  for (const [s, o, want] of cases) assert.equal(scale2Choice(s, o), want, `${s} ${o ?? '?'}`)
  assert.equal(score(drafts('/obs 132/80 96 37.1 95 20 s2')).inputs.spo2_s2, undefined, 'not known yet: the card asks')
  assert.equal(err('/obs 132/80 s2', { ...ctx, scores: [N1] }), 'NEWS2 is not declared here: Settings → Scores')
})
test('what /obs refuses, and why, in words', () => {
  assert.match(err('/obs 105/68 104 22 38.4 94'), /T 22 is not plausible/)
  assert.equal(err('/obs 105/68 104 22 38.4 94'), 'T 22 is not plausible — after the BP the order is P T SpO₂ RR, or name each value (p 104 t 38.4 spo2 94 rr 22)')
  assert.equal(err('/obs 105/68 38.4'), '38.4 in the P place: after the BP the order is P T SpO₂ RR — or name it (t 38.4)', 'the pulse forgotten')
  assert.equal(err('/obs 105/68 104 38.4 94.5'), 'SpO₂ 94.5 is not a whole number'); assert.equal(err('/obs 105/68 p 104.5'), 'P 104.5 is not a whole number')
  assert.equal(err('/obs 105/68 t 384'), 'T 384 is not plausible'); assert.equal(err('/obs 105/68 spo2 101'), 'SpO₂ 101 is not plausible')
  assert.equal(err('/obs 105/68 rr 0'), 'RR 0 is not plausible'); assert.equal(err('/obs 105/68 rr250'), 'RR 250 is not plausible')
  assert.match(err('/obs 105/68 o2 94'), /spo2 94 .*oxygen/)
  assert.match(err('/obs 105/68 fine'), /^Not an obs: “fine”/)
  assert.equal(err('/obs 104 105/68'), '104: type the BP first (105/68 104 38.4 94 22), or say what it is (p 104)')
  assert.equal(err('/obs 105/68 air air'), 'Air or oxygen said twice'); assert.equal(err('/obs 105/68 a v'), 'ACVPU said twice')
  assert.equal(err('/obs 105/68 104 38.4 94 22 18'), 'Too many numbers after the BP: 18')
  assert.equal(err('/obs 105/68 104 38.4 94 22 p 110'), 'P said twice', 'a value typed twice never replaces the first')
  assert.equal(err('/obs 105/68 104 38.4 94 22 120/80'), 'BP said twice'); assert.equal(err('/obs bp 105/68 bp 110/70'), 'BP said twice')
  assert.equal(err('/obs 105/68 rr 22 rr22'), 'RR said twice'); assert.equal(err('/obs 105/68 t 38.4 temp 38.5'), 'T said twice')
  for (const w of ['__proto__', 'constructor', 'tostring', 'hasownproperty']) assert.match(err(`/obs 105/68 ${w}`), /^Not an obs/, `${w} is not a word of /obs`)
  assert.equal(err('/obs bp 105'), 'BP needs both sides: bp 120/80'); assert.equal(err('/obs 105/68 p'), 'P needs a number')
  assert.equal(err('/obs 105/68 rr fast'), 'RR needs a number')
})
test('no number yet: nothing; a BP alone gives only the systolic to NEWS2', () => {
  assert.equal(obsLine('air a', ctx), null); assert.equal(parse('/obs air a', ctx), null); assert.equal(parse('/obs', ctx), null)
  const ps = drafts('/obs 105/68'); assert.deepEqual(ps[0].params, { systolic: 105, diastolic: 68 }); assert.deepEqual(score(ps).inputs, { sbp: '105' })
})

/** a copy without one key: a value cleared on a card */
const without = <T extends Record<string, unknown>>(o: T, k: string): T => Object.fromEntries(Object.entries(o).filter(([x]) => x !== k)) as T
/** the server's answer, as core.score sends it, for what the card holds */
const answered = (ps: Parsed[], total: number, band: string, threes: string[] = []): Parsed[] => {
  const p = score(ps); const t = p.score === NEWS2 ? N1 : N2
  const r: ScoreResult = { score: t.key, version: t.version, retired: false, items: t.items.map((i) => ({ key: i.key, points: threes.includes(i.key) ? 3 : 0 })), so_far: total, total,
    complete: true, band: t.bands.find((b) => b.key === band) ?? null, missing: [], problems: [] }
  return [ps[0], { ...ps[1], params: { ...p, result: { ...r, for: keyOf(p) } } as unknown as Record<string, unknown> }]
}
test('the notes under the cards: RCP 2017\'s response once the server has added it up; scale 2, pregnancy, and cards that disagree', () => {
  const ps = drafts('/obs 105/68 104 38.4 94 22 air a')
  assert.deepEqual(obsNotes(ps, ctx), [], 'nothing before the server answers')
  assert.deepEqual(obsNotes(answered(ps, 6, 'medium'), ctx), [{ text: 'NEWS2 6 · medium · urgent response: obs every hour; tell the doctor now', tone: 'warn' }])
  assert.deepEqual(obsNotes(answered(ps, 8, 'high'), ctx), [{ text: 'NEWS2 8 · high · emergency response: watch continuously; tell the doctor now; think of ICU', tone: 'danger' }])
  assert.deepEqual(obsNotes(answered(ps, 0, 'low'), ctx), [{ text: 'NEWS2 0 · obs at least every 12 hours' }])
  assert.deepEqual(obsNotes(answered(ps, 2, 'low'), ctx), [{ text: 'NEWS2 2 · low · obs every 4–6 hours; tell the nurse in charge' }])
  assert.deepEqual(obsNotes(answered(ps, 3, 'low', ['rr']), ctx), [{ text: '3 in one sign (Respiration rate) · obs every hour; tell the doctor caring for the patient', tone: 'warn' }])
  const stale = answered(ps, 6, 'medium'); (stale[1].params as unknown as ScoreParams).inputs = { ...FULL, pulse: '120' }
  assert.ok(!obsNotes(stale, ctx).some((x) => x.text.startsWith('NEWS2 6')), 'an answer for other inputs says nothing')
  const preg = { ...ctx, facts: { pregnancy: { entry_id: 'f1', data: { pregnant: true }, words: 'Pregnant' }, breastfeeding: null, alerts: [] } }
  assert.deepEqual(obsNotes(ps, preg), [{ text: 'Pregnant: NEWS2 is not made for pregnancy — read it with care', tone: 'warn' }])
  assert.deepEqual(obsNotes(drafts('/obs 132/80 96 37.1 91 20 oxygen a s2'), ctx), [{ text: 'SpO₂ scale 2: only for a patient whose doctor set a target of 88–92 % (hypercapnic respiratory failure)' }])
  const edited = [{ ...ps[0], params: { ...ps[0].params, pulse: 100 } }, ps[1]]
  assert.deepEqual(obsNotes(edited, ctx), [{ text: 'The Pulse on the vitals (100) and on NEWS2 (104) differ: type the line again', tone: 'warn' }])
  assert.deepEqual(obsNotes([{ ...ps[0], params: without(ps[0].params, 'pulse') }, ps[1]], ctx), [{ text: 'The Pulse is on NEWS2 (104) but not on the vitals: type the line again', tone: 'warn' }])
  assert.deepEqual(obsNotes([ps[0], { ...ps[1], params: { ...ps[1].params, inputs: without(score(ps).inputs, 'temp') } }], ctx),
    [{ text: 'The Temperature is on the vitals (38.4) but not on NEWS2: type the line again', tone: 'warn' }])
  assert.deepEqual(obsNotes(drafts('/obs 105/68 air a'), ctx), [], 'a line that leaves values out: the card asks, nothing differs')
})
test('scale 2: its SpO₂ answer must fit air or oxygen, and the saturation on the vitals', () => {
  const REMIND = { text: 'SpO₂ scale 2: only for a patient whose doctor set a target of 88–92 % (hypercapnic respiratory failure)' }
  const ps = drafts('/obs 132/80 96 37.1 95 20 oxygen a s2'); assert.equal(score(ps).inputs.spo2_s2, '95_96_o2')
  const withInputs = (more: Record<string, string>) => [ps[0], { ...ps[1], params: { ...ps[1].params, inputs: { ...score(ps).inputs, ...more } } }]
  assert.deepEqual(obsNotes(ps, ctx), [REMIND])
  assert.deepEqual(obsNotes(withInputs({ oxygen: 'air' }), ctx), [REMIND,
    { text: 'NEWS2\'s SpO₂ answer (95_96_o2) does not fit its air or oxygen answer (air): choose again', tone: 'warn' }], 'oxygen flipped to air on the card')
  assert.deepEqual(obsNotes(withInputs({ spo2_s2: 'ge93_air' }), ctx), [REMIND,
    { text: 'NEWS2\'s SpO₂ answer (ge93_air) does not fit its air or oxygen answer (oxygen): choose again', tone: 'warn' }], '≥ 93 on air for a patient on oxygen')
  assert.deepEqual(obsNotes(withInputs({ spo2_s2: '88_92' }), ctx), [REMIND,
    { text: 'The SpO₂ on the vitals (95) and NEWS2\'s scale 2 answer (88_92) differ: type the line again', tone: 'warn' }])
  const edited = [{ ...ps[0], params: { ...ps[0].params, spo2: 91 } }, ps[1]]
  assert.deepEqual(obsNotes(edited, ctx), [REMIND, { text: 'The SpO₂ on the vitals (91) and NEWS2\'s scale 2 answer (95_96_o2) differ: type the line again', tone: 'warn' }])
  assert.deepEqual(obsNotes([{ ...ps[0], params: without(ps[0].params, 'spo2') }, ps[1]], ctx), [REMIND, { text: 'The SpO₂ is on NEWS2 (95_96_o2) but not on the vitals: type the line again', tone: 'warn' }])
  assert.deepEqual(obsNotes(drafts('/obs 132/80 96 37.1 95 20 s2'), ctx), [REMIND], 'air or oxygen not said yet: the card asks')
})

// the record: a stay open on the ward, NEWS2 in it as the base's score
const scoresOrg = { ...org, scores: [N1, N2] } as Organization
const cx = { ...chartCtx, org: scoresOrg }
const identity = { gender: 'female', birth_date: '1963-05-01' } as Identity
const at = (h: number) => new Date(Date.parse('2026-10-08T06:00:00Z') + h * 3_600_000).toISOString()
const news = (total: number, band: string, h: number, more: Partial<ServerEntry> = {}, key = NEWS2) =>
  E('score', { visit_id: 'st1', occurred_at: at(h), data: { score: key, version: '2017', inputs: {}, total, band }, ...more })
const open = record({ 'base.presence': table([presence('st1', { kind: 'stay', state: 'admitted', department_id: 'ward' })]) })
const closed = record({ 'base.presence': table([presence('st1', { kind: 'stay', state: 'discharged', department_id: 'ward' })]) })
const input = (es: ServerEntry[], rec = open): SectionInput => ({ rec, ctx: cx, identity, own: ownOf(es, ['score']) })

test('the banner\'s word: the open stay\'s latest NEWS2, amber at 5–6, red at 7 or more; GCS and other stays say nothing', () => {
  assert.deepEqual(news2Words(input([news(2, 'low', 0), news(6, 'medium', 2)])), [{ word: 'NEWS2 6', rank: 1, tone: 'warn' }])
  assert.deepEqual(news2Words(input([news(8, 'high', 0, {}, NEWS2_S2)])), [{ word: 'NEWS2 8', rank: 1, tone: 'danger' }])
  assert.deepEqual(news2Words(input([news(3, 'low', 0)])), [{ word: 'NEWS2 3', rank: 1 }])
  const gcs = E('score', { visit_id: 'st1', occurred_at: at(5), data: { score: 'gcs', version: '1974', inputs: {}, total: 9, band: 'moderate' } })
  assert.deepEqual(news2Words(input([news(3, 'low', 0), gcs])), [{ word: 'NEWS2 3', rank: 1 }], 'a GCS is not NEWS2')
  assert.deepEqual(news2Words(input([news(6, 'medium', 0)], closed)), [], 'NEWS2 only in a stay that ended')
  assert.deepEqual(news2Words(input([news(6, 'medium', 0, { visit_id: 'older' })])), [], 'NEWS2 only in another stay')
  assert.deepEqual(news2Words(input([])), [])
  const child = { ...input([news(8, 'high', 0)]), identity: { gender: 'male', birth_date: `${new Date().getFullYear() - 10}-01-01` } as Identity }
  assert.deepEqual(news2Words(child), [{ word: 'NEWS2 8', rank: 1 }], 'under 16: the bands are for adults, so no colour')
})
test('the section\'s chip and Summary line: the stay\'s trend; else the latest of any stay, with its day', () => {
  const es = [news(2, 'low', 0), news(3, 'low', 4), news(6, 'medium', 8)]
  assert.deepEqual(news2Chip(input(es)), { word: 'NEWS2 6', tone: 'warn' })
  const today = new Date(at(10))
  assert.equal(news2Summary(input(es), today), `NEWS2 6 · Medium · ${hm(at(8))} · 2 → 6 this stay`)
  assert.equal(news2Summary(input([news(6, 'medium', 8)]), today), `NEWS2 6 · Medium · ${hm(at(8))}`, 'one in the stay: no trend')
  assert.equal(news2Summary(input([news(3, 'low', -20)]), today), `NEWS2 3 · Low · ${shortDate(at(-20))} ${hm(at(-20))}`, 'the day before: its day too')
  const before = input([news(3, 'low', 0, { visit_id: 'older' })], closed)
  assert.ok(news2Summary(before)!.startsWith('NEWS2 3 · Low · ')); assert.deepEqual(news2Chip(before), { word: 'NEWS2 3' })
  assert.deepEqual(news2Chip(input([news(7, 'high', 0)], closed)), { word: 'NEWS2 7' }, 'no colour for a stay that ended')
  assert.equal(news2Summary(input([news(3, 'low', 0, {}, NEWS2_S2)]), today), `NEWS2 3 · Low · scale 2 · ${hm(at(0))}`)
  assert.equal(news2Chip(input([])), null); assert.equal(news2Summary(input([])), null)
})
test('the tile: a stay with no obs yet says so, amber after an hour; obs taken, or a visit, says nothing', () => {
  const NOW = Date.parse('2026-10-08T12:00:00Z'); const ago = (m: number) => new Date(NOW - m * 60_000).toISOString()
  const row = (m: number, more = {}) => presence('st9', { kind: 'stay', state: 'admitted', department_id: 'ward', checked_in_at: ago(m), has_vitals: false, ...more })
  assert.deepEqual(obsTileLine(row(90), NOW), { words: [{ text: 'no obs for 1 h', tone: 'warn' }] }, 'late: the words say so, not only the colour')
  assert.deepEqual(obsTileLine(row(60), NOW), { words: [{ text: 'no obs for 1 h', tone: 'warn' }] })
  assert.deepEqual(obsTileLine(row(185), NOW), { words: [{ text: 'no obs for 3 h', tone: 'warn' }] })
  assert.deepEqual(obsTileLine(row(59), NOW), { words: ['no obs yet'] }); assert.deepEqual(obsTileLine(row(20), NOW), { words: ['no obs yet'] })
  assert.equal(obsTileLine(row(90, { has_vitals: true }), NOW), null)
  assert.equal(obsTileLine(row(90, { kind: 'visit', state: 'with' }), NOW), null)
  assert.equal(obsTileLine(row(90, { state: 'discharged' }), NOW), null)
  const tile = (packs: string[]): TileCtx => ({ dept: { id: 'ward', packs }, place: null, identity: null, day: 1, can: () => true })
  const lines = [{ pack: 'bedside', line: (r: Parameters<typeof obsTileLine>[0]) => obsTileLine(r, NOW) }]
  assert.deepEqual(tileLineOf(lines, row(90), tile(['bedside'])), [{ pack: 'bedside', words: [{ text: 'no obs for 1 h', tone: 'warn' }] }])
  assert.deepEqual(tileLineOf(lines, row(90), tile([])), [], 'only where the ward uses the pack')
})
console.log(`bedside: ${n} groups passed`)
