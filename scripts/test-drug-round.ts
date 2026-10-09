// Ward nursing's drug round (spec/openCare.md §5.6, piece 3): the ward's dose times and their defaults held equal to the migration's, the
// timings, a local time in the clinic's zone, the tile's dose words from the board's read (C7), the round's views, the dose the round
// writes, the last dose beside Give. Pure: no browser, no database.   npm run test:drug-round
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setClinicTimeZone } from '../src/core/ui/time'
import { COVER_MIN, DEFAULT_ROUND, HALF_HOURS, PER_DAY, isNight, localYmd, nextTime, roundOf, timesFor, timingOf, zoned } from '../src/packs/bedside/schedule'
import { REASON_KEYS, doseData, doseTileWords, hasDose, howWords, shortName, wardTile, type MedicineRead, type RoundRead } from '../src/packs/bedside/doses'
import { countsOf, elsewhereOf, lastGiven, matches, nextRound, nowDue, roundWords, rowsOf, unsetOf } from '../src/packs/bedside/round'
import { NEWS2 } from '../src/packs/bedside/line'
import { tileLineOf, type TileCtx } from '../src/core/screens/ward/tiles'
import { org, presence } from './chart-fixtures'
import type { Organization, PresenceRow, ScoreTable } from '../src/core/db/types'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const Z = 'Africa/Cairo'
const at = (local: string) => zoned(local.slice(0, 10), local.slice(11, 16), Z)
const iso = (local: string) => new Date(at(local)).toISOString()

test('the defaults are one: the shape, bedside.round_of and the client; the tables equal the migration\'s', () => {
  const sql = readFileSync('supabase/migrations/20260926000017_bedside.sql', 'utf8')
  const after = (marker: string) => { const i = sql.indexOf(marker); assert.ok(i >= 0, marker); const a = sql.indexOf('$j$', i) + 3; return JSON.parse(sql.slice(a, sql.indexOf('$j$', a))) }
  const shape = after("core.declare_setting('bedside.round'")
  assert.deepEqual({ times: shape.properties.times.default, late_after: shape.properties.late_after.default, night: shape.properties.night.default }, DEFAULT_ROUND)
  assert.deepEqual(after('create function bedside.round_of'), DEFAULT_ROUND)
  assert.deepEqual(roundOf(undefined, 'ward'), DEFAULT_ROUND)
  const set = { ...org, settingKeys: [], datatypes: {}, settings: [{ key: 'bedside.round', thing_id: 'ward', data: { late_after: 30 } }] } as unknown as Organization
  assert.deepEqual(roundOf(set, 'ward'), { ...DEFAULT_ROUND, late_after: 30 })
  // each `when '<timing>' then <n>` of the function's body, and its `else <n>` for the timings it does not name
  const table = (fn: string, keys: string[]) => { const i = sql.indexOf(`create function bedside.${fn}(`); const body = sql.slice(i, sql.indexOf('$$;', i))
    const named = Object.fromEntries([...body.matchAll(/when '([A-Za-z0-9]+)' then (\d+)/g)].map((m) => [m[1], Number(m[2])])); const other = body.match(/else (\d+) end/)
    return Object.fromEntries(keys.map((k) => [k, named[k] ?? (other ? Number(other[1]) : undefined)])) }
  const keys = DEFAULT_ROUND.times.map((t) => t.timing as string).concat('q4h')
  assert.deepEqual(table('half', keys), HALF_HOURS); assert.deepEqual(table('cover', keys), COVER_MIN); assert.deepEqual(table('per_day', keys), PER_DAY)
})
test('timings, the night rule and the ward\'s times', () => {
  assert.deepEqual(['od', 'QD', 'BID', 'tid', 'QID', 'Q6H', 'stat', 'weekly'].map(timingOf), ['OD', 'OD', 'BD', 'TDS', 'QDS', 'q6h', 'stat', 'weekly'])
  assert.equal(timingOf(null), null); assert.equal(timingOf(''), null)
  assert.deepEqual(timesFor(DEFAULT_ROUND, 'OD'), ['08:00']); assert.deepEqual(timesFor(DEFAULT_ROUND, 'OD', 'At night, after food'), ['22:00'])
  assert.equal(isNight(null, 'at night'), false, 'no timing: times not set, as the SQL\'s coalesce')
  assert.equal(timesFor(DEFAULT_ROUND, 'q4h'), null); assert.equal(timesFor(DEFAULT_ROUND, 'weekly'), null); assert.equal(timesFor(DEFAULT_ROUND, null), null)
  assert.deepEqual(timesFor(DEFAULT_ROUND, 'QDS'), ['06:00', '12:00', '18:00', '00:00'])
})
test('a local time in the clinic\'s zone, as Postgres reads it', () => {
  assert.equal(new Date(zoned('2026-03-10', '14:00', Z)).toISOString(), '2026-03-10T12:00:00.000Z')
  assert.equal(new Date(zoned('2026-07-10', '14:00', Z)).toISOString(), '2026-07-10T11:00:00.000Z')
  assert.equal(new Date(zoned('2026-04-24', '00:00', Z)).toISOString(), '2026-04-23T22:00:00.000Z', 'a time in the spring-forward gap: at the offset before it')
  assert.equal(localYmd(Date.parse('2026-03-09T21:59:00Z'), Z), '2026-03-09'); assert.equal(localYmd(Date.parse('2026-03-09T22:00:00Z'), Z), '2026-03-10')
  assert.equal(new Date(nextTime(DEFAULT_ROUND, at('2026-03-10 14:06'), Z)!).toISOString(), iso('2026-03-10 18:00'))
  assert.equal(new Date(nextTime(DEFAULT_ROUND, at('2026-03-10 23:30'), Z)!).toISOString(), iso('2026-03-11 00:00'))
})

