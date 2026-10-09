// Critical care (spec/openCare.md §5.6), piece I2: SOFA's suggestions from the record's worst of 24 hours (platelets, bilirubin, the
// kidney by creatinine or a whole day's urine, the blood pressure by the pressors in µg/kg/min or the MAP, the GCS and sedation, never
// the breathing row); the daily goals' data, the round's set, the lines (opened, removed, the removal decided); the banner's words and
// the tile's SOFA and "goals not done". Pure: no browser, no database.
//   npm run test:intensive
import assert from 'node:assert/strict'
import { setClinicTimeZone, hm } from '../src/core/ui/time'
import { E, next, presence, val } from './chart-fixtures'
import type { Identity, Organization, ServerEntry, ValueRow } from '../src/core/db/types'
import { keyOf, type ScoreParams } from '../src/core/screens/visit/score'
import { itemsOf } from '../src/packs/intensive/items'
import { unitOf } from '../src/packs/intensive/unit'
import { SOFA, sofaFrom, sofaHistory, type SofaInput } from '../src/packs/intensive/sofa'
import { goalsData, goalsMissing, goalsToday, lineEntry, openLines, removalDecided, removedEntry, roundEntries } from '../src/packs/intensive/goals'
import { icuWords } from '../src/packs/intensive/words'
import { goalsDone, tileWords, type IcuBoard, type StayWords } from '../src/packs/intensive/board'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }

const row = (key: string, name: string, kind: string, dose_unit: string, sofa?: string) => ({ key, name, short: key, kind, dose_unit, ...(sofa ? { sofa } : {}) })
const INFUSIONS = [row('noradrenaline', 'Noradrenaline', 'vasopressor', 'ug/kg/min', 'noradrenaline'), row('adrenaline', 'Adrenaline', 'vasopressor', 'ug/kg/min', 'adrenaline'),
  row('dopamine', 'Dopamine', 'vasopressor', 'ug/kg/min', 'dopamine'), row('dobutamine', 'Dobutamine', 'inotrope', 'ug/kg/min', 'dobutamine'),
  row('propofol', 'Propofol 1%', 'sedative', 'mg/h'), row('insulin', 'Soluble insulin', 'insulin', 'units/h')]
const org = { settings: [{ key: 'intensive.unit', thing_id: 'icu', owner_id: 'icu', data: { day_starts: 8, infusions: INFUSIONS }, recorded_at: '2026-10-01T00:00:00Z' }],
  settingKeys: [], datatypes: {}, scores: [], departments: [{ id: 'icu', packs: ['intensive'] }, { id: 'ward', packs: [] }] } as unknown as Organization
const unit = unitOf(org, 'icu')
// 12:20 in Cairo (UTC+3): not on the hour, as a round seldom is
const NOW = '2026-10-09T09:20:00.000Z'; const ago = (h: number) => new Date(Date.parse(NOW) - h * 3600_000).toISOString()
const v = (code: string, value: number, h: number, ucum: string | null = null): ValueRow => ({ ...val('x', code, value, ago(h), E('result', { occurred_at: ago(h) })), ucum })
const input = (more: Partial<SofaInput> = {}): SofaInput => ({ values: [], infusions: [], unit, gcs: [], airway: false, fio2: null, oxygen: null, since: ago(24), now: NOW, ...more })
const PLT = 'loinc:777-3'; const BILI = 'loinc:1975-2'; const CREAT = 'loinc:2160-0'; const MAP = 'loinc:8478-0'; const URINE = 'loinc:9188-4'
const one = (code: string, value: number, ucum: string | null = null) => sofaFrom(input({ values: [v(code, value, 2, ucum)] }))

test('coag: the lowest platelets in 24 h', () => {
  for (const [x, c] of [[150, '0'], [149, '1'], [99, '2'], [49, '3'], [19, '4']] as const) assert.equal(one(PLT, x).coag.choice, c, `${x} → ${c}`)
  const s = sofaFrom(input({ values: [v(PLT, 120, 5), v(PLT, 96, 2), v(PLT, 40, 25)] }))
  assert.equal(s.coag.choice, '2', 'the lowest of the day wins; 25 h old does not count')
  assert.deepEqual(s.coag.words, [`Platelets 96 ×10³/µL at ${hm(ago(2))}`])
})

