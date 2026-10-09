// Ward nursing on the base's /v (spec/openCare.md §5.6; the owner's C3, Q5 and C1, 2026-10-08): /obs is gone; where a department uses
// the pack, /v with NEWS2's five signs also gives NEWS2 as the base's score, its two answers the vitals' own air or oxygen and ACVPU, and
// derived again when the vitals change on the card. The notes under the cards (RCP 2017's response), the banner's word, the section's
// chip and Summary line, and the tile's "NEWS2 n" from the board's read, or "no obs yet". Pure: no browser, no database.   npm run test:bedside
import assert from 'node:assert/strict'
import { setClinicTimeZone, hm, shortDate } from '../src/core/ui/time'
import '../src/packs/bedside/obs'
import { NEWS2, NEWS2_S2, news2From, obsNotes, scale2Choice } from '../src/packs/bedside/line'
import { news2Chip, news2Summary, news2Words, obsTileLine, tileWords, type News2Board } from '../src/packs/bedside/news2'
import { parse, type Ctx, type Parsed } from '../src/core/screens/visit/parse'
import { commandNamed, commandsFor } from '../src/core/screens/visit/commands'
import { keyOf, type ScoreParams, type ScoreResult } from '../src/core/screens/visit/score'
import { ownOf, type SectionInput } from '../src/core/screens/chart/sections'
import { tileLineOf, type TileCtx } from '../src/core/screens/ward/tiles'
import { E, ctx as chartCtx, org, presence, record, table } from './chart-fixtures'
import type { Identity, Organization, PresenceRow, ScoreItem, ScoreTable, ServerEntry } from '../src/core/db/types'

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
const LINE = '105/68 104 38.4 spo2 94 rr 22 air a'
const FULL = { rr: '22', spo2: '94', oxygen: 'air', sbp: '105', pulse: '104', consciousness: 'a', temp: '38.4' }
/** a copy without one key: a value cleared on a card */
const without = <T extends Record<string, unknown>>(o: T, k: string): T => Object.fromEntries(Object.entries(o).filter(([x]) => x !== k)) as T
/** a draft with some params changed, as a card changes them */
const withParams = (p: Parsed, more: Record<string, unknown>): Parsed => ({ ...p, params: { ...p.params, ...more } })
const withInputs = (p: Parsed, more: Record<string, string>): Parsed => withParams(p, { inputs: { ...(p.params as unknown as ScoreParams).inputs, ...more } })