test('the tile: the doses\' words from the board\'s read, after NEWS2 (C7)', () => {
  const row = presence('st1', { kind: 'stay', state: 'admitted', department_id: 'ward', has_vitals: true })
  const read = (d: unknown) => ({ patient_ids: ['pt'], news2: {}, doses: { st1: d } })
  assert.deepEqual(doseTileWords(row, read({ late: 1, due: 0, unset: 0 })), [{ text: '1 dose late', tone: 'danger' }])
  assert.deepEqual(doseTileWords(row, read({ late: 3, due: 1, unset: 0 })), [{ text: '3 doses late', tone: 'danger' }])
  assert.deepEqual(doseTileWords(row, read({ late: 0, due: 2, unset: 1 })), [{ text: 'times not set', tone: 'warn' }])
  for (const r of [undefined, null, 'x', { doses: null }, { doses: { other: { late: 1 } } }]) assert.deepEqual(doseTileWords(row, r), [])
  assert.deepEqual(doseTileWords({ ...row, state: 'discharged' }, read({ late: 1, due: 0, unset: 0 })), [])
  const N1 = { key: NEWS2, version: '2017', bands: [{ key: 'medium', labels: { en: 'Medium' }, min: 5, max: 6, tone: 'warn' }] } as unknown as ScoreTable
  const scored = { ...org, scores: [N1] } as Organization
  const NOW = Date.parse('2026-10-08T12:00:00Z')
  const board = { patient_ids: ['pt'], news2: { st1: { score: NEWS2, version: '2017', total: 6, band: 'medium', at: '2026-10-08T11:00:00Z' } }, doses: { st1: { late: 1, due: 0, unset: 0 } } }
  assert.deepEqual(wardTile(row, { org: scored, identity: null, read: board }, NOW), { words: [{ text: 'NEWS2 6', tone: 'warn' }, { text: '1 dose late', tone: 'danger' }] })
  const tc: TileCtx = { dept: { id: 'ward', packs: ['bedside'] }, place: null, identity: null, day: 1, can: () => true, org: scored }
  const lines = [{ pack: 'bedside', line: (r: PresenceRow, c: TileCtx) => wardTile(r, c, NOW), useRead: () => undefined }]
  assert.deepEqual(tileLineOf(lines, row, tc, { bedside: board }), [{ pack: 'bedside', words: [{ text: 'NEWS2 6', tone: 'warn' }, { text: '1 dose late', tone: 'danger' }] }])
  assert.deepEqual(tileLineOf(lines, row, tc, { other: board }), [], 'only its own read')
  const fresh = presence('st1', { kind: 'stay', state: 'admitted', department_id: 'ward', has_vitals: false, checked_in_at: '2026-10-08T10:50:00Z' })
  assert.deepEqual(wardTile(fresh, { org: scored, identity: null, read: { doses: { st1: { late: 0, due: 1, unset: 1 } } } }, NOW),
    { words: [{ text: 'no obs for 1 h', tone: 'warn' }, { text: 'times not set', tone: 'warn' }] })
})

