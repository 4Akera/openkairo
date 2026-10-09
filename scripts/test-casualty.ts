// Emergency's client, pure (spec/openCare.md §5.6): the two scales and their times, the suggestion at each edge of its table
// (ATS/NEWS2 thresholds: higher only, none under 16), the triage's data and its one Done (the vitals, the triage, urgent, the move),
// Arrived and the admit sources, the tile's words from the board's read, the Patients tab's order and counts, the banner's level and
// the refusals' words; Where to: the codes of each leaving (never hosp), the departments an admission may go to, the decision and the
// leaving's one Done, the ER's times, the tile's words as decided, the police case. No browser, no database.   npm run test:casualty
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
import type { Department, Identity, Organization, Place, PresenceRow } from '../src/core/db/types'
import { DISPOSITION_OF, TOS, bedsOf, choicesFor, decideSet, destinations, hintOf, kindOf, leaveSet, policeNotice, timesLine, timesOf, type Decided } from '../src/packs/casualty/where'

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
  assert.deepEqual(tileWords(row('a', 42), {}, undefined, NOW), { words: ['in the ER 42 min'] }, 'no data yet: the row alone')
  assert.deepEqual(tileWords(row('a', 14), {}, B({}), NOW), { words: [{ text: 'not triaged · 14 min', tone: 'warn' }] })
  assert.deepEqual(tileWords(row('a', 15), {}, B({ a: {} }), NOW), { words: [{ text: 'not triaged · 15 min', tone: 'danger' }] })
  assert.deepEqual(tileWords(row('a', 16, { place_id: 'resus2' }), {}, B({ a: tri(2, 12) }), NOW), { words: [{ text: '2 · Very urgent', tone: 'danger' }, { text: 'no doctor · 12 min', tone: 'danger' }] })
  assert.deepEqual(tileWords(row('a', 16, { place_id: 'resus2' }), {}, B({ a: tri(2, 9) }), NOW), { words: [{ text: '2 · Very urgent', tone: 'danger' }, 'no doctor · 9 min'] })
  assert.deepEqual(tileWords(row('a', 16, { place_id: 'r2' }), {}, B({ a: tri(2, 10) }), NOW), { words: [{ text: '2 · Very urgent', tone: 'danger' }, 'no doctor · 10 min'] }, 'at its ten minutes: not past yet')
  assert.deepEqual(tileWords(row('a', 16, { place_id: 'r2' }), {}, B({ a: tri(2, 11) }), NOW), { words: [{ text: '2 · Very urgent', tone: 'danger' }, { text: 'no doctor · 11 min', tone: 'danger' }] }, 'past them')
  assert.deepEqual(tileWords(row('a', 80), {}, B({ a: tri(4, 72) }), NOW), { words: ['4 · Standard', { text: 'waiting 72 min', tone: 'danger' }] })
  assert.deepEqual(tileWords(row('a', 40), {}, B({ a: tri(5, 35) }), NOW), { words: ['5 · Non-urgent', 'waiting 35 min'] })
  assert.deepEqual(tileWords(row('a', 1, { place_id: 'r1' }), {}, B({ a: tri(1, 0) }), NOW), { words: [{ text: '1 · Immediate', tone: 'danger' }, { text: 'no doctor · 0 min', tone: 'danger' }] })
  assert.deepEqual(tileWords(row('a', 200), {}, B({ a: tri(3, 150, 103) }), NOW), { words: [{ text: '3 · Urgent', tone: 'warn' }, 'seen 1 h 43 ago'] })
  assert.equal(tileWords(row('a', 5, { kind: 'visit', state: 'with' }), {}, B({}), NOW), null, 'a visit: none')
  for (const junk of [null, 'x', 7, { stays: null }, { stays: [] }]) assert.deepEqual(tileWords(row('a', 42), {}, junk, NOW), { words: ['in the ER 42 min'] }, JSON.stringify(junk))
  assert.deepEqual(boardOf({ stays: { a: { triage: { level: 9, scale: 'ats', at: ago(1) } }, b: { triage: { level: 2, scale: 'esi', at: ago(1) } } } })?.stays, { a: {}, b: {} }, 'a triage without a real level or scale is dropped')
  const tile: TileCtx = { dept: { id: 'er', packs: ['casualty'] }, place: null, identity: null, day: 1, can: () => true }
  const lines = [{ pack: 'casualty', line: (r: PresenceRow, c: TileCtx, d?: unknown) => tileWords(r, c, d, NOW) }]
  assert.deepEqual(tileLineOf(lines, row('a', 80), tile, { casualty: B({ a: tri(4, 72) }) }), [{ pack: 'casualty', words: [{ text: '4 · Standard' }, { text: 'waiting 72 min', tone: 'danger' }] }])
  assert.deepEqual(tileLineOf(lines, row('a', 6), tile), [{ pack: 'casualty', words: [{ text: 'in the ER 6 min' }] }], 'before the board answers')
})
test('the list\'s order and its counted views', () => {
  const rows = [row('h', 80), row('k', 16, { place_id: 'r2' }), row('n', 6), row('o', 30), row('x', 50), row('y', 60)]
  const b = B({ h: tri(4, 72), k: tri(2, 12), x: tri(4, 20), y: tri(1, 2, 1) })
  assert.deepEqual(order(rows, b, NOW).map((r) => r.item), ['o', 'n', 'y', 'k', 'h', 'x'], 'not triaged first (longest arrived first), then 1 → 5, then the longest since triage')
  assert.deepEqual(order(rows, null, NOW).map((r) => r.item), ['h', 'y', 'x', 'o', 'k', 'n'], 'no board: by arrival')
  assert.deepEqual(views(rows, b, NOW), { all: 6, untriaged: 2, untriagedLong: 1, past: 2, toLeave: 0 }, 'k past its 10 min, h past its hour; y seen')
  assert.deepEqual(views(rows, null, NOW), { all: 6, untriaged: 0, untriagedLong: 0, past: 0, toLeave: 0 })
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
  assert.equal(words('not_in_stay'), 'Written only for a patient still in this department')
  assert.equal(words('unknown_destination'), 'Choose where the patient goes: another department of beds here'); assert.equal(words('facility_missing'), 'Say which facility')
  assert.equal(words('wrong_target'), 'That cannot correct this entry', 'the core\'s')
})

