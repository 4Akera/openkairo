// Emergency's client, pure (spec/openCare.md §5.6): the two scales and their times, the suggestion at each edge of its table
// (ATS/NEWS2 thresholds: higher only, none under 16), the triage's data and its one Done (the vitals, the triage, urgent, the move),
// Arrived and the admit sources, the tile's words from the board's read, the Patients tab's order and counts, the banner's level and
// the refusals' words. No browser, no database.   npm run test:casualty
import assert from 'node:assert/strict'
import { setClinicTimeZone } from '../src/core/ui/time'
import { LEVELS, SCALES, levelWord, targetOf, timeWords, toneOf } from '../src/packs/casualty/scale'
import { DANGER, needsWhy, shows, signLevels, signWords, suggest, type Suggestion } from '../src/packs/casualty/suggest'
import { admitSourceOf, arrivalOf, arrivedSet, placeChoices, triageData, triageSet, vitalsOf, type TriageDraft } from '../src/packs/casualty/triage'
import { boardOf, dur, levelBanner, order, tileWords, views, type Board } from '../src/packs/casualty/board'
import { REFUSALS } from '../src/packs/casualty/words'
import { registerWords, words } from '../src/core/db/words'
import { ownOf } from '../src/core/screens/chart/sections'
import { tileLineOf, type TileCtx } from '../src/core/screens/ward/tiles'
import { parseVitals } from '../src/core/screens/visit/vitals'
import { E, ctx as chartCtx, presence, record, table } from './chart-fixtures'
import type { Identity, Place, PresenceRow } from '../src/core/db/types'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const level = (v: Record<string, unknown>) => suggest(v, [], 40)?.level ?? null
const vitals = (line: string) => { const r = parseVitals(line.split(/\s+/)); assert.ok(r && 'ok' in r, `${line} → ${JSON.stringify(r)}`); return r.ok[0].params }

test('the scales: the times to the doctor, the words, the tones', () => {
  assert.deepEqual(LEVELS.map((l) => targetOf('ats', l)), [0, 10, 30, 60, 120])
  assert.deepEqual(LEVELS.map((l) => targetOf('mts', l)), [0, 10, 60, 120, 240])
  assert.equal(levelWord(2), '2 · Very urgent'); assert.equal(levelWord(5), '5 · Non-urgent')
  assert.deepEqual(LEVELS.map(toneOf), ['danger', 'danger', 'warn', undefined, undefined])
  assert.equal(timeWords('ats', 1), 'doctor at once'); assert.equal(timeWords('mts', 3), 'doctor within 60 min'); assert.equal(timeWords('ats', 2), 'doctor within 10 min')
  assert.equal(SCALES.ats.version, 'P06', 'migration 18 declares casualty.ats at P06'); assert.equal(SCALES.mts.version, '3', 'and casualty.mts at 3')
})
test('the suggestion at each edge of the table', () => {
  const at = (k: string, xs: [number | string, number | null][]) => { for (const [x, want] of xs) assert.equal(level({ [k]: x }), want, `${k} ${x}`) }
  at('respiratory_rate', [[9, 1], [10, null], [20, null], [21, 3], [24, 3], [25, 2]])
  at('spo2', [[91, 2], [92, 3], [95, 3], [96, null]])
  at('systolic', [[79, 1], [80, 2], [90, 2], [91, 3], [100, 3], [101, null], [219, null], [220, 3]])
  at('pulse', [[40, 2], [41, null], [110, null], [111, 3], [130, 3], [131, 2]])
  at('temperature', [[35.0, 2], [35.1, null], [39.0, null], [39.1, 3]])
  at('consciousness', [['a', null], ['c', 2], ['v', 2], ['p', 1], ['u', 1]])
  at('oxygen', [['air', null], ['oxygen', 3]])
  for (const d of DANGER) assert.deepEqual(suggest({}, [d.key], 40), { level: d.level, signs: [d.key] }, d.key)
  assert.deepEqual(signLevels({ respiratory_rate: 28, spo2: 92, systolic: 96, pulse: 124 }).map((x) => `${x.sign}${x.level}`), ['rr2', 'spo23', 'sbp3', 'pulse3'], 'each sign once, in order')
  assert.deepEqual(signLevels(null), [])
})
test('the whole suggestion: the card\'s vitals line, Karim, the most urgent signs, none under 16, higher only, why', () => {
  const lead = vitalsOf('/v 96/60 124 a'); assert.equal(lead.error, null); assert.equal(lead.params?.consciousness, 'a', 'a leading /v goes')
  assert.equal(vitalsOf('v 96/60').params?.consciousness, 'v', 'a bare v is Voice')
  assert.equal(vitalsOf('/vitals rr 28').params?.respiratory_rate, 28); assert.deepEqual(vitalsOf('  '), { params: null, error: null }, 'nothing typed')
  const bad = vitalsOf('xx'); assert.equal(bad.params, null); assert.ok(bad.error, 'a parse error blocks Done')
  const karim = vitals('96/60 124 36.8 spo2 92 rr 28 a air')
  assert.deepEqual(suggest(karim, ['severe_pain'], 34), { level: 2, signs: ['rr', 'severe_pain'] })
  assert.deepEqual(suggest({ spo2: 86, respiratory_rate: 26, oxygen: 'air' }, [], 50), { level: 2, signs: ['rr', 'spo2'] })
  assert.equal(suggest(vitals('120/80 80 37 spo2 98 rr 16 a air'), [], 30), null, 'normal vitals, no sign')
  assert.equal(suggest(karim, ['severe_pain'], 15), null, 'under 16: the nurse decides')
  assert.deepEqual(suggest(karim, [], null)?.level, 2, 'an age not known suggests')
  assert.equal(suggest({ consciousness: 'u' }, ['severe_pain'], 70)?.level, 1)
  assert.deepEqual(['rr', 'spo2', 'sbp', 'pulse', 'temp', 'acvpu', 'oxygen', 'severe_pain'].map((s) => signWords(s as never, { ...karim, temperature: 34.8, consciousness: 'v', oxygen: 'oxygen' })),
    ['RR 28', 'SpO₂ 92', 'BP 96/60', 'P 124', 'T 34.8', 'ACVPU V', 'on oxygen', 'Severe pain'])
  const s: Suggestion = { level: 2, signs: ['rr'] }
  assert.equal(shows(s, null), true); assert.equal(shows(s, 2), false); assert.equal(shows(s, 1), false); assert.equal(shows(s, 3), true); assert.equal(shows(null, null), false)
  assert.equal(needsWhy(s, 3), true); assert.equal(needsWhy(s, 2), false); assert.equal(needsWhy(s, 1), false); assert.equal(needsWhy(s, null), false); assert.equal(needsWhy(null, 5), false)
})