// a canned read: two stays, the round at 14:00 opened at 13:00, now 14:06
const q = (value: string, unit: string) => ({ value, unit, ucum: unit })
const med = (id: string, drug: string, more: Partial<MedicineRead> = {}): MedicineRead =>
  ({ medication: id, version: id, since: iso('2026-03-09 09:30'), drug: { text: drug }, status: 'active', slots: [], extra: [], ...more })
const para = med('m2', 'Paracetamol', { dose: q('1', 'g'), route: 'iv', timing: 'q6h', slots: [
  { due: iso('2026-03-10 02:00'), state: 'given', dose: 'd6', at: iso('2026-03-10 02:20'), by: 'nour' }, { due: iso('2026-03-10 08:00'), state: 'late' },
  { due: iso('2026-03-10 14:00'), state: 'due' }, { due: iso('2026-03-10 20:00'), state: 'upcoming' }] })
const metro = med('m6', 'Metronidazole', { dose: q('500', 'mg'), route: 'iv', timing: 'TDS', new: true, slots: [{ due: iso('2026-03-10 13:50'), first: true, state: 'due' }] })
const furo = med('m8', 'Furosemide', { dose: q('40', 'mg'), route: 'iv', timing: 'stat', slots: [{ due: iso('2026-03-10 12:00'), first: true, state: 'late' }] })
const ondan = med('m5', 'Ondansetron', { dose: q('4', 'mg'), route: 'iv', prn: true, prn_for: 'nausea', extra: [{ dose: 'd9', at: iso('2026-03-10 03:10'), by: 'nour', status: 'completed' },
  { dose: 'd10', at: iso('2026-03-10 13:30'), by: 'nour', status: 'completed' }] })
const salb = med('m4', 'Salbutamol', { dose: q('5', 'mg'), route: 'inhaled', timing: 'q4h', unset: true })
const amlo = med('m7', 'Amlodipine', { dose: q('5', 'mg'), route: 'oral', timing: 'OD', elsewhere: true })
const insulin = med('i1', 'Soluble insulin (human)', { route: 'sc', text: 'by the sliding scale', instructions: 'before meals, by the glucose', unset: true })
const cef = med('c2', 'Ceftriaxone', { dose: q('2', 'g'), route: 'iv', timing: 'OD', slots: [{ due: iso('2026-03-10 14:00'), state: 'due' },
  { due: iso('2026-03-10 08:00'), state: 'not_given', dose: 'r1', at: iso('2026-03-10 13:20'), by: 'nour', not_given: 'vomiting' }] })
const R: RoundRead = { patient_ids: ['pt', 'pt2'], now: iso('2026-03-10 14:06'), round_at: iso('2026-03-10 14:00'), opens_at: iso('2026-03-10 13:00'), late_after: 60,
  stays: [{ stay: 's1', patient_id: 'pt', place_id: 'bed5', medicines: [para, metro, furo, ondan, salb, amlo] }, { stay: 's2', patient_id: 'pt2', place_id: 'bed3', medicines: [cef, insulin] }] }
const order = (p: string | null) => p === 'bed3' ? 3 : p === 'bed5' ? 5 : 99