test('liver: the highest bilirubin, µmol/L read as mg/dL', () => {
  for (const [x, c, u] of [[1.1, '0', null], [1.2, '1', null], [34, '1', 'umol/L'], [6.0, '3', null], [12, '4', null]] as const) assert.equal(one(BILI, x, u).liver.choice, c, `${x} ${u ?? 'mg/dL'} → ${c}`)
  assert.deepEqual(sofaFrom(input()).liver, { choice: null, words: ['no bilirubin in 24 h'] })
})

test('renal: the highest creatinine, or a whole day\'s urine; never a part of a day', () => {
  for (const [x, c, u] of [[1.6, '1', null], [3.5, '3', null], [442, '4', 'umol/L']] as const) assert.equal(one(CREAT, x, u).renal.choice, c, `${x} → ${c}`)
  // an hour's urine is kept at the hour's start; the whole hours before the current one (12:00), the newest first
  const hourly = (k: number, total: number) => Array.from({ length: k }, (_, i) => v(URINE, total / k, i + 1 + 1 / 3))
  assert.equal(sofaFrom(input({ values: [v(CREAT, 1.0, 3), ...hourly(24, 450)] })).renal.choice, '3', '24 hours, 450 mL: < 500')
  assert.equal(sofaFrom(input({ values: [v(CREAT, 1.0, 3), ...hourly(24, 150)] })).renal.choice, '4', '24 hours, 150 mL: < 200')
  const now = sofaFrom(input({ values: [v(CREAT, 1.0, 3), ...hourly(24, 150), v(URINE, 900, 1 / 3)] })).renal
  assert.deepEqual([now.choice, now.words[1]], ['4', 'urine 150 mL in 24 h'], 'the current hour, still being typed, is not counted')
  const part = sofaFrom(input({ values: [v(CREAT, 1.0, 3), ...hourly(20, 450)] })).renal
  assert.equal(part.choice, '0', '20 hours: the creatinine only')
  assert.ok(part.words.includes('urine charted 20 of 24 hours: not enough to score'))
  const six = sofaFrom(input({ values: [v(CREAT, 1.6, 3), ...hourly(6, 150)] })).renal
  assert.equal(six.choice, '1'); assert.ok(six.words.includes('urine charted 6 of 24 hours: not enough to score'))
})

// an infusion as items: the doses at hours ago, each a version of the first
function drip(key: string, doses: [number, number][], dose_unit = 'ug/kg/min') {
  let e: ServerEntry = E('intensive.infusion', { occurred_at: ago(doses[0][1]), data: { key, status: 'running', dose: { value: String(doses[0][0]) }, dose_unit } }); const all = [e]
  for (const [d, h] of doses.slice(1)) { e = next(e, 'intensive.infusion', { key, status: 'running', dose: { value: String(d) }, dose_unit }, { occurred_at: ago(h) }); all.push(e) }
  return all
}
const card = (...es: ServerEntry[][]) => sofaFrom(input({ infusions: itemsOf(es.flat()).filter((i) => i.type === 'intensive.infusion'), values: [v(MAP, 80, 1)] })).cardiovascular