const D = (more: Partial<TriageDraft> = {}): TriageDraft => ({ scale: 'ats', level: 2, danger: [], ...more })
test('triageData: the level in words with its coding, only what was said, the scale\'s version', () => {
  assert.deepEqual(triageData(D()), { code: { text: 'Triage level (Australasian scale)' },
    value: { concept: { text: '2 · Very urgent', codings: [{ system: 'casualty.ats', code: '2', display: 'Very urgent' }] } }, casualty: { scale: 'ats', scale_version: 'P06', level: 2 } })
  const m = triageData(D({ scale: 'mts', level: 4, words: '  glass cut  ', complaint: 'wound', arrival: 'walked_in', arrival_ref: '4471' }))
  assert.equal(m.code.text, 'Triage level (Manchester scale)'); assert.deepEqual(m.value.concept.codings, [{ system: 'casualty.mts', code: '4', display: 'Standard' }])
  assert.equal(m.note, 'glass cut'); assert.deepEqual(m.casualty, { scale: 'mts', scale_version: '3', level: 4, arrival: 'walked_in', complaint: 'wound' }, 'no call number but by ambulance')
  const k = triageData(D({ arrival: 'ambulance', arrival_ref: ' 4471 ', danger: ['severe_pain'], suggested: { level: 2, signs: ['rr', 'severe_pain'] }, why: 'not asked' }))
  assert.deepEqual(k.casualty, { scale: 'ats', scale_version: 'P06', level: 2, arrival: 'ambulance', arrival_ref: '4471', danger: ['severe_pain'], suggested: { level: 2, signs: ['rr', 'severe_pain'] } })
  const w = triageData(D({ level: 3, suggested: { level: 2, signs: ['rr'] }, why: ` ${'x'.repeat(250)} ` }))
  assert.equal(w.casualty.why, 'x'.repeat(200), 'why only when needed, cut to 200')
  assert.equal(triageData(D({ level: 3, suggested: { level: 2, signs: ['rr'] }, why: '   ' })).casualty.why, undefined)
})
const STAY: Pick<PresenceRow, 'item' | 'patient_id' | 'latest_entry' | 'urgent' | 'place_id'> = { item: 'st1', patient_id: 'pt', latest_entry: 'e9', urgent: false, place_id: null }
test('triageSet: the vitals, the triage, urgent to match the level, the move chained on the urgent', () => {
  const es = triageSet(D({ vitals: vitals('96/60 124 36.8 spo2 92 rr 28 a air'), place: 'resus1' }), STAY, 'er')
  assert.deepEqual(es.map((e) => e.type), ['vitals', 'casualty.triage', 'urgent', 'moved'])
  const [v, t, u, m] = es
  for (const e of es) { assert.equal(e.visit_id, 'st1'); assert.equal(e.department_id, 'er'); assert.equal(e.patient_id, 'pt') }
  assert.deepEqual((v.data as { oxygen?: unknown }).oxygen, { on: 'air' }); assert.equal((t.data as { casualty: { level: number } }).casualty.level, 2)
  assert.deepEqual([u.refers_to, u.relation, u.data], ['e9', 'changes', { urgent: true }])
  assert.deepEqual([m.refers_to, m.relation, m.data], [u.id, 'changes', { place_id: 'resus1' }])
  const four = triageSet(D({ level: 4, vitals: {} }), { ...STAY, urgent: true }, 'er')
  assert.deepEqual(four.map((e) => e.type), ['casualty.triage', 'urgent']); assert.deepEqual(four[1].data, { urgent: false })
  assert.deepEqual(triageSet(D({ level: 3, place: 'c1' }), { ...STAY, place_id: 'c1' }, 'er').map((e) => e.type), ['casualty.triage'], 'its own place: no move')
  const moved = triageSet(D({ level: 3, place: 'c2' }), STAY, 'er'); assert.deepEqual(moved.map((e) => e.type), ['casualty.triage', 'moved']); assert.equal(moved[1].refers_to, 'e9', 'no urgent: on the latest entry')
  // the card's places: a free resus bay first for 1–2, cubicles first for 3–5, by position; the preset; the stay's own place
  const P = (id: string, label: string, position: number, more: Partial<Place> = {}): Place =>
    ({ id, department_id: 'er', parent_id: null, label, name: id, position, closed: false, closed_reason: null, ...more })
  const ps = [P('c2', 'cubicle', 4), P('r1', 'bed', 1), P('c1', 'cubicle', 3), P('r2', 'bed', 2), P('x', 'cubicle', 5, { closed: true }), P('w', 'bed', 0, { department_id: 'ward' })]
  const ids = (xs: Place[]) => xs.map((x) => x.id)
  const two = placeChoices(ps, new Set(['r1']), { place_id: null }, 'er', 2, undefined)
  assert.deepEqual([ids(two.free), two.own, two.place], [['r2', 'c1', 'c2'], null, 'r2'], 'level 2: a free resus bay first, and preset')
  assert.deepEqual(placeChoices(ps, new Set(['r1', 'r2']), { place_id: null }, 'er', 1, undefined).place, 'c1', 'no bay free: the first free cubicle')
  assert.equal(placeChoices(ps, new Set(['r1', 'r2', 'c1', 'c2']), { place_id: null }, 'er', 1, undefined).place, null, 'nothing free: the chairs')
  const lv4 = placeChoices(ps, new Set(), { place_id: null }, 'er', 4, undefined)
  assert.deepEqual([ids(lv4.free), lv4.place], [['c1', 'c2', 'r1', 'r2'], null], 'level 4: cubicles first, preset the chairs')
  assert.equal(placeChoices(ps, new Set(), { place_id: null }, 'er', null, undefined).place, null, 'no level yet: the chairs')
  assert.equal(placeChoices(ps, new Set(), { place_id: null }, 'er', 2, null).place, null, 'the chairs chosen stay chosen')
  assert.equal(placeChoices(ps, new Set(['c2']), { place_id: null }, 'er', 4, 'c2').place, null, 'a chosen place taken since: the preset')
  const kept = placeChoices(ps, new Set(['c1']), { place_id: 'c1' }, 'er', 1, undefined)
  assert.deepEqual([ids(kept.free), kept.own?.id, kept.place], [['r1', 'r2', 'c2'], 'c1', 'c1'], 'its own place: not free, and kept unless moved')
  assert.equal(placeChoices(ps, new Set(['c1']), { place_id: 'c1' }, 'er', 1, 'r1').place, 'r1')
})
test('Arrived: one admitted with no place; the admit sources and back', () => {
  const s = arrivedSet('pt', 'er', 'referred', ' chest pain ')
  assert.equal(s.entries.length, 1); const e = s.entries[0]
  assert.equal(e.type, 'admitted'); assert.equal(e.visit_id, e.id); assert.equal(e.department_id, 'er')
  assert.deepEqual(e.data, { department_id: 'er', admit_source: 'gp', reason: 'chest pain' })
  assert.deepEqual(arrivedSet('pt', 'er').entries[0].data, { department_id: 'er', admit_source: 'other' })
  assert.deepEqual([admitSourceOf('referred'), admitSourceOf('other_hospital'), admitSourceOf('ambulance'), admitSourceOf('police'), admitSourceOf(null), admitSourceOf()],
    ['gp', 'hosp-trans', 'other', 'other', 'other', 'other'], 'never emd')
  assert.deepEqual([arrivalOf('gp'), arrivalOf('hosp-trans'), arrivalOf('other'), arrivalOf(null)], ['referred', 'other_hospital', undefined, undefined])
})

