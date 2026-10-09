// Ward nursing's obs due and the ward's NEWS2 response (spec/openCare.md §5.6, W1): the five levels as the server decides them, RCP
// 2017's response and a ward's own (its setting, level by level), the line under the cards with the next obs time, the tile's "obs due
// 15:06" / "obs overdue 20 min" right after NEWS2 (only for 16 and over), and the Obs due tab's order and its overdue count. Pure: no
// browser, no database.   npm run test:ward2
import assert from 'node:assert/strict'
import { setClinicTimeZone } from '../src/core/ui/time'
import '../src/packs/bedside/obs'
import { NEWS2, NEWS2_S2, obsNotes } from '../src/packs/bedside/line'
import { tileWords } from '../src/packs/bedside/news2'
import { RCP_2017, everyWords, levelOf, rulesIn, type Rules } from '../src/packs/bedside/response'
import { adultRules, dueOf, dueRows, dueWord, lateWords, withDueWord, type ObsDue } from '../src/packs/bedside/obsdue'
import { dueTime } from '../src/packs/bedside/response'
import { parse, type Ctx, type Parsed } from '../src/core/screens/visit/parse'
import { keyOf, type ScoreParams, type ScoreResult } from '../src/core/screens/visit/score'
import { tileLineOf, type TileCtx } from '../src/core/screens/ward/tiles'
import { org, presence } from './chart-fixtures'
import type { Identity, Organization, PresenceRow, ScoreItem, ScoreTable } from '../src/core/db/types'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }

// the two tables as the migration declares them: keys, labels and bands (the points are the server's), as test-bedside.ts has them
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
const scoresOrg = { ...org, scores: [N1, N2] } as Organization
const identity = { gender: 'female', birth_date: '1960-05-01' } as Identity
const child = { gender: 'male', birth_date: '2016-05-01' } as Identity

const LINE = '105/68 104 38.4 spo2 94 rr 22 air a'
const drafts = (line: string): Parsed[] => { const r = parse(line, ctx); assert.ok(r && 'ok' in r, `${line} → ${JSON.stringify(r)}`); return r.ok }
const score = (ps: Parsed[]) => ps[1].params as unknown as ScoreParams
/** the server's answer, as core.score sends it, for what the card holds (as test-bedside.ts builds it) */
const answered = (ps: Parsed[], total: number, band: string, threes: string[] = []): Parsed[] => {
  const p = score(ps); const t = p.score === NEWS2 ? N1 : N2
  const r: ScoreResult = { score: t.key, version: t.version, retired: false, items: t.items.map((i) => ({ key: i.key, points: threes.includes(i.key) ? 3 : 0 })), so_far: total, total,
    complete: true, band: t.bands.find((b) => b.key === band) ?? null, missing: [], problems: [] }
  return [ps[0], { ...ps[1], params: { ...p, result: { ...r, for: keyOf(p) } } as unknown as Record<string, unknown> }]
}

// 13:00 in Cairo (UTC+3 on 2026-10-09: summer time until 29 October)
const NOW = Date.parse('2026-10-09T10:00:00Z'); const at = (m: number) => new Date(NOW + m * 60_000).toISOString()
const due = (m: number, more: Partial<ObsDue> = {}): ObsDue => ({ score: NEWS2, version: '2017', total: 6, band: 'medium', at: at(m - 60), threes: [], level: 'medium', every: 60, due_at: at(m), ...more })