test('cardiovascular: the pressors in µg/kg/min, else the lowest MAP', () => {
  const nor = card(drip('noradrenaline', [[0.25, 10], [0.15, 5]]))
  assert.equal(nor.choice, '4'); assert.deepEqual(nor.words, ['noradrenaline 0.25 µg/kg/min, the most in 24 h'])
  assert.equal(card(drip('noradrenaline', [[0.3, 30], [0.08, 20]])).choice, '4', 'the version in force at the window\'s start counts')
  assert.equal(card(drip('noradrenaline', [[0.08, 3]])).choice, '3')
  assert.equal(card(drip('dobutamine', [[5, 3]])).choice, '2')
  assert.equal(card(drip('dopamine', [[6, 3]])).choice, '3')
  assert.equal(card(drip('dopamine', [[16, 3]])).choice, '4')
  assert.deepEqual(sofaFrom(input({ values: [v(MAP, 58, 4), v(MAP, 72, 2)] })).cardiovascular, { choice: '1', words: [`MAP 58 at ${hm(ago(4))}`] })
  const bp = E('vitals', { occurred_at: ago(2) })
  assert.equal(sofaFrom(input({ values: [{ ...val('bp.sys', 'loinc:8480-6', 120, ago(2), bp) }, { ...val('bp.dia', 'loinc:8462-4', 80, ago(2), bp) }] })).cardiovascular.choice, '0', 'BP 120/80: MAP 93')
  assert.equal(card(drip('noradrenaline', [[0.3, 3]], 'mg/h')).choice, '0', 'a dose in mg/h is not counted: the MAP 80')
  assert.equal(card(drip('noradrenaline', [[0, 3]])).choice, '0', 'a pump at 0 is not counted: the MAP 80')
  assert.equal(sofaFrom(input()).cardiovascular.choice, null)
})

const gcs = (total: number, h: number) => E('score', { occurred_at: ago(h), data: { score: 'gcs', total } })
test('cns: the lowest GCS; sedation says so; none: the doctor', () => {
  for (const [t, c] of [[15, '0'], [13, '1'], [9, '3'], [5, '4']] as const) assert.equal(sofaFrom(input({ gcs: [gcs(t, 2)] })).cns.choice, c, `GCS ${t}`)
  assert.equal(sofaFrom(input({ gcs: [gcs(15, 2), gcs(11, 6)] })).cns.choice, '2', 'the lowest wins')
  const sed = sofaFrom(input({ gcs: [gcs(9, 2)], infusions: itemsOf(drip('propofol', [[100, 5]], 'mg/h')) })).cns
  assert.ok(sed.words.includes('sedated (propofol): score the GCS before sedation')); assert.deepEqual(sed.warn, ['sedated (propofol): score the GCS before sedation'])
  assert.equal(sed.choice, null, 'a GCS under sedation is shown, not chosen')
  assert.equal(sofaFrom(input()).cns.choice, null)
})

test('resp: never suggested; the support in words', () => {
  const r = sofaFrom(input({ airway: true, fio2: 45 })).resp
  assert.equal(r.choice, null); assert.equal(r.words[0], 'on the ventilator, FiO₂ 45 %'); assert.ok(r.words[1].startsWith('PaO₂ is not in the record'))
  assert.equal(sofaFrom(input({ oxygen: 'Air' })).resp.words[0], 'on air')
  assert.equal(sofaFrom(input({ oxygen: 'O₂ 2 L/min' })).resp.words[0], 'on O₂ 2 L/min')
  const h = sofaHistory([E('score', { occurred_at: ago(51), data: { score: SOFA, total: 13 } }), E('score', { occurred_at: ago(26), data: { score: SOFA, total: 12 } }),
    E('score', { occurred_at: ago(2), data: { score: 'gcs', total: 15 } })], NOW)
  assert.deepEqual(h.map((x) => `${x.words} ${x.total}`), ['yesterday 12', 'admission 13'], 'the history: newest first, GCS left out')
})

