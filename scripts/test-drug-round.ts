// Ward nursing's drug round (spec/openCare.md §5.6, piece 3): the ward's dose times and their defaults held equal to the migration's, the
// timings, a local time in the clinic's zone, the tile's dose words from the board's read (C7), the round's views, the dose the round
// writes, the last dose beside Give. Pure: no browser, no database.   npm run test:drug-round
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setClinicTimeZone, shortDate } from '../src/core/ui/time'
import { COVER_MIN, DEFAULT_ROUND, HALF_HOURS, PER_DAY, firstCover, firstDoseWords, isNight, localHm, localYmd, nextTime, roundOf, timesFor, timingOf, zoned, type Round } from '../src/packs/bedside/schedule'
import { REASON_KEYS, doseBannerWords, doseData, doseTileWords, hasDose, howWords, sheetChip, sheetSummary, shortName, wardTile, type MedicineRead, type RoundRead } from '../src/packs/bedside/doses'
import { byDay, countsOf, elsewhereOf, lastGiven, matches, nextRound, nowDue, roundWords, rowsOf, unsetOf } from '../src/packs/bedside/round'
import { readingOf, type GivenDose, type MedVersion } from '../src/packs/bedside/twin'
import { NEWS2 } from '../src/packs/bedside/line'
import { tileLineOf, type TileCtx } from '../src/core/screens/ward/tiles'
import { E, listRow, org, presence, record, table } from './chart-fixtures'
import type { Identity, Organization, PresenceRow, ScoreTable } from '../src/core/db/types'

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
  const two = med('m2', 'Paracetamol', { slots: [{ due: iso('2026-03-09 20:00'), state: 'given', dose: 'a', at: iso('2026-03-09 20:10') }, { due: iso('2026-03-09 14:00'), state: 'not_given', dose: 'b', at: iso('2026-03-09 14:05') },
    { due: iso('2026-03-10 08:00'), state: 'late' }, { due: iso('2026-03-10 02:00'), state: 'missed' }], extra: [{ dose: 'c', at: iso('2026-03-10 03:00'), status: 'completed' }] })
  assert.deepEqual(byDay(two), [{ day: '2026-03-09', given: 1, not: 1, late: 0, missed: 0 }, { day: '2026-03-10', given: 1, not: 0, late: 1, missed: 1 }])
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
// ── 3b: the client's twin of the rule, on the SQL suite's own case (drug_round.sql c–h) ──
const rx = (item: string, drug: string, timing: string | null, local: string, more: Record<string, unknown> = {}, v = 1, visit: string | null = 'st'): MedVersion =>
  ({ id: `${item}v${v}`, item, item_version: v, occurred_at: iso(local), visit_id: visit, data: { basis: 'prescribed', drug: { text: drug }, dosage: timing ? { timing: { code: timing } } : {}, status: 'active', ...more } as MedVersion['data'] })
const given = (id: string, medication: string, local: string, due: string | null, status = 'completed'): GivenDose =>
  ({ id, occurred_at: iso(local), data: { medication, status, ...(due ? { bedside: { due: iso(due) } } : {}) } })
const VS = [rx('m1', 'Ceftriaxone', 'OD', '2026-03-09 09:30', { duration_days: 7 }), rx('m2', 'Paracetamol', 'q6h', '2026-03-09 09:30'),
  rx('m3', 'Omeprazole', 'OD', '2026-03-09 09:30', { instructions: 'at night' }), rx('m4', 'Salbutamol', 'q4h', '2026-03-09 09:30'),
  rx('m5', 'Ondansetron', null, '2026-03-09 09:30', { dosage: { as_needed: true, as_needed_for: 'nausea' } }), rx('m6', 'Metronidazole', 'TDS', '2026-03-10 13:50', { duration_days: 5 }),
  rx('m8', 'Furosemide', 'stat', '2026-03-10 12:00'), rx('m7', 'Amlodipine', 'OD', '2026-03-01 10:00', {}, 1, null)]
const DS = [given('d1', 'm1', '2026-03-09 09:40', '2026-03-09 09:30'), given('d2', 'm1', '2026-03-10 08:10', '2026-03-10 08:00'), given('d3', 'm2', '2026-03-09 09:45', '2026-03-09 09:30'),
  given('d4', 'm2', '2026-03-09 14:05', '2026-03-09 14:00'), given('d5', 'm2', '2026-03-09 20:10', '2026-03-09 20:00', 'not-done'), given('d6', 'm2', '2026-03-10 02:20', null),
  given('d7', 'm3', '2026-03-09 09:50', '2026-03-09 09:30'), given('d8', 'm3', '2026-03-09 22:05', '2026-03-09 22:00'), given('d9', 'm5', '2026-03-10 03:10', null), given('d10', 'm5', '2026-03-10 13:30', null)]