test('the levels, as the server decides them: the band first, then a 3 in one sign, then 0, else low', () => {
  assert.equal(levelOf(8, 'high', 1), 'high'); assert.equal(levelOf(6, 'medium', 0), 'medium'); assert.equal(levelOf(4, 'low', 1), 'single')
  assert.equal(levelOf(0, 'low', 0), 'zero'); assert.equal(levelOf(2, 'low', 0), 'low'); assert.equal(levelOf(7, 'high', 0), 'high'); assert.equal(levelOf(3, 'low', 1), 'single')
})
test('RCP 2017, as bedside.rcp_response() says it (the SQL suite pins the same literal on the server)', () => {
  assert.deepEqual(RCP_2017, { zero: { every: 720 }, low: { every: 240, tell: 'the nurse in charge' }, single: { every: 60, tell: 'the doctor caring for the patient' },
    medium: { every: 60, tell: 'the doctor now' }, high: { every: 30, tell: 'the doctor now · think of ICU' } })
})
test('the ward\'s rules: as saved, level by level; else the shape\'s defaults; else RCP\'s; a level saved with no tell has none', () => {
  const lvl = (every: number, tell?: string) => ({ type: 'object', additionalProperties: false, required: ['every'], properties: {
    every: { type: 'integer', minimum: 15, maximum: 1440, default: every }, tell: { type: 'string', maxLength: 80, ...(tell ? { default: tell } : {}) } } })
  const shape = { type: 'object', additionalProperties: false, required: ['zero', 'low', 'single', 'medium', 'high'], properties: { zero: lvl(720), low: lvl(240, 'the nurse in charge'),
    single: lvl(60, 'the doctor caring for the patient'), medium: lvl(60, 'the doctor now'), high: lvl(30, 'the doctor now · think of ICU') } }
  const settingKeys = [{ key: 'bedside.response', layer: 'bedside', owner_kind: 'department' as const, many: false, labels: { en: 'NEWS2 · the response' }, shape, fields: [], form: 'department' as const }]
  const of = (data?: Record<string, unknown>) => ({ settings: data ? [{ key: 'bedside.response', thing_id: 'ward', owner_id: 'ward', data, recorded_at: at(0) }] : [], settingKeys, datatypes: {} }) as Parameters<typeof rulesIn>[0]
  assert.deepEqual(rulesIn(undefined, 'ward'), RCP_2017)
  assert.deepEqual(rulesIn(of(), 'ward'), RCP_2017, 'nothing saved: the shape\'s defaults, RCP\'s')
  const saved = rulesIn(of({ low: { every: 360 }, medium: { every: 30, tell: ' Dr on call ' }, zero: { every: 720 }, single: { every: 60 }, high: { every: 15 } }), 'ward')
  assert.deepEqual(saved.low, { every: 360 }, 'a level saved with no tell: none (RCP\'s words do not come back)')
  assert.deepEqual(saved.medium, { every: 30, tell: 'Dr on call' }); assert.deepEqual(saved.single, { every: 60 }); assert.deepEqual(saved.high, { every: 15 })
  assert.deepEqual(rulesIn(of({ ...RCP_2017, low: { every: 5 }, high: { every: 2000 } }), 'ward').low, { every: 240 }, 'out of range: RCP\'s interval')
  assert.equal(rulesIn(of({ ...RCP_2017, high: { every: 2000 } }), 'ward').high.every, 30)
  assert.deepEqual(rulesIn(of({ low: { every: 360 } }), 'other'), RCP_2017, 'another department\'s: its own')
})
test('every in words', () => {
  assert.deepEqual([15, 30, 60, 90, 240, 720].map(everyWords), ['every 15 min', 'every 30 min', 'every hour', 'every 1 h 30 min', 'every 4 hours', 'every 12 hours'])
})
test('the line under the cards: the ward\'s response for the level in RCP\'s words, then when the next obs are due from now', () => {
  const ps = drafts(`/v ${LINE}`)
  const note = (total: number, band: string, threes: string[] = [], rules: Rules = RCP_2017) => obsNotes(answered(ps, total, band, threes), ctx, rules, NOW)
  assert.deepEqual(note(6, 'medium'), [{ text: 'NEWS2 6 · medium · urgent response: obs at least every hour; tell the doctor now · next obs due 14:00', tone: 'warn' }])
  assert.deepEqual(note(8, 'high', ['rr']), [{ text: 'NEWS2 8 · high · emergency response: watch continuously (obs at least every 30 min); tell the doctor now · think of ICU · next obs due 13:30', tone: 'danger' }])
  assert.deepEqual(note(0, 'low'), [{ text: 'NEWS2 0 · obs at least every 12 hours · next obs due tomorrow 01:00' }])
  assert.deepEqual(note(2, 'low'), [{ text: 'NEWS2 2 · low · obs at least every 4 hours; tell the nurse in charge · next obs due 17:00' }])
  assert.deepEqual(note(3, 'low', ['rr']), [{ text: '3 in one sign (Respiration rate) · obs at least every hour; tell the doctor caring for the patient · next obs due 14:00', tone: 'warn' }])
  assert.deepEqual(note(6, 'medium', [], { ...RCP_2017, medium: { every: 30, tell: 'Dr on call' } }),
    [{ text: 'NEWS2 6 · medium · urgent response: obs at least every 30 min; tell Dr on call · next obs due 13:30', tone: 'warn' }])
  assert.deepEqual(obsNotes(answered(ps, 2, 'low'), ctx), [{ text: 'NEWS2 2 · low · obs every 4–6 hours; tell the nurse in charge' }], 'no rules: piece 1\'s words')
  assert.deepEqual(obsNotes(ps, ctx, RCP_2017, NOW), [], 'nothing before the server answers')
  // NEWS2 is for 16 and over: a child's /v gets no ward rule and no due time (piece 1's words), an adult's and an age not known do
  const kid = { sex: 'male', born_on: '2016-05-01' }; const adult = { sex: 'female', born_on: '1960-05-01' }
  assert.equal(adultRules(RCP_2017, kid, NOW), undefined); assert.equal(adultRules(RCP_2017, adult, NOW), RCP_2017); assert.equal(adultRules(RCP_2017, undefined, NOW), RCP_2017)
  assert.equal(adultRules(undefined, adult, NOW), undefined)
  const kidNotes = obsNotes(answered(ps, 2, 'low'), ctx, adultRules(RCP_2017, kid, NOW), NOW)
  assert.deepEqual(kidNotes, [{ text: 'NEWS2 2 · low · obs every 4–6 hours; tell the nurse in charge' }], 'a child: no "next obs due"')
  assert.ok(!kidNotes.some((x) => x.text.includes('next obs due')))
})
test('the obs due of a stay from the board\'s data: malformed, none', () => {
  const good = due(10)
  for (const d of [undefined, null, 'x', { obs: null }, { obs: { other: good } }, { obs: { st9: { ...good, due_at: 'soon' } } }, { obs: { st9: { ...good, level: 'nope' } } }])
    assert.equal(dueOf(d, 'st9'), undefined, JSON.stringify(d))
  assert.equal(dueOf({ obs: { st9: good } }, 'st9'), good)
})
test('the due word: due at a time ("tomorrow" on the next clinic day), else overdue by how long, in amber', () => {
  assert.deepEqual(dueWord(due(10), NOW), { text: 'obs due 13:10' })
  assert.deepEqual(dueWord(due(0), NOW), { text: 'obs due 13:00' }, 'due now: still due')
  assert.deepEqual(dueWord(due(-1), NOW), { text: 'obs overdue 1 min', tone: 'warn' })
  assert.deepEqual([-20, -120, -130].map((m) => dueWord(due(m), NOW).text), ['obs overdue 20 min', 'obs overdue 2 h', 'obs overdue 2 h 10 min'])
  assert.deepEqual([20, 120, 130].map(lateWords), ['20 min', '2 h', '2 h 10 min'])
  assert.deepEqual(dueWord(due(0, { due_at: '2026-10-09T22:30:00Z' }), NOW), { text: 'obs due tomorrow 01:30' })
  assert.equal(dueTime(Date.parse('2026-10-09T20:59:00Z'), NOW), '23:59'); assert.equal(dueTime(Date.parse('2026-10-09T21:00:00Z'), NOW), 'tomorrow 00:00')
  // due a moment before midnight, read just after it (under a minute late, so still "due"): its time, never "tomorrow"
  assert.equal(dueTime(Date.parse('2026-10-09T20:59:30Z'), Date.parse('2026-10-09T21:00:10Z')), '23:59')
  assert.deepEqual(dueWord(due(0, { due_at: '2026-10-09T20:59:30Z' }), Date.parse('2026-10-09T21:00:10Z')), { text: 'obs due 23:59' })
})
const row = (more: Partial<PresenceRow> = {}) => presence('st9', { kind: 'stay', state: 'admitted', department_id: 'ward', checked_in_at: at(-300), has_vitals: true, ...more })
test('the tile: the due word right after NEWS2, whatever follows it; only an admitted adult\'s stay with obs due', () => {
  const data = { obs: { st9: due(-20) } }; const late = { text: 'obs overdue 20 min', tone: 'warn' }
  assert.deepEqual(withDueWord({ words: [{ text: 'NEWS2 6', tone: 'warn' }] }, row(), { identity }, data, NOW), { words: [{ text: 'NEWS2 6', tone: 'warn' }, late] })
  assert.deepEqual(withDueWord({ words: [{ text: 'NEWS2 6', tone: 'warn' }, { text: '1 dose late', tone: 'danger' }] }, row(), { identity }, data, NOW),
    { words: [{ text: 'NEWS2 6', tone: 'warn' }, late, { text: '1 dose late', tone: 'danger' }] }, 'the picture\'s order: NEWS2 · obs due · doses')
  assert.deepEqual(withDueWord({ words: 'NEWS2 3' }, row(), { identity }, data, NOW), { words: ['NEWS2 3', late] })
  assert.deepEqual(withDueWord(null, row(), { identity }, data, NOW), { words: [late] })
  const w = { words: ['NEWS2 3'] }
  for (const [r, d] of [[row(), undefined], [row({ state: 'discharged' }), data], [row({ kind: 'visit', state: 'with' }), data]] as const) assert.equal(withDueWord(w, r, { identity }, d, NOW), w)
  assert.equal(withDueWord(w, row(), { identity: child }, data, NOW), w, 'NEWS2 is for 16 and over: a child gets no due word')
  assert.deepEqual(withDueWord(w, row(), { identity: null }, data, NOW), { words: ['NEWS2 3', late] }, 'an age not known fits')
})
test('through the core: the tile\'s one line says NEWS2, then when the obs are due', () => {
  const tile = (who: Identity | null): TileCtx => ({ dept: { id: 'ward', packs: ['bedside'] }, place: null, identity: who, day: 1, can: () => true, org: scoresOrg })
  const lines = [{ pack: 'bedside', line: (r: PresenceRow, c: TileCtx) => withDueWord(tileWords(r, c, c.read, NOW), r, c, c.read, NOW), useRead: () => undefined }]
  const read = { patient_ids: ['pt'], news2: { st9: { score: NEWS2, version: '2017', total: 6, band: 'medium', at: at(-80) } }, obs: { st9: due(-20) } }
  assert.deepEqual(tileLineOf(lines, row(), tile(identity), { bedside: read }), [{ pack: 'bedside', words: [{ text: 'NEWS2 6', tone: 'warn' }, { text: 'obs overdue 20 min', tone: 'warn' }] }])
  assert.deepEqual(tileLineOf(lines, row({ has_vitals: false, checked_in_at: at(-90) }), tile(identity)), [{ pack: 'bedside', words: [{ text: 'no obs for 1 h', tone: 'warn' }] }],
    'before the board answers: piece 1\'s words alone')
  assert.deepEqual(tileLineOf(lines, row(), tile(child), { bedside: read }), [{ pack: 'bedside', words: [{ text: 'NEWS2 6' }] }], 'a child: no colour, no due word')
})
test('the Obs due list: the stays with NEWS2 by when due, the most overdue first, then those with none by admission; overdue counted', () => {
  const rows = [row({ item: 'b' }), row({ item: 'e', checked_in_at: at(-3 * 1440) }), row({ item: 'a' }), row({ item: 'd', has_vitals: false, checked_in_at: at(-90) }), row({ item: 'c' }),
    row({ item: 'x', state: 'discharged' }), row({ item: 'v', kind: 'visit', state: 'with' })]
  const read = { stays: { a: due(-20), b: due(10), c: due(120), x: due(-60), v: due(-60) } }
  const list = dueRows(rows, read, NOW)
  assert.deepEqual(list.map((r) => r.row.item), ['a', 'b', 'c', 'e', 'd'], 'a discharged row and a visit are dropped; the stays with NEWS2 always first')
  assert.deepEqual(list.map((r) => r.late), [true, false, false, false, true], 'vitals but no NEWS2: never late; no vitals an hour after admission: late')
  assert.deepEqual(list.map((r) => r.word?.text ?? null), ['obs overdue 20 min', 'obs due 13:10', 'obs due 15:00', null, null])
  const none = dueRows(rows, null, NOW)
  assert.ok(none.every((r) => !r.due && !r.late), 'the read loading or failed: no due, nothing late')
  const kid = dueRows(rows, read, NOW, (r) => r.item !== 'a')
  assert.deepEqual(kid.map((r) => r.row.item), ['b', 'c', 'e', 'a', 'd'], 'a child\'s due dropped: among the none, by admission')
  assert.equal(kid.find((r) => r.row.item === 'a')!.late, false, 'and not late (it has vitals)')
})
console.log(`ward2: ${n} groups passed`)