test('/obs is gone: the ward types /v, which writes the vitals and NEWS2 there', () => {
  assert.equal(err(`/obs ${LINE}`), 'No command /obs — type / to see them')
  assert.ok(!commandsFor({ packs: ['bedside'] }).some((c) => c.name === 'obs'))
  assert.deepEqual(commandsFor({ packs: ['bedside'] }).find((c) => c.name === 'v')?.writes, ['vitals', 'score'])
  assert.deepEqual(commandNamed('v', { packs: [] })?.writes, ['vitals'], 'elsewhere the vitals alone')
})
test('the ward\'s line: the base\'s vitals with air and ACVPU, and NEWS2 from them, everything answered', () => {
  const ps = drafts(`/v ${LINE}`)
  assert.equal(ps.length, 2)
  assert.deepEqual(ps[0].params, { systolic: 105, diastolic: 68, pulse: 104, temperature: 38.4, spo2: 94, respiratory_rate: 22, oxygen: 'air', consciousness: 'a' })
  assert.equal(ps[0].line, 'BP 105/68 · P 104 · T 38.4 · SpO₂ 94 · Air · RR 22 · ACVPU A'); assert.equal(ps[0].action, 'write:vitals'); assert.equal(ps[0].by, undefined)
  const p = score(ps)
  assert.equal(p.score, NEWS2); assert.equal(p.version, '2017'); assert.deepEqual(p.inputs, FULL); assert.equal(ps[1].action, 'write:score'); assert.equal(ps[1].by, 'bedside')
  assert.equal(p.result, null)
  assert.deepEqual(score(drafts('/v rr 22 spo2 94 bp 105/68 p 104 t 38.4 oxygen 2l nasal v')).inputs, { ...FULL, oxygen: 'oxygen', consciousness: 'v' }, 'by name, in any order')
})
test('not here: a department that does not use Ward nursing, or none known, gets the vitals only', () => {
  assert.equal(drafts(`/v ${LINE}`, { ...ctx, packs: [] }).length, 1); assert.equal(drafts(`/v ${LINE}`, { ...ctx, packs: undefined }).length, 1)
})
test('the five signs: a partial /v writes plain vitals; without its two answers NEWS2 is still drafted, and asks', () => {
  assert.equal(drafts('/v 105/68 104 38.4').length, 1); assert.equal(drafts('/v w 70').length, 1); assert.equal(drafts('/v spo2 94 rr 22 air a').length, 1)
  const ps = drafts('/v 105/68 104 38.4 spo2 94 rr 22'); assert.equal(ps.length, 2)
  assert.deepEqual(score(ps).inputs, without(without(FULL, 'oxygen'), 'consciousness'))
})
test('s2: SpO₂ scale 2, its answer from the saturation and air or oxygen; s2 is no word elsewhere', () => {
  const ps = drafts('/v 132/80 96 37.1 spo2 91 rr 20 oxygen a s2'); const p = score(ps)
  assert.equal(p.score, NEWS2_S2); assert.equal(p.inputs.spo2_s2, '88_92'); assert.equal(p.inputs.spo2, undefined); assert.equal(ps[0].params.spo2, 91, 'the vitals keep the number')
  assert.equal(score(drafts('/v 132/80 96 37.1 spo2 91 rr 20 oxygen a SCALE2')).score, NEWS2_S2)
  assert.match(err('/v 132/80 s2', { ...ctx, packs: [] }), /^Not a vital: “s2”/)
  const cases: [number, 'air' | 'oxygen' | undefined, string | undefined][] = [[80, undefined, 'le83'], [83, 'air', 'le83'], [84, undefined, '84_85'], [85, 'oxygen', '84_85'],
    [86, undefined, '86_87'], [87, undefined, '86_87'], [88, undefined, '88_92'], [92, 'oxygen', '88_92'], [93, 'air', 'ge93_air'], [99, 'air', 'ge93_air'],
    [93, 'oxygen', '93_94_o2'], [94, 'oxygen', '93_94_o2'], [95, 'oxygen', '95_96_o2'], [96, 'oxygen', '95_96_o2'], [97, 'oxygen', 'ge97_o2'], [100, 'oxygen', 'ge97_o2'],
    [95, undefined, undefined], [93, undefined, undefined]]
  for (const [s, o, want] of cases) assert.equal(scale2Choice(s, o), want, `${s} ${o ?? '?'}`)
  assert.equal(score(drafts('/v 132/80 96 37.1 spo2 95 rr 20 s2')).inputs.spo2_s2, undefined, 'not known yet: the card asks')
})
test('again: a change on the vitals card derives NEWS2 anew; what NEWS2\'s card chose is kept while the vitals lack it', () => {
  const v = commandNamed('v', ctx)!; const ps = drafts(`/v ${LINE}`)
  assert.equal(score(v.again!([withParams(ps[0], { pulse: 100 }), ps[1]], LINE, ctx)).inputs.pulse, '100')
  assert.equal(v.again!([withParams(ps[0], { weight: 70 }), ps[1]], LINE, ctx)[1], ps[1], 'the same NEWS2 (its server answer kept)')
  const bare = drafts('/v 105/68 104 38.4 spo2 94 rr 22'); const chose = [bare[0], withInputs(bare[1], { consciousness: 'v' })]
  assert.equal(score(v.again!([withParams(bare[0], { pulse: 100 }), chose[1]], '', ctx)).inputs.consciousness, 'v', 'chosen on NEWS2: kept')
  assert.equal(score(v.again!([withParams(bare[0], { consciousness: 'a' }), chose[1]], '', ctx)).inputs.consciousness, 'a', 'the vitals win once they say it')
  assert.deepEqual(v.again!([withParams(ps[0], { pulse: 100 }), ps[1]], LINE, ctx, ['bedside']).map((x) => x.function), ['vitals'], 'left out: stays out')
  const s2 = drafts('/v 132/80 96 37.1 spo2 91 rr 20 oxygen a s2')
  assert.equal(score(v.again!([withParams(s2[0], { pulse: 100 }), s2[1]], '', ctx)).score, NEWS2_S2, 'scale 2 sticks')
  // scale 2's answer follows the saturation: oxygen chosen on NEWS2's card, the SpO₂ then changed on the vitals card
  const s90 = drafts('/v 132/80 96 37.1 spo2 90 rr 20 a s2'); assert.equal(score(s90).inputs.spo2_s2, '88_92')
  const ox = withInputs(s90[1], { oxygen: 'oxygen' })
  assert.equal(score(v.again!([withParams(s90[0], { spo2: 97 }), ox], '', ctx)).inputs.spo2_s2, 'ge97_o2', 'from the new saturation and the oxygen kept')
  assert.equal(score(v.again!([withParams(s90[0], { spo2: 95 }), s90[1]], '', ctx)).inputs.spo2_s2, undefined, 'an answer that no longer fits is not kept: the card asks')
  const chose95 = withInputs(drafts('/v 132/80 96 37.1 spo2 95 rr 20 a s2')[1], { spo2_s2: '95_96_o2' })
  assert.equal(score(v.again!([withParams(s90[0], { spo2: 96 }), chose95], '', ctx)).inputs.spo2_s2, '95_96_o2', 'one that still fits is kept')
  assert.deepEqual(v.again!([ps[1]], LINE, ctx), [], 'the vitals removed: no NEWS2')
  assert.deepEqual(v.again!([withParams(ps[0], { respiratory_rate: undefined }), ps[1]], LINE, ctx).length, 1, 'a sign cleared: no NEWS2')
  assert.deepEqual(news2From([ps[0]], ctx, { said: [], prev: [] }).map((x) => x.function), ['score'])
})
test('a role without write:score, or no NEWS2 declared: the vitals go alone, and say why', () => {
  const nurse = { ...ctx, can: (a: string) => a !== 'write:score' }
  const ps = drafts(`/v ${LINE}`, nurse); assert.equal(ps.length, 1)
  assert.deepEqual(obsNotes(ps, nurse), [{ text: 'NEWS2 is not for your role here: the vitals go alone' }])
  const none = { ...ctx, scores: [] }; const qs = drafts(`/v ${LINE}`, none); assert.equal(qs.length, 1)
  assert.deepEqual(obsNotes(qs, none), [{ text: 'NEWS2 is not declared here: Settings → Scores', tone: 'warn' }])
})