const NOW = Date.parse('2026-10-09T10:00:00Z'); const ago = (m: number) => new Date(NOW - m * 60_000).toISOString()
const row = (item: string, arrived: number, more: Partial<PresenceRow> = {}) => presence(item, { kind: 'stay', state: 'admitted', department_id: 'er', checked_in_at: ago(arrived), ...more })
const tri = (level: 1 | 2 | 3 | 4 | 5, m: number, seen?: number) => ({ triage: { level, scale: 'ats' as const, at: ago(m) }, ...(seen !== undefined ? { seen_at: ago(seen) } : {}) })
const B = (stays: Board['stays']): Board => ({ patient_ids: ['pt'], stays })
test('tileWords: in the ER, not triaged, the level and its wait, seen', () => {
  assert.equal(dur(12), '12 min'); assert.equal(dur(89), '89 min'); assert.equal(dur(90), '1 h 30'); assert.equal(dur(103), '1 h 43'); assert.equal(dur(125), '2 h 05')
  assert.deepEqual(tileWords(row('a', 42), undefined, NOW), { words: ['in the ER 42 min'] }, 'no data yet: the row alone')
  assert.deepEqual(tileWords(row('a', 14), B({}), NOW), { words: [{ text: 'not triaged · 14 min', tone: 'warn' }] })
  assert.deepEqual(tileWords(row('a', 15), B({ a: {} }), NOW), { words: [{ text: 'not triaged · 15 min', tone: 'danger' }] })
  assert.deepEqual(tileWords(row('a', 16, { place_id: 'resus2' }), B({ a: tri(2, 12) }), NOW), { words: [{ text: '2 · Very urgent', tone: 'danger' }, { text: 'no doctor · 12 min', tone: 'danger' }] })
  assert.deepEqual(tileWords(row('a', 16, { place_id: 'resus2' }), B({ a: tri(2, 9) }), NOW), { words: [{ text: '2 · Very urgent', tone: 'danger' }, 'no doctor · 9 min'] })
  assert.deepEqual(tileWords(row('a', 16, { place_id: 'r2' }), B({ a: tri(2, 10) }), NOW), { words: [{ text: '2 · Very urgent', tone: 'danger' }, 'no doctor · 10 min'] }, 'at its ten minutes: not past yet')
  assert.deepEqual(tileWords(row('a', 16, { place_id: 'r2' }), B({ a: tri(2, 11) }), NOW), { words: [{ text: '2 · Very urgent', tone: 'danger' }, { text: 'no doctor · 11 min', tone: 'danger' }] }, 'past them')
  assert.deepEqual(tileWords(row('a', 80), B({ a: tri(4, 72) }), NOW), { words: ['4 · Standard', { text: 'waiting 72 min', tone: 'danger' }] })
  assert.deepEqual(tileWords(row('a', 40), B({ a: tri(5, 35) }), NOW), { words: ['5 · Non-urgent', 'waiting 35 min'] })
  assert.deepEqual(tileWords(row('a', 1, { place_id: 'r1' }), B({ a: tri(1, 0) }), NOW), { words: [{ text: '1 · Immediate', tone: 'danger' }, { text: 'no doctor · 0 min', tone: 'danger' }] })
  assert.deepEqual(tileWords(row('a', 200), B({ a: tri(3, 150, 103) }), NOW), { words: [{ text: '3 · Urgent', tone: 'warn' }, 'seen 1 h 43 ago'] })
  assert.equal(tileWords(row('a', 5, { kind: 'visit', state: 'with' }), B({}), NOW), null, 'a visit: none')
  for (const junk of [null, 'x', 7, { stays: null }, { stays: [] }]) assert.deepEqual(tileWords(row('a', 42), junk, NOW), { words: ['in the ER 42 min'] }, JSON.stringify(junk))
  assert.deepEqual(boardOf({ stays: { a: { triage: { level: 9, scale: 'ats', at: ago(1) } }, b: { triage: { level: 2, scale: 'esi', at: ago(1) } } } })?.stays, { a: {}, b: {} }, 'a triage without a real level or scale is dropped')
  const tile: TileCtx = { dept: { id: 'er', packs: ['casualty'] }, place: null, identity: null, day: 1, can: () => true }
  const lines = [{ pack: 'casualty', line: (r: PresenceRow, _c: TileCtx, d?: unknown) => tileWords(r, d, NOW) }]
  assert.deepEqual(tileLineOf(lines, row('a', 80), tile, { casualty: B({ a: tri(4, 72) }) }), [{ pack: 'casualty', words: [{ text: '4 · Standard' }, { text: 'waiting 72 min', tone: 'danger' }] }])
  assert.deepEqual(tileLineOf(lines, row('a', 6), tile), [{ pack: 'casualty', words: [{ text: 'in the ER 6 min' }] }], 'before the board answers')
})
test('the list\'s order and its counted views', () => {
  const rows = [row('h', 80), row('k', 16, { place_id: 'r2' }), row('n', 6), row('o', 30), row('x', 50), row('y', 60)]
  const b = B({ h: tri(4, 72), k: tri(2, 12), x: tri(4, 20), y: tri(1, 2, 1) })
  assert.deepEqual(order(rows, b, NOW).map((r) => r.item), ['o', 'n', 'y', 'k', 'h', 'x'], 'not triaged first (longest arrived first), then 1 → 5, then the longest since triage')
  assert.deepEqual(order(rows, null, NOW).map((r) => r.item), ['h', 'y', 'x', 'o', 'k', 'n'], 'no board: by arrival')
  assert.deepEqual(views(rows, b, NOW), { all: 6, untriaged: 2, untriagedLong: 1, past: 2 }, 'k past its 10 min, h past its hour; y seen')
  assert.deepEqual(views(rows, null, NOW), { all: 6, untriaged: 0, untriagedLong: 0, past: 0 })
})
test('the banner\'s word: the open stay\'s latest level here', () => {
  const cx = { ...chartCtx, departmentId: 'er' }; const identity = { gender: 'male', birth_date: '1992-01-01' } as Identity
  const t = (lv: number, at: string, more = {}) => E('casualty.triage', { visit_id: 'st1', occurred_at: at, data: { casualty: { level: lv, scale: 'ats' }, value: { concept: { text: '' } } }, ...more })
  const rec = (dept = 'er') => record({ 'base.presence': table([presence('st1', { kind: 'stay', state: 'admitted', department_id: dept })]) })
  const x = (es: ReturnType<typeof E>[], r = rec()) => ({ rec: r, ctx: cx, identity, own: ownOf(es, ['casualty.triage']) })
  assert.deepEqual(levelBanner(x([t(4, '2026-10-09T08:00:00Z'), t(2, '2026-10-09T09:00:00Z')])), [{ word: '2 · Very urgent', rank: 1, tone: 'danger' }])
  assert.deepEqual(levelBanner(x([t(4, '2026-10-09T09:00:00Z')])), [{ word: '4 · Standard', rank: 1 }])
  assert.deepEqual(levelBanner(x([t(3, '2026-10-09T09:00:00Z')])), [{ word: '3 · Urgent', rank: 1, tone: 'warn' }])
  assert.deepEqual(levelBanner(x([t(2, '2026-10-09T09:00:00Z')], rec('ward'))), [], 'the stay in another department')
  assert.deepEqual(levelBanner(x([t(2, '2026-10-09T09:00:00Z', { visit_id: 'older' })])), [], 'another stay')
  assert.deepEqual(levelBanner(x([])), [])
})
test('the refusals in words', () => {
  registerWords(REFUSALS)
  assert.equal(words('triage_mismatch'), 'The level and its code differ — choose the level again')
  assert.equal(words('not_in_stay'), 'Triage is written for a patient in this department')
})
console.log(`casualty: ${n} groups passed`)