test('DISPOSITION_OF: FHIR\'s codes for each leaving, never hosp', () => {
  assert.deepEqual(TOS.map((t) => DISPOSITION_OF[t]), ['home', 'oth', 'oth', 'oth', 'oth', 'other-hcf', 'oth', 'aadvice', 'exp'])
  assert.ok(!Object.values(DISPOSITION_OF).includes('hosp' as never), 'hosp is hospice')
})
test('kindOf: the starter setup\'s last word, after a dot or at the start', () => {
  for (const s of ['ward', 'x.ward', null, 'clinic']) assert.equal(kindOf(s), 'ward', String(s))
  assert.equal(kindOf('x.icu'), 'icu'); assert.equal(kindOf('icu'), 'icu'); assert.equal(kindOf('x.ccu'), 'ccu'); assert.equal(kindOf('x.picu'), 'ward')
})
const DEP = (id: string, name: string, work: Department['work'] = 'stays', setup: string | null = null) => ({ id, name, work, setup })
const DEPS = [DEP('er', 'Emergency', 'stays', 'casualty.er'), DEP('wm', 'Medical Ward', 'stays', 'ward'), DEP('desk', 'Front desk', 'desk'), DEP('lab', 'Lab', 'bench'),
  DEP('ws', 'Another Ward'), DEP('er2', 'Emergency 2'), DEP('dia', 'Dialysis'), DEP('imp', 'Inpatients')]