const day = (d: string, vs: MedVersion[], ds: GivenDose[], now: string, r: Round = DEFAULT_ROUND) => readingOf(vs, ds, 'st', r, Z, at(`${d} 00:00`), at(`${d} 00:00`) + 86_400_000, at(now))
const states = (x: ReturnType<typeof readingOf>, item: string) => x.slots.filter((s) => s.item === item).map((s) => `${localHm(s.due, Z)} ${s.state}${s.first ? ' first' : ''}`)
const extra = (x: ReturnType<typeof readingOf>, ds: GivenDose[], item: string) => ds.filter((d) => d.data.medication === item && !x.slots.some((s) => s.dose === d.id)).map((d) => d.id)

test('the shared case: the twin gives the server\'s states', () => {
  const t = day('2026-03-10', VS, DS, '2026-03-10 14:06')
  assert.deepEqual(states(t, 'm1'), ['08:00 given']); assert.deepEqual(states(t, 'm2'), ['02:00 given', '08:00 late', '14:00 due', '20:00 upcoming'])
  assert.deepEqual(states(t, 'm3'), ['22:00 upcoming']); assert.deepEqual(states(t, 'm4'), []); assert.deepEqual(states(t, 'm5'), [])
  assert.deepEqual(states(t, 'm6'), ['13:50 due first', '22:00 upcoming']); assert.deepEqual(states(t, 'm8'), ['12:00 late first'])
  assert.deepEqual(t.unset, ['m4']); assert.deepEqual(t.elsewhere, ['m7'])
  const y = day('2026-03-09', VS, DS, '2026-03-10 14:06')
  assert.deepEqual(states(y, 'm1'), ['09:30 given first']); assert.deepEqual(states(y, 'm2'), ['09:30 given first', '20:00 not_given']); assert.deepEqual(extra(y, DS, 'm2').filter((d) => d === 'd4'), ['d4'])
  assert.deepEqual(states(y, 'm3'), ['22:00 given']); assert.ok(extra(y, DS, 'm3').includes('d7'))
  const w = readingOf(VS, DS, 'st', DEFAULT_ROUND, Z, at('2026-03-10 14:06') - 25 * 3_600_000, at('2026-03-10 14:06') + 2 * 3_600_000, at('2026-03-10 14:06'))
  assert.equal(w.slots.filter((s) => s.state === 'late').length, 2); assert.equal(w.slots.filter((s) => s.state === 'due').length, 2); assert.deepEqual(w.unset, ['m4'])
  const later = readingOf(VS, DS, 'st', DEFAULT_ROUND, Z, at('2026-03-09 09:00'), at('2026-03-21 00:00'), at('2026-03-20 12:00'))
  assert.equal(later.slots.filter((s) => s.item === 'm1').length, 7); assert.equal(later.slots.filter((s) => s.item === 'm6').length, 15)
  // the changes: amlodipine continued here, ceftriaxone stopped, paracetamol 500 mg, zopiclone at night with no timing, d3 crossed out, d11
  const vs = [...VS, rx('m7', 'Amlodipine', 'OD', '2026-03-10 09:00', {}, 2), rx('m1', 'Ceftriaxone', 'OD', '2026-03-10 10:00', { duration_days: 7, status: 'stopped' }, 2),
    rx('m2', 'Paracetamol', 'q6h', '2026-03-10 10:30', { dosage: { timing: { code: 'q6h' }, dose: { value: '500', unit: 'mg' } } }, 2), rx('m10', 'Zopiclone', null, '2026-03-10 11:00', { instructions: 'at night' })]
  const ds = [...DS.filter((d) => d.id !== 'd3'), given('d11', 'm2', '2026-03-10 14:05', '2026-03-10 14:00')]
  const c = day('2026-03-10', vs, ds, '2026-03-10 14:06')
  assert.deepEqual(states(c, 'm7'), []); assert.deepEqual(c.elsewhere, []); assert.deepEqual(states(c, 'm1'), ['08:00 given'])
  assert.deepEqual(states(c, 'm2'), ['02:00 given', '08:00 late', '14:00 given', '20:00 upcoming']); assert.deepEqual(c.unset.sort(), ['m10', 'm4'])
  assert.deepEqual(states(day('2026-03-09', vs, ds, '2026-03-10 14:06'), 'm2'), ['09:30 missed first', '20:00 not_given'])
  const d12 = [...ds, given('d12', 'm2', '2026-03-10 14:07', '2026-03-10 08:00', 'not-done')]
  assert.ok(states(day('2026-03-10', vs, d12, '2026-03-10 14:10'), 'm2').includes('08:00 not_given'))
  const d13 = day('2026-03-10', vs, [...d12, given('d13', 'm2', '2026-03-10 14:08', '2026-03-10 08:00')], '2026-03-10 14:10')
  assert.equal(d13.slots.find((s) => s.item === 'm2' && localHm(s.due, Z) === '08:00')!.dose, 'd13', 'a dose given outranks a refusal of the same time')
  // a stopped medicine's unrecorded time is missed, never late (drug_round.sql h: furosemide stopped at 14:11)
  const stop = day('2026-03-10', [...vs, rx('m8', 'Furosemide', 'stat', '2026-03-10 14:11', { status: 'stopped' }, 2)], ds, '2026-03-10 14:12')
  assert.deepEqual(states(stop, 'm8'), ['12:00 missed first'])
  const r30 = { ...DEFAULT_ROUND, late_after: 30 }
  assert.deepEqual(states(day('2026-03-10', VS, DS, '2026-03-10 14:15', r30), 'm6')[0], '13:50 due first'); assert.deepEqual(states(day('2026-03-10', VS, DS, '2026-03-10 14:25', r30), 'm6')[0], '13:50 late first')
})
test('the first dose\'s cover', () => {
  const cov = (timing: string, local: string, r: Round = DEFAULT_ROUND, ins?: string) => { const c = firstCover(r, timing, ins, at(local), Z)
    return { first: c.first, stands: c.stands.map((x) => new Date(x).toISOString()), next: c.next === null ? null : new Date(c.next).toISOString() } }
  assert.deepEqual(cov('TDS', '2026-03-10 14:06'), { first: true, stands: [iso('2026-03-10 14:00')], next: iso('2026-03-10 22:00') })
  assert.deepEqual(cov('TDS', '2026-03-10 12:30').stands, [iso('2026-03-10 14:00')]); assert.deepEqual(cov('TDS', '2026-03-10 15:30'), { first: true, stands: [], next: iso('2026-03-10 22:00') })
  assert.deepEqual(cov('TDS', '2026-03-10 19:00'), { first: true, stands: [iso('2026-03-10 22:00')], next: iso('2026-03-11 06:00') })
  assert.deepEqual(cov('q6h', '2026-03-10 11:30'), { first: true, stands: [iso('2026-03-10 14:00')], next: iso('2026-03-10 20:00') })
  assert.deepEqual(cov('q6h', '2026-03-10 09:30').stands, [iso('2026-03-10 14:00')], 'exactly 4 h 30 min: inclusive'); assert.deepEqual(cov('q6h', '2026-03-10 09:29').stands, [])
  assert.deepEqual(cov('OD', '2026-03-10 07:50'), { first: true, stands: [iso('2026-03-10 08:00')], next: iso('2026-03-11 08:00') }); assert.deepEqual(cov('OD', '2026-03-10 05:30').stands, [iso('2026-03-10 08:00')])
  assert.deepEqual(cov('OD', '2026-03-10 19:00'), { first: true, stands: [], next: iso('2026-03-11 08:00') })
  assert.deepEqual(cov('OD', '2026-03-10 21:00'), { first: true, stands: [iso('2026-03-11 08:00')], next: iso('2026-03-12 08:00') })
  const q4: Round = { ...DEFAULT_ROUND, late_after: 180, times: [{ timing: 'q4h', at: '02:00 06:00 10:00 14:00 18:00 22:00' }] }
  assert.deepEqual(cov('q4h', '2026-03-10 11:00', q4).stands, [iso('2026-03-10 10:00'), iso('2026-03-10 14:00')])
  assert.deepEqual(cov('OD', '2026-03-10 09:30', DEFAULT_ROUND, 'at night'), { first: false, stands: [], next: iso('2026-03-10 22:00') })
  assert.equal(cov('OD', '2026-03-10 22:30', DEFAULT_ROUND, 'at night').next, iso('2026-03-11 22:00'))
  const one = (v: MedVersion, now = '2026-03-20 12:00') => readingOf([v], [], 'st', DEFAULT_ROUND, Z, at('2026-03-01 00:00'), at('2026-03-21 00:00'), at(now)).slots
  assert.equal(one(rx('s', 'Furosemide', 'stat', '2026-03-10 12:00')).length, 1)
  assert.ok(!readingOf([rx('c', 'Amlodipine', 'OD', '2026-03-01 10:00', {}, 1, null), rx('c', 'Amlodipine', 'OD', '2026-03-10 09:00', {}, 2)], [], 'st', DEFAULT_ROUND, Z,
    at('2026-03-10 00:00'), at('2026-03-12 00:00'), at('2026-03-11 12:00')).slots.some((x) => x.first), 'continued in the stay: no first dose')
  const od = one(rx('o', 'X', 'OD', '2026-03-10 09:30', { duration_days: 7 })); assert.equal(od.length, 7); assert.equal(new Date(od[6].due).toISOString(), iso('2026-03-16 08:00'))
  assert.equal(one(rx('b', 'X', 'BD', '2026-03-10 09:30', { duration_days: 7 })).length, 14)
  const tds = one(rx('t', 'X', 'TDS', '2026-03-10 09:30', { duration_days: 5 })); assert.equal(tds.length, 15); assert.equal(new Date(tds[14].due).toISOString(), iso('2026-03-15 06:00'))
})
test('matching a dose to a time', () => {
  const vs = [rx('c', 'X', 'q6h', '2026-03-01 10:00', {}, 1, null), rx('c', 'X', 'q6h', '2026-03-10 07:00', {}, 2)]
  const run = (ds: GivenDose[]) => readingOf(vs, ds, 'st', DEFAULT_ROUND, Z, at('2026-03-10 00:00'), at('2026-03-11 00:00'), at('2026-03-10 23:00')).slots.map((s) => `${localHm(s.due, Z)} ${s.dose ?? ''}`.trim())
  assert.deepEqual(run([given('a', 'c', '2026-03-10 13:50', '2026-03-10 08:00')]), ['08:00 a', '14:00', '20:00'], 'a named dose takes its time though a nearer one is free')
  assert.deepEqual(run([given('b', 'c', '2026-03-10 08:20', '2026-03-10 08:00'), given('a', 'c', '2026-03-10 08:10', '2026-03-10 08:00')]), ['08:00 a', '14:00', '20:00'], 'two naming one: the first given')
  assert.deepEqual(run([given('a', 'c', '2026-03-10 08:05', '2026-03-10 08:00', 'not-done'), given('b', 'c', '2026-03-10 08:40', '2026-03-10 08:00')]), ['08:00 b', '14:00', '20:00'], 'given before not given')
  assert.deepEqual(run([given('a', 'c', '2026-03-10 04:59', null)]), ['08:00', '14:00', '20:00'], 'beyond half the interval: extra')
  assert.deepEqual(run([given('a', 'c', '2026-03-10 07:40', null), given('b', 'c', '2026-03-10 08:10', null)]), ['08:00 b', '14:00', '20:00'], 'two near one time: the nearer')
  const f = [rx('f', 'X', 'q6h', '2026-03-10 11:30')]
  const fx = readingOf(f, [given('a', 'f', '2026-03-10 11:35', '2026-03-10 11:30'), given('b', 'f', '2026-03-10 14:05', '2026-03-10 14:00')], 'st', DEFAULT_ROUND, Z, at('2026-03-10 00:00'), at('2026-03-11 00:00'), at('2026-03-10 23:00'))
  assert.deepEqual(fx.slots.map((s) => s.dose ?? null), ['a', null], 'a dose naming a time under the first dose is extra')
  assert.deepEqual(run([given('a', 'c', '2026-03-10 14:07', '2026-03-10 08:00', 'not-done'), given('b', 'c', '2026-03-10 14:08', '2026-03-10 08:00')]), ['08:00 b', '14:00', '20:00'],
    'an outranked refusal is extra: never the free 14:00 by nearness')
  assert.deepEqual(run([given('a', 'c', '2026-03-10 08:05', '2026-03-10 08:00'), given('b', 'c', '2026-03-10 11:10', '2026-03-10 08:00')]), ['08:00 a', '14:00', '20:00'],
    'a second dose naming a time is extra, never the next free time')
})
test('the banner\'s word, the sheet\'s chip and Summary line (the twin on the record)', () => {
  const es = VS.map((v) => E('medication', { id: v.id, item: v.item, item_version: v.item_version, occurred_at: v.occurred_at, visit_id: v.visit_id, data: v.data as Record<string, unknown> }))
  const rec = record({ 'base.lists': table(es.map((e) => listRow('medications', [e], 'active')), es), 'base.presence': table([presence('st', { kind: 'stay', state: 'admitted', department_id: 'ward' })]) })
  const own = (ds: GivenDose[]) => ({ shown: [...ds.map((d) => E('bedside.dose', { id: d.id, occurred_at: d.occurred_at, data: d.data })), E('x.transfusion', { data: { status: 'completed' } }),
    E('x.vaccine', { data: { medication: 'v1', status: 'completed' } })], hidden: [] })
  const o = { ...org, organization: { id: 'o', name: 'Demo', time_zone: Z, record_view: 'visits' }, settings: [], settingKeys: [], datatypes: {},
    allDepartments: [{ id: 'ward', name: 'Medical Ward', packs: ['bedside'] }, { id: 'gp', name: 'General Practice', packs: [] }] } as unknown as Organization
  const x = { rec, ctx: { org: o, me: 'rn', departmentId: 'ward' }, identity: {} as Identity, own: own(DS) }; const NOW = at('2026-03-10 14:06')
  assert.deepEqual(doseBannerWords(x, NOW), [{ word: '2 doses late', rank: 1, tone: 'danger' }, { word: 'times not set', rank: 2, tone: 'warn' }])
  assert.deepEqual(doseBannerWords({ ...x, own: own([...DS, given('f1', 'm8', '2026-03-10 13:00', '2026-03-10 12:00')]) }, NOW)[0], { word: '1 dose late', rank: 1, tone: 'danger' })
  assert.deepEqual(doseBannerWords({ ...x, rec: record({ 'base.lists': rec.tables['base.lists']! }) }, NOW), [], 'no open stay')
  const gp = record({ 'base.lists': rec.tables['base.lists']!, 'base.presence': table([presence('st', { kind: 'stay', state: 'admitted', department_id: 'gp' })]) })
  assert.deepEqual(doseBannerWords({ ...x, rec: gp }, NOW), [], 'a stay on a ward without Ward nursing has no round: nothing late')
  assert.deepEqual(sheetChip({ ...x, own: own(DS) }, NOW), { word: '2 late', tone: 'danger' })
  assert.equal(sheetSummary({ ...x, own: own(DS) }, NOW), '2 late · 2 due · times not set for 1')
})
test('the note under /rx: the first dose on this ward', () => {
  const w = (frequency: string | null, local: string, more: Record<string, unknown> = {}) => firstDoseWords({ action: 'start', frequency, ...more }, DEFAULT_ROUND, at(local), Z)
  const tds = 'On this ward: 06:00 · 14:00 · 22:00 — the first dose as soon as it is signed'
  assert.deepEqual(w('TDS', '2026-03-10 14:06'), { text: `${tds} (it stands for the 14:00 dose), then 22:00` })
  assert.deepEqual(w('TDS', '2026-03-10 15:30'), { text: `${tds}, then 22:00` }); assert.deepEqual(w('TDS', '2026-03-10 19:00'), { text: `${tds} (it stands for the 22:00 dose), then 06:00 tomorrow` })
  assert.deepEqual(w('OD', '2026-03-10 19:00'), { text: 'On this ward: 08:00 — the first dose as soon as it is signed, then 08:00 tomorrow' })
  assert.deepEqual(w('OD', '2026-03-10 21:00'), { text: `On this ward: 08:00 — the first dose as soon as it is signed (it stands for the 08:00 dose tomorrow), then 08:00 on ${shortDate(iso('2026-03-12 08:00'))}` })
  assert.deepEqual(w('OD', '2026-03-10 09:30', { instructions_text: 'at night' }), { text: 'On this ward: at night, 22:00 — the first dose tonight, 22:00' })
  assert.deepEqual(w('stat', '2026-03-10 09:30'), { text: 'One dose, as soon as it is signed' })
  assert.deepEqual(w('PRN', '2026-03-10 09:30', { prn: true }), { text: 'As needed: on the round\'s As needed list' })
  assert.deepEqual(w('q4h', '2026-03-10 09:30'), { text: 'This ward has no times for every 4 hours: it waits under "Times not set · ask the doctor" until the ward sets them (Settings → Departments)', tone: 'warn' })
  assert.equal(w(null, '2026-03-10 09:30'), null); assert.equal(firstDoseWords({ action: 'change', frequency: 'TDS' }, DEFAULT_ROUND, at('2026-03-10 09:30'), Z), null)
})
console.log(`drug round: ${n} groups passed`)