const where = { patientId: 'pt', departmentId: 'icu', stay: 'st1' }
let ids = 0; const id = () => `n${++ids}`
test('goals: the data, the round\'s set, the lines', () => {
  assert.deepEqual(goalsData({ lines: {}, feeding: 'enteral', head_up: 'no', analgesia: undefined, text: '  ' }), { feeding: 'enteral', head_up: false })
  assert.deepEqual(goalsData({ lines: { a: 'keep' }, mapTarget: '65', balanceTarget: '−500' }), { lines: [{ item: 'a', decision: 'keep' }],
    map_target: { value: '65', unit: 'mmHg', ucum: 'mm[Hg]' }, balance_target: { value: '-500', unit: 'mL', ucum: 'mL' } })
  assert.equal(goalsMissing({ lines: {} }), 'Choose at least one goal, or write the goals')
  assert.equal(goalsMissing({ lines: {}, text: 'MAP ≥ 65' }), null); assert.equal(goalsMissing({ lines: {}, text: 'x', mapTarget: 'a' }), 'The MAP target: a number')
  const p: ScoreParams = { score: SOFA, version: '1996', short: 'SOFA', inputs: { resp: '3', coag: '2', liver: '1', cardiovascular: '4', cns: '0', renal: '1' }, result: null }
  p.result = { score: SOFA, version: '1996', retired: false, items: [], so_far: 11, total: 11, complete: true, band: { key: 'sofa', labels: { en: 'of 24' }, min: 0, max: 24, tone: null },
    missing: [], problems: [], for: keyOf(p) } as unknown as ScoreParams['result']
  const [s, g] = roundEntries(p, { lines: {}, feeding: 'enteral' }, where, id)
  assert.equal(s.type, 'score'); assert.deepEqual(s.data, { score: SOFA, version: '1996', inputs: p.inputs, total: 11, band: 'sofa' })
  assert.equal(g.type, 'intensive.goals'); assert.deepEqual(g.data, { feeding: 'enteral' }); assert.ok(s.visit_id === 'st1' && g.visit_id === 'st1' && !s.occurred_at)
  // lines: one in two days ago (day 3), one removed, a ventilation (not a line)
  const at = '2026-10-07T05:00:00.000Z'
  const cvc = E('procedure', { occurred_at: at, visit_id: 'st1', data: lineEntry('central_line', 'right internal jugular', at, where, id).data as unknown as Record<string, unknown> })
  const cvc2 = next(cvc, 'procedure', { ...cvc.data, note: 'dressing changed' }, { occurred_at: ago(3) })
  assert.deepEqual(lineEntry('urinary_catheter', ' ', at, where, id).data, { concept: { text: 'Urinary catheter', codings: [{ system: 'local.procedure', code: 'urinary_catheter', display: 'Urinary catheter' }] },
    status: 'in-progress', performed: { value: at, precision: 'minute' } })
  const art = E('procedure', { occurred_at: ago(30), data: lineEntry('arterial_line', 'left radial', ago(30), where, id).data as unknown as Record<string, unknown> })
  const art2 = next(art, 'procedure', { ...art.data, status: 'completed', outcome: 'removed' }, { occurred_at: ago(1) })
  const vent = E('procedure', { occurred_at: ago(30), data: { concept: { text: 'Invasive ventilation', codings: [{ system: 'local.procedure', code: 'invasive_ventilation' }] }, status: 'in-progress' } })
  const open = openLines([cvc, cvc2, art, art2, vent], NOW)
  assert.deepEqual(open.map((l) => [l.code, l.site, l.day, l.version]), [['central_line', 'right internal jugular', 3, 2]])
  const r = removedEntry(open[0], NOW, where, id)
  assert.ok(r.entry.refers_to === cvc2.id && r.entry.relation === 'changes'); assert.deepEqual(r.seen, { [cvc.item]: 2 })
  assert.deepEqual([(r.entry.data as { status: string }).status, (r.entry.data as { outcome: string }).outcome, (r.entry.data as { note: string }).note], ['completed', 'removed', 'dressing changed'])
  const goals = E('intensive.goals', { occurred_at: ago(2), data: { lines: [{ item: cvc.item, decision: 'remove' }] } })
  assert.deepEqual(removalDecided(open, goals), [{ item: cvc.item, at: ago(2) }]); assert.deepEqual(removalDecided(open, null), [])
  assert.equal(goalsToday([goals], ago(4))?.id, goals.id); assert.equal(goalsToday([goals], ago(1)), null)
})