const CLASS: Record<string, string | null> = { er: 'EMER', er2: 'EMER', dia: 'AMB', imp: 'IMP', ws: null }
test('destinations and choicesFor: departments of beds here, never the ER itself, never EMER or AMB', () => {
  const beds = bedsOf({ departments: [{ id: 'wm', free: [{ id: 'b1', name: 'Bed 1' }, { id: 'b2', name: 'Bed 2' }, { id: 7 }] }, { nope: 1 }] })
  const ds = destinations(DEPS, 'er', beds, (id) => CLASS[id])
  assert.deepEqual(ds.map((d) => d.id), ['ws', 'imp', 'wm'], 'by name; desk, bench, er, er2 (EMER) and dialysis (AMB) left out; IMP, null and undefined kept')
  assert.deepEqual(ds.find((d) => d.id === 'wm')?.free, [{ id: 'b1', name: 'Bed 1' }, { id: 'b2', name: 'Bed 2' }]); assert.deepEqual(ds[0].free, [], 'not read: none')
  assert.equal(bedsOf('x'), null); assert.equal(bedsOf({ departments: {} }), null)
  assert.deepEqual(choicesFor(ds).map((c) => c.to), ['home', 'ward', 'operating_room', 'other_facility', 'left_unseen', 'against_advice', 'died'], 'no ICU, no CCU')
  assert.equal(hintOf('ward', ds), 'Another Ward no free bed · Inpatients no free bed · Medical Ward 2 free')
  const icu = destinations([...DEPS, DEP('icu', 'ICU', 'stays', 'x.icu')], 'er', bedsOf({ departments: [{ id: 'icu', free: [{ id: 'i5', name: 'ICU 5' }] }] }), (id) => CLASS[id])
  assert.deepEqual(choicesFor(icu).map((c) => c.to).slice(0, 4), ['home', 'ward', 'icu', 'operating_room']); assert.equal(hintOf('icu', icu), 'ICU 1 free')
  assert.equal(hintOf('operating_room', icu), 'then a ward')
})
const STAY2 = { item: 'st1', patient_id: 'pt', latest_entry: 'e9', reason: 'short of breath' }
const DEC: Decided = { to: 'ward', department_id: 'wm', at: ago(40), entry: 'd1' }
const name = (id: string) => DEPS.find((d) => d.id === id)?.name ?? 'a ward'
test('decideSet: one decision in the stay; with one standing, it changes it', () => {
  const [e, ...rest] = decideSet({ to: 'ward', department_id: 'wm', place_id: 'b1', note: 'x' }, STAY2, 'er')
  assert.equal(rest.length, 0); assert.equal(e.type, 'casualty.disposition'); assert.equal(e.visit_id, 'st1'); assert.equal(e.department_id, 'er')
  assert.deepEqual(e.data, { to: 'ward', department_id: 'wm' }); assert.equal(e.refers_to, undefined)
  const [c] = decideSet({ to: 'home', department_id: 'wm', police_report: ' 2214/2026 ' }, STAY2, 'er', DEC)
  assert.deepEqual([c.refers_to, c.relation, c.data], ['d1', 'changes', { to: 'home', police_report: '2214/2026' }], 'no department for home')
})
test('leaveSet for an admission: the decision, discharged, the next stay about this one, the ER\'s note in it', () => {
  const es = leaveSet({ to: 'ward', department_id: 'wm', place_id: null, note: ' nebulisers every four hours ' }, STAY2, 'er', name)
  assert.deepEqual(es.map((e) => e.type), ['casualty.disposition', 'discharged', 'admitted', 'note'])
  const [, d, a, n] = es
  assert.deepEqual([d.data, d.refers_to, d.relation, d.visit_id], [{ disposition: 'oth', note: 'to Medical Ward' }, 'e9', 'changes', 'st1'])
  assert.deepEqual([a.visit_id, a.department_id, a.refers_to, a.relation], [a.id, 'er', 'st1', 'about'])
  assert.deepEqual(a.data, { department_id: 'wm', admit_source: 'emd', reason: 'short of breath' }, 'the ward chooses: no place; the stay\'s reason')
  assert.deepEqual([n.visit_id, n.department_id, n.data], [a.id, 'er', { kind: 'emergency', text: 'nebulisers every four hours' }])
  const bed = leaveSet({ to: 'ward', department_id: 'wm', place_id: 'b2', reason: 'COPD' }, STAY2, 'er', name, DEC)
  assert.deepEqual(bed.map((e) => e.type), ['discharged', 'admitted'], 'the same decision standing: none; no note written: none')
  assert.deepEqual(bed[1].data, { department_id: 'wm', place_id: 'b2', admit_source: 'emd', reason: 'COPD' })
  const pol = leaveSet({ to: 'ward', department_id: 'wm', police_report: '2214/2026' }, STAY2, 'er', name, DEC)
  assert.deepEqual([pol[0].type, pol[0].refers_to, pol[0].relation], ['casualty.disposition', 'd1', 'changes'], 'a new report number changes it')
  assert.equal(leaveSet({ to: 'operating_room', department_id: 'wm' }, STAY2, 'er', name)[1].data.note, 'to the operating room, then Medical Ward')
  // another facility decided with why: the card presets why from the board, so a new report number keeps it; a why typed anew changes it
  const FAC: Decided = { to: 'other_facility', facility: 'Al Salam Hospital', why: 'needs cath lab', at: ago(30), entry: 'd3' }
  const kept = leaveSet({ to: 'other_facility', facility: 'Al Salam Hospital', why: 'needs cath lab', police_report: '2214/2026' }, STAY2, 'er', name, FAC)
  assert.deepEqual([kept[0].refers_to, kept[0].data], ['d3', { to: 'other_facility', facility: 'Al Salam Hospital', why: 'needs cath lab', police_report: '2214/2026' }])
  assert.deepEqual(leaveSet({ to: 'other_facility', facility: 'Al Salam Hospital', why: 'needs cath lab' }, STAY2, 'er', name, FAC).map((e) => e.type), ['discharged'])
  assert.equal(leaveSet({ to: 'other_facility', facility: 'Al Salam Hospital', why: 'no bed here' }, STAY2, 'er', name, FAC)[0].type, 'casualty.disposition', 'a new why changes it')
})
test('leaveSet: home, another facility, left before being seen, against advice, died', () => {
  const t = (l: Parameters<typeof leaveSet>[0]) => leaveSet(l, STAY2, 'er', name).map((e) => [e.type, (e.data as { disposition?: string }).disposition ?? null])
  assert.deepEqual(t({ to: 'home' }), [['casualty.disposition', null], ['discharged', 'home']])
  const f = leaveSet({ to: 'other_facility', facility: ' Al Salam Hospital ', why: 'cath lab', signed_by: 'x' }, STAY2, 'er', name)
  assert.deepEqual([f[0].data, f[1].data], [{ to: 'other_facility', facility: 'Al Salam Hospital', why: 'cath lab' }, { disposition: 'other-hcf', note: 'to Al Salam Hospital' }])
  assert.deepEqual(leaveSet({ to: 'left_unseen' }, STAY2, 'er', name)[1].data, { disposition: 'oth', note: 'left before being seen' })
  const aa = leaveSet({ to: 'against_advice', signed_by: 'his brother Ahmed', why: 'the risks' }, STAY2, 'er', name)
  assert.deepEqual([aa[0].data, aa[1].data], [{ to: 'against_advice', why: 'the risks', signed_by: 'his brother Ahmed' }, { disposition: 'aadvice', note: 'left against advice' }])
  const died = leaveSet({ to: 'died', died_at: ago(20), cause: 'cardiac arrest' }, STAY2, 'er', name)
  assert.deepEqual(died.map((e) => e.type), ['casualty.disposition', 'died', 'discharged'])
  assert.deepEqual([died[0].data, died[1].occurred_at, died[1].data, died[1].visit_id, died[2].data], [{ to: 'died', brought_in_dead: false }, ago(20), { cause: { text: 'cardiac arrest' } }, 'st1', { disposition: 'exp' }])
})
test('timesOf and timesLine: worked out, never stored', () => {
  assert.equal(timesLine(timesOf(row('a', 125), { seen_at: ago(103), decided: DEC }, NOW)), 'door to doctor 22 min · in the ER 2 h 05 · boarding 40 min')
  assert.equal(timesLine(timesOf(row('a', 42), undefined, NOW)), 'no doctor yet · in the ER 42 min')
  assert.deepEqual(timesOf(row('a', 290), { seen_at: ago(280), decided: { to: 'home', at: ago(15), entry: 'd' } }, NOW), { doorToDoctor: 10, inEr: 290, boarding: null }, 'home: no boarding')
})
const ORG = { departments: DEPS } as unknown as Organization
test('tileWords as decided, with a police case; To leave', () => {
  const at = (f: Board['stays'][string]) => tileWords(row('a', 200), { org: ORG }, B({ a: { ...tri(3, 150, 103), ...f } }), NOW)?.words
  assert.deepEqual(at({ decided: { to: 'home', at: ago(15), entry: 'd' } }), [{ text: '3 · Urgent', tone: 'warn' }, 'seen 1 h 43 ago', { text: 'for home', tone: 'ok' }])
  assert.deepEqual(at({ decided: DEC }), [{ text: '3 · Urgent', tone: 'warn' }, 'seen 1 h 43 ago', 'for Medical Ward', 'boarding 40 min'])
  assert.deepEqual(at({ decided: { to: 'other_facility', facility: 'Al Salam Hospital', at: ago(5), entry: 'd' } })?.slice(2), ['to Al Salam Hospital'])
  assert.deepEqual(at({ decided: { to: 'operating_room', department_id: 'wm', at: ago(5), entry: 'd' } })?.slice(2), ['for the operating room', 'boarding 5 min'])
  assert.deepEqual(at({ police: true })?.slice(2), ['police case']); assert.deepEqual(at({ police: false })?.slice(2), [])
  assert.deepEqual(boardOf({ stays: { a: { decided: { to: 'nowhere', at: ago(1), entry: 'd' }, police: 'yes' }, b: { decided: { ...DEC, facility: 7 } }, c: { decided: { ...DEC, why: 'needs cath lab' } } } })?.stays,
    { a: {}, b: { decided: DEC }, c: { decided: { ...DEC, why: 'needs cath lab' } } }, 'read defensively; why carried')
  const rows = [row('a', 80), row('b', 60), row('c', 30)]
  assert.equal(views(rows, B({ a: { decided: DEC }, b: { police: true } }), NOW).toLeave, 1)
})
test('the police case: on the triage when answered, and the notice with no report number yet, never a stop', () => {
  assert.deepEqual(triageData(D({ police: { case: true, why: 'assault' } })).casualty.police, { case: true, why: 'assault' })
  assert.deepEqual(triageData(D({ police: { case: false, why: 'fall' } })).casualty.police, { case: false }, 'no why for no')
  assert.equal('police' in triageData(D({ police: null })).casualty, false, 'unanswered: not written')
  assert.equal(policeNotice(true, ''), 'Police case · no report number yet — add it here, or later, before they leave'); assert.equal(policeNotice(true, '  '), policeNotice(true))
  assert.equal(policeNotice(true, '2214/2026'), null); assert.equal(policeNotice(false), null); assert.equal(policeNotice(undefined, ''), null)
})
console.log(`casualty: ${n} groups passed`)