/** the server's answer, as core.score sends it, for what the card holds */
const answered = (ps: Parsed[], total: number, band: string, threes: string[] = []): Parsed[] => {
  const p = score(ps); const t = p.score === NEWS2 ? N1 : N2
  const r: ScoreResult = { score: t.key, version: t.version, retired: false, items: t.items.map((i) => ({ key: i.key, points: threes.includes(i.key) ? 3 : 0 })), so_far: total, total,
    complete: true, band: t.bands.find((b) => b.key === band) ?? null, missing: [], problems: [] }
  return [ps[0], { ...ps[1], params: { ...p, result: { ...r, for: keyOf(p) } } as unknown as Record<string, unknown> }]
}
test('the notes under the cards: why no NEWS2, what it needs, RCP 2017\'s response once the server has added it up; pregnancy; cards that disagree', () => {
  const ps = drafts(`/v ${LINE}`)
  assert.deepEqual(obsNotes(ps, ctx), [], 'nothing before the server answers')
  assert.deepEqual(obsNotes(drafts('/v 120/80'), ctx), [{ text: 'No NEWS2 yet: it comes with BP, P, RR, T and SpO₂ — P, RR, T and SpO₂ to go (/v 105/68 104 38.4 spo2 94 rr 22 air a)' }])
  assert.deepEqual(obsNotes(drafts('/v 120/80 84 37 spo2 95'), ctx), [{ text: 'No NEWS2 yet: it comes with BP, P, RR, T and SpO₂ — RR to go (/v 105/68 104 38.4 spo2 94 rr 22 air a)' }])
  assert.deepEqual(obsNotes(drafts('/v w 70'), ctx), [], 'no sign at all: no word about NEWS2')
  const bare = drafts('/v 105/68 104 38.4 spo2 94 rr 22')
  assert.deepEqual(obsNotes(bare, ctx), [{ text: 'NEWS2 needs air or oxygen and ACVPU: choose on the vitals card, or say it on the line (air or oxygen · a, c, v, pain, u)' }])
  assert.deepEqual(obsNotes([bare[0], withInputs(bare[1], { consciousness: 'v' })], ctx), [{ text: 'NEWS2 needs air or oxygen: choose on the vitals card, or say it on the line (air or oxygen · a, c, v, pain, u)' },
    { text: 'The ACVPU is on NEWS2 (v) but not on the vitals: choose it on the vitals card too', tone: 'warn' }])
  assert.deepEqual(obsNotes(answered(ps, 6, 'medium'), ctx), [{ text: 'NEWS2 6 · medium · urgent response: obs every hour; tell the doctor now', tone: 'warn' }])
  assert.deepEqual(obsNotes(answered(ps, 8, 'high'), ctx), [{ text: 'NEWS2 8 · high · emergency response: watch continuously; tell the doctor now; think of ICU', tone: 'danger' }])
  assert.deepEqual(obsNotes(answered(ps, 0, 'low'), ctx), [{ text: 'NEWS2 0 · obs at least every 12 hours' }])
  assert.deepEqual(obsNotes(answered(ps, 2, 'low'), ctx), [{ text: 'NEWS2 2 · low · obs every 4–6 hours; tell the nurse in charge' }])
  assert.deepEqual(obsNotes(answered(ps, 3, 'low', ['rr']), ctx), [{ text: '3 in one sign (Respiration rate) · obs every hour; tell the doctor caring for the patient', tone: 'warn' }])
  const stale = answered(ps, 6, 'medium'); (stale[1].params as unknown as ScoreParams).inputs = { ...FULL, pulse: '120' }
  assert.ok(!obsNotes(stale, ctx).some((x) => x.text.startsWith('NEWS2 6')), 'an answer for other inputs says nothing')
  const preg = { ...ctx, facts: { pregnancy: { entry_id: 'f1', data: { pregnant: true }, words: 'Pregnant' }, breastfeeding: null, alerts: [] } }
  assert.deepEqual(obsNotes(ps, preg), [{ text: 'Pregnant: NEWS2 is not made for pregnancy — read it with care', tone: 'warn' }])
  assert.deepEqual(obsNotes(drafts('/v 132/80 96 37.1 spo2 91 rr 20 oxygen a s2'), ctx), [{ text: 'SpO₂ scale 2: only for a patient whose doctor set a target of 88–92 % (hypercapnic respiratory failure)' }])
  assert.deepEqual(obsNotes([withParams(ps[0], { pulse: 100 }), ps[1]], ctx), [{ text: 'The Pulse on the vitals (100) and on NEWS2 (104) differ: change it on the vitals card', tone: 'warn' }])
  assert.deepEqual(obsNotes([{ ...ps[0], params: without(ps[0].params, 'pulse') }, ps[1]], ctx), [
    { text: 'No NEWS2 yet: it comes with BP, P, RR, T and SpO₂ — P to go (/v 105/68 104 38.4 spo2 94 rr 22 air a)' },
    { text: 'The Pulse is on NEWS2 (104) but not on the vitals: choose it on the vitals card too', tone: 'warn' }])
  assert.deepEqual(obsNotes([ps[0], withParams(ps[1], { inputs: without(score(ps).inputs, 'temp') })], ctx),
    [{ text: 'The Temperature is on the vitals (38.4) but not on NEWS2', tone: 'warn' }])
  assert.deepEqual(obsNotes([withParams(ps[0], { oxygen: 'oxygen' }), ps[1]], ctx), [{ text: 'The Air or oxygen on the vitals (oxygen) and on NEWS2 (air) differ: change it on the vitals card', tone: 'warn' }])
})
test('scale 2: its SpO₂ answer must fit air or oxygen, and the saturation on the vitals', () => {
  const REMIND = { text: 'SpO₂ scale 2: only for a patient whose doctor set a target of 88–92 % (hypercapnic respiratory failure)' }
  const ps = drafts('/v 132/80 96 37.1 spo2 95 rr 20 oxygen a s2'); assert.equal(score(ps).inputs.spo2_s2, '95_96_o2')
  const s = (more: Record<string, string>) => [ps[0], withInputs(ps[1], more)]
  assert.deepEqual(obsNotes(ps, ctx), [REMIND])
  assert.deepEqual(obsNotes(s({ oxygen: 'air' }), ctx), [REMIND,
    { text: 'The Air or oxygen on the vitals (oxygen) and on NEWS2 (air) differ: change it on the vitals card', tone: 'warn' },
    { text: 'NEWS2\'s SpO₂ answer (95_96_o2) does not fit its air or oxygen answer (air): choose again', tone: 'warn' }], 'oxygen flipped to air on NEWS2\'s card')
  assert.deepEqual(obsNotes(s({ spo2_s2: 'ge93_air' }), ctx), [REMIND,
    { text: 'NEWS2\'s SpO₂ answer (ge93_air) does not fit its air or oxygen answer (oxygen): choose again', tone: 'warn' }], '≥ 93 on air for a patient on oxygen')
  assert.deepEqual(obsNotes(s({ spo2_s2: '88_92' }), ctx), [REMIND,
    { text: 'The SpO₂ on the vitals (95) and NEWS2\'s scale 2 answer (88_92) differ: change it on the vitals card', tone: 'warn' }])
  assert.deepEqual(obsNotes([withParams(ps[0], { spo2: 91 }), ps[1]], ctx), [REMIND, { text: 'The SpO₂ on the vitals (91) and NEWS2\'s scale 2 answer (95_96_o2) differ: change it on the vitals card', tone: 'warn' }])
  assert.deepEqual(obsNotes(drafts('/v 132/80 96 37.1 spo2 95 rr 20 a s2'), ctx), [REMIND,
    { text: 'NEWS2 needs air or oxygen: choose on the vitals card, or say it on the line (air or oxygen · a, c, v, pain, u)' }], 'air or oxygen not said yet: the card asks')
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
test('the tile: the stay\'s latest NEWS2 from the board\'s read, in its band\'s tone for an adult; else no obs yet, amber after an hour', () => {
  const NOW = Date.parse('2026-10-08T12:00:00Z'); const ago = (m: number) => new Date(NOW - m * 60_000).toISOString()
  const row = (m: number, more = {}) => presence('st9', { kind: 'stay', state: 'admitted', department_id: 'ward', checked_in_at: ago(m), has_vitals: false, ...more })
  assert.deepEqual(obsTileLine(row(90), NOW), { words: [{ text: 'no obs for 1 h', tone: 'warn' }] }, 'late: the words say so, not only the colour')
  assert.deepEqual(obsTileLine(row(60), NOW), { words: [{ text: 'no obs for 1 h', tone: 'warn' }] })
  assert.deepEqual(obsTileLine(row(185), NOW), { words: [{ text: 'no obs for 3 h', tone: 'warn' }] })
  assert.deepEqual(obsTileLine(row(59), NOW), { words: ['no obs yet'] }); assert.deepEqual(obsTileLine(row(20), NOW), { words: ['no obs yet'] })
  assert.equal(obsTileLine(row(90, { has_vitals: true }), NOW), null)
  assert.equal(obsTileLine(row(90, { kind: 'visit', state: 'with' }), NOW), null)
  assert.equal(obsTileLine(row(90, { state: 'discharged' }), NOW), null)
  const board = (total: number, band: string, item = 'st9'): News2Board => ({ patient_ids: ['pt'], news2: { [item]: { score: NEWS2, version: '2017', total, band, at: ago(30) } } })
  const tc = { org: scoresOrg, identity }; const seen = row(300, { has_vitals: true })
  assert.deepEqual(tileWords(seen, tc, board(6, 'medium'), NOW), { words: [{ text: 'NEWS2 6', tone: 'warn' }] })
  assert.deepEqual(tileWords(seen, tc, board(8, 'high'), NOW), { words: [{ text: 'NEWS2 8', tone: 'danger' }] })
  assert.deepEqual(tileWords(seen, tc, board(3, 'low'), NOW), { words: ['NEWS2 3'] })
  const child = { gender: 'male', birth_date: '2016-01-01' } as Identity
  assert.deepEqual(tileWords(seen, { ...tc, identity: child }, board(8, 'high'), NOW), { words: ['NEWS2 8'] }, 'under 16: no colour')
  assert.deepEqual(tileWords(seen, { ...tc, identity: null }, board(8, 'high'), NOW), { words: [{ text: 'NEWS2 8', tone: 'danger' }] }, 'an age not known fits')
  for (const d of [undefined, null, 'x', { news2: null }, board(6, 'medium', 'other')]) assert.deepEqual(tileWords(row(90), tc, d, NOW), { words: [{ text: 'no obs for 1 h', tone: 'warn' }] })
  assert.equal(tileWords(seen, tc, undefined, NOW), null, 'obs taken, the board not read yet: nothing')
  assert.deepEqual(tileWords(row(90, { state: 'discharged' }), tc, board(6, 'medium'), NOW), null, 'only an admitted stay')
  const tile = (packs: string[]): TileCtx => ({ dept: { id: 'ward', packs }, place: null, identity, day: 1, can: () => true, org: scoresOrg })
  const lines = [{ pack: 'bedside', line: (r: PresenceRow, c: TileCtx, d?: unknown) => tileWords(r, c, d, NOW) }]
  assert.deepEqual(tileLineOf(lines, seen, tile(['bedside']), { bedside: board(6, 'medium') }), [{ pack: 'bedside', words: [{ text: 'NEWS2 6', tone: 'warn' }] }])
  assert.deepEqual(tileLineOf(lines, row(90), tile(['bedside'])), [{ pack: 'bedside', words: [{ text: 'no obs for 1 h', tone: 'warn' }] }], 'before the board answers: the row alone')
  assert.deepEqual(tileLineOf(lines, row(90), tile([])), [], 'only where the ward uses the pack')
})
console.log(`bedside: ${n} groups passed`)