test('the round\'s views', () => {
  assert.deepEqual(rowsOf(R, 'due', order).map((r) => `${r.med.medication}${r.first ? ' first' : ''}`), ['m6 first', 'c2', 'm2'], 'the first dose first, then by time, then bed')
  assert.deepEqual(rowsOf(R, 'late', order).map((r) => r.med.medication), ['m2', 'm8'], 'the oldest first')
  assert.deepEqual(rowsOf(R, 'prn', order).map((r) => r.med.medication), ['m5'])
  assert.deepEqual(rowsOf(R, 'given', order).map((r) => `${r.med.medication} ${r.state}`), ['m5 extra', 'c2 not_given'], 'since the round opened, the newest first, a dose not given among them')
  assert.deepEqual(countsOf(R), { due: 3, late: 2, prn: 1, given: 2 })
  assert.deepEqual(unsetOf(R, order).map((r) => r.med.medication), ['i1', 'm4'], 'by bed')
  assert.deepEqual(elsewhereOf(R, order).map((r) => r.med.medication), ['m7'])
  const words = { bed: (p: string | null) => p === 'bed5' ? 'Bed 5' : 'Bed 3', name: (p: string) => p === 'pt' ? 'Ahmed Hassan' : 'Mona Saleh' }
  const due = rowsOf(R, 'due', order)
  assert.deepEqual(due.filter((r) => matches(r, 'bed 5', words)).map((r) => r.med.medication), ['m6', 'm2'])
  assert.deepEqual(due.filter((r) => matches(r, 'mona', words)).map((r) => r.med.medication), ['c2'])
  assert.deepEqual(due.filter((r) => matches(r, 'PARA', words)).map((r) => r.med.medication), ['m2'])
  assert.equal(roundWords(R), '14:00 round · now 14:06'); assert.equal(roundWords({ ...R, round_at: null }), 'now 14:06')
  assert.equal(nextRound(DEFAULT_ROUND, at('2026-03-10 14:06'), Z), '18:00')
})
test('the dose the round writes', () => {
  assert.deepEqual(doseData(para, iso('2026-03-10 14:00'), { given: true }),
    { medication: 'm2', drug: { text: 'Paracetamol' }, dose: q('1', 'g'), route: 'iv', status: 'completed', bedside: { due: iso('2026-03-10 14:00') } })
  assert.deepEqual(doseData(para, iso('2026-03-10 14:00'), { given: true, dose: q('500', 'mg'), site: 'left arm', note: 'slowly' }),
    { medication: 'm2', drug: { text: 'Paracetamol' }, dose: q('500', 'mg'), route: 'iv', site: 'left arm', note: 'slowly', status: 'completed', bedside: { due: iso('2026-03-10 14:00') } })
  assert.deepEqual(doseData(ondan, null, { given: true }), { medication: 'm5', drug: { text: 'Ondansetron' }, dose: q('4', 'mg'), route: 'iv', status: 'completed' }, 'as needed: no time')
  assert.deepEqual(doseData(para, iso('2026-03-10 08:00'), { given: false, reason: 'vomiting' }),
    { medication: 'm2', drug: { text: 'Paracetamol' }, route: 'iv', status: 'not-done', reason: 'Vomiting', bedside: { due: iso('2026-03-10 08:00'), not_given: 'vomiting' } })
  assert.equal(hasDose(insulin), false); assert.equal(hasDose(para), true)
  assert.deepEqual(REASON_KEYS, ['refused', 'fasting', 'vomiting', 'not_in_stock', 'held', 'away'])
  assert.equal(shortName('Dr. Ali Hassan'), 'Ali'); assert.equal(shortName('Nour Adel'), 'Nour'); assert.equal(shortName(null), '')
  assert.equal(howWords(para), 'IV · every 6 hours'); assert.equal(howWords(insulin), 'SC · by the sliding scale · before meals, by the glucose')
  assert.equal(howWords(ondan), 'IV · as needed for nausea')
})
test('the last dose beside Give, and a late row\'s next time', () => {
  const m = med('m2', 'Paracetamol', { timing: 'q6h', slots: [{ due: iso('2026-03-10 08:00'), state: 'given', dose: 'a', at: iso('2026-03-10 08:10'), by: 'nour' }],
    extra: [{ dose: 'b', at: iso('2026-03-10 11:00'), by: 'nour', status: 'completed' }, { dose: 'c', at: iso('2026-03-10 12:00'), status: 'not-done', not_given: 'refused' }] })
  assert.deepEqual(lastGiven(m, at('2026-03-10 13:00')), { at: iso('2026-03-10 11:00'), by: 'nour', near: true }, 'within 3 h of q6h; a dose not given is never the last')
  assert.equal(lastGiven(m, at('2026-03-10 14:30'))!.near, false)
  assert.deepEqual(lastGiven(m, at('2026-03-10 10:00')), { at: iso('2026-03-10 08:10'), by: 'nour', near: true }, 'a dose after now is not counted')
  assert.equal(lastGiven(ondan, at('2026-03-10 17:00'))!.near, true, 'as needed: near within 4 h'); assert.equal(lastGiven(ondan, at('2026-03-10 17:31'))!.near, false)
  assert.equal(lastGiven(salb, at('2026-03-10 14:00')), null)
  assert.equal(nowDue(para), '14:00'); assert.equal(nowDue(furo), null)
})
console.log(`drug round: ${n} groups passed`)