test('words and tile: the ventilation\'s day, SOFA, goals not done', () => {
  const me = new Date(NOW); const identity = { gender: 'male', birth_date: '1964-01-01' } as Identity
  const rec = { tables: { 'base.presence': { rows: [presence('st1', { kind: 'stay', state: 'admitted', department_id: 'icu' })], entries: {}, patients: {}, withheld: 0 } }, hidden: [] }
  const vent = E('procedure', { occurred_at: '2026-10-07T03:30:00.000Z', data: { concept: { text: 'Invasive ventilation', codings: [{ system: 'local.procedure', code: 'invasive_ventilation' }] },
    status: 'in-progress', performed: { value: '2026-10-07T03:30:00.000Z', precision: 'minute' } } })
  const sofa = E('score', { occurred_at: ago(3), visit_id: 'st1', data: { score: SOFA, total: 11 } })
  const old = E('score', { occurred_at: ago(27), visit_id: 'st1', data: { score: SOFA, total: 12 } })
  const goals = E('intensive.goals', { occurred_at: ago(2), visit_id: 'st1', data: { feeding: 'enteral' } })
  const nor = E('intensive.infusion', { occurred_at: ago(1), visit_id: 'st1', data: { key: 'noradrenaline', status: 'running', dose: { value: '0.15' } } })
  const x = (shown: ServerEntry[], r = rec) => icuWords({ rec: r, ctx: { org, me: 'dr', departmentId: 'icu' }, identity, own: { shown, hidden: [] } }, me)
  assert.deepEqual(x([goals, sofa, old, vent, nor]), [{ word: 'Ventilated d3', rank: 1 }, { word: 'SOFA 11', rank: 2 }], 'no word from the noradrenaline')
  assert.deepEqual(x([sofa, vent]), [{ word: 'Ventilated d3', rank: 1 }, { word: 'SOFA 11', rank: 2 }, { word: 'goals not done', rank: 2, tone: 'warn' }])
  assert.deepEqual(x([goals, sofa, vent], { tables: {}, hidden: [] }), [], 'no open stay: nothing')
  const ward = { tables: { 'base.presence': { rows: [presence('st1', { kind: 'stay', state: 'admitted', department_id: 'ward' })], entries: {}, patients: {}, withheld: 0 } }, hidden: [] }
  assert.deepEqual(x([sofa, vent], ward), [], 'a stay on a ward that does not use the pack: nothing')
  assert.deepEqual(x([{ ...goals, visit_id: 'other' }, { ...sofa, visit_id: 'other' }]), [{ word: 'goals not done', rank: 2, tone: 'warn' }], 'another stay\'s are not this one\'s')
  const tnow = Date.parse(NOW); const tc = { org, dept: { id: 'icu', packs: ['intensive'] } }
  const samy: StayWords = { oxygen: { on: 'air' }, infusions: [{ key: 'insulin', drug: 'Soluble insulin', dose: '4', unit: 'units/h', rate: '4' }],
    urine: { ml: 137, hours: 5, kg: 72 }, sofa: { total: 4, at: ago(30) }, goals_at: null }
  const board: IcuBoard = { patient_ids: ['pt'], stays: { st3: samy } }
  assert.deepEqual(tileWords(presence('st3', { kind: 'stay', state: 'admitted', department_id: 'icu' }), tc, board, tnow)?.words,
    ['On air', 'insulin 4 units/h', { text: 'urine 0.4 mL/kg/h', tone: 'warn' }, 'SOFA 4', { text: 'goals not done', tone: 'warn' }])
  // the ICU day from 08:00 in Cairo (05:00 UTC)
  assert.equal(goalsDone('2026-10-09T04:59:00Z', Date.parse('2026-10-09T05:30:00Z'), 8), false, '07:59 is yesterday\'s round')
  assert.equal(goalsDone('2026-10-09T05:00:00Z', Date.parse('2026-10-09T05:30:00Z'), 8), true, '08:00 is today\'s')
  assert.equal(goalsDone('2026-10-08T06:00:00Z', Date.parse('2026-10-09T04:30:00Z'), 8), true, 'at 07:30, yesterday 09:00 is still this ICU day')
  assert.equal(goalsDone(null, tnow, 8), false)
})
console.log(`intensive round: ${n} groups passed`)
