// Dialysis's client (spec/openCare.md §5.6): the unit's days (Sat · Mon · Wed, Sun · Tue · Thu; a week Saturday … Thursday), its setting
// (shifts, hours, the chairs kept for HBV and HCV, shown, never a stop), who is due under the board (the clinics' C5 rows: their words,
// Start's session and Missed), the tile's words from the board's read (C7), the Schedule tab's week, the refusals' words, the session
// (test-haemodialysis-session.ts: Before, the prescription, the readings) and its end (test-haemodialysis-end.ts: events, the unit's
// drugs, End, the banner). Pure: no browser, no database.
//   npm run test:haemodialysis
import assert from 'node:assert/strict'
import { setClinicTimeZone } from '../src/core/ui/time'
import { registerWords, words } from '../src/core/db/words'
import { tileLineOf, type TileCtx } from '../src/core/screens/ward/tiles'
import type { BoardRow } from '../src/core/screens/ward/rows'
import type { Organization, PatientBanner, Place, PresenceRow, ServerEntry } from '../src/core/db/types'
import { DAYS, addDays, dayDate, dayWord, daysBetween, daysOf, onDay, weekDays, weekOf } from '../src/packs/haemodialysis/days'
import { chairWarning, chairsOf, keptFor, shiftNow, shiftWords, unitOf } from '../src/packs/haemodialysis/unit'
import { SESSION, boardRow, dueOf, dueWords, fromKey, isolationOf, keyOf, missedEntry, missedShows, orderRows, startEntries, type DueRow } from '../src/packs/haemodialysis/due'
import { boardOf, hmm, staysKey, tileWords, type Board } from '../src/packs/haemodialysis/board'
import { REFUSALS } from '../src/packs/haemodialysis/words'
import { awayWords, grid, inWords, nameOf, patternTaken, slotCount, taken, undoBlocked, weekOfData, type Week } from '../src/packs/haemodialysis/week'
import { E, presence } from './chart-fixtures'
import { endGroups } from './test-haemodialysis-end'
import { sessionGroups } from './test-haemodialysis-session'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }

const NOW = Date.parse('2026-10-10T08:00:00Z')   // a Saturday, 11:00 in Cairo
const ago = (m: number) => new Date(NOW - m * 60_000).toISOString()
const place = (id: string, name: string, position: number, more: Partial<Place> = {}): Place =>
  ({ id, department_id: 'hd', parent_id: null, label: 'chair', name, position, closed: false, closed_reason: null, ...more })
const CHAIRS = [place('c3', 'Chair 3', 3), place('c1', 'Chair 1', 1), place('c7', 'HCV chair 7', 7), place('c8', 'HBV chair 8', 8), place('w1', 'Bed 1', 1, { department_id: 'ward' })]
const setting = { key: 'haemodialysis.unit', thing_id: 'hd', owner_id: 'org', recorded_at: ago(9000), data: { shifts: ['07:00', '11:30', '16:00'], hours: 4, hbv_chairs: ['HBV chair 8'], hcv_chairs: ['  hcv CHAIR 7 '] } }
const org = { places: CHAIRS, settings: [setting], settingKeys: [], datatypes: {} } as unknown as Organization
const U = unitOf(org, 'hd')

test('days: the two patterns, a Friday in neither, the week Saturday … Thursday', () => {
  assert.equal(onDay('sat_mon_wed', '2026-10-10'), true); assert.equal(onDay('sun_tue_thu', '2026-10-10'), false)
  assert.equal(onDay('sun_tue_thu', '2026-10-11'), true); assert.equal(onDay('sat_mon_wed', '2026-10-11'), false)
  assert.equal(onDay('sat_mon_wed', '2026-10-09'), false); assert.equal(onDay('sun_tue_thu', '2026-10-09'), false); assert.equal(daysOf('2026-10-09'), null)
  assert.equal(daysOf('2026-10-12'), 'sat_mon_wed'); assert.equal(daysOf('2026-10-15'), 'sun_tue_thu')
  assert.equal(weekOf('2026-10-09'), '2026-10-03', 'a Friday: the Saturday before'); assert.equal(weekOf('2026-10-10'), '2026-10-10'); assert.equal(weekOf('2026-10-15'), '2026-10-10')
  assert.deepEqual(weekDays('2026-10-10').map(dayWord), ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'])
  assert.equal(dayDate('2026-10-10'), 'Sat 10'); assert.equal(addDays('2026-10-31', 1), '2026-11-01'); assert.equal(daysBetween('2026-10-01', '2026-10-10'), 9)
  assert.deepEqual(DAYS.map(([, w]) => w), ['Sat · Mon · Wed', 'Sun · Tue · Thu'])
})

test('unit: its defaults, the kept chairs by name (case and spaces aside), the warnings in their order, the shift on now', () => {
  const none = unitOf({ settings: [], settingKeys: [], datatypes: {} } as unknown as Organization, 'hd')
  assert.deepEqual(none.shifts, ['07:00', '11:30', '16:00']); assert.equal(none.hours, 4); assert.deepEqual([none.hbv, none.hcv], [[], []])
  assert.equal(unitOf(undefined, 'hd').hours, 4)
  assert.equal(keptFor({ name: '  hcv CHAIR 7 ' }, U), 'hcv'); assert.equal(keptFor({ name: 'HCV chair 7' }, U), 'hcv'); assert.equal(keptFor({ name: 'HBV chair 8' }, U), 'hbv')
  assert.equal(keptFor({ name: 'Chair 1' }, U), null); assert.equal(keptFor(null, U), null)
  assert.equal(chairWarning(['hcv'], keptFor({ name: 'Chair 3' }, U), 'Chair 3'), 'HCV: Chair 3 is not kept for HCV')
  assert.equal(chairWarning(['hbv'], null, 'Chair 3'), 'HBV: Chair 3 is not kept for HBV')
  assert.equal(chairWarning(['hcv'], 'hbv', 'HBV chair 8'), 'HCV: HBV chair 8 is not kept for HCV')
  assert.equal(chairWarning([], 'hbv', 'HBV chair 8'), 'HBV chair 8 is kept for HBV')
  assert.equal(chairWarning(['hbv', 'hcv'], 'hbv', 'HBV chair 8'), null, 'HBV and HCV: the HBV chair fits')
  assert.equal(chairWarning(['hbv', 'hcv'], 'hcv', 'HCV chair 7'), 'HBV: HCV chair 7 is not kept for HBV')
  assert.equal(chairWarning(['hbv', 'hcv'], null, 'Chair 3'), 'HBV: Chair 3 is not kept for HBV')
  assert.equal(chairWarning(['hbv'], 'hbv', 'HBV chair 8'), null); assert.equal(chairWarning(['hcv'], 'hcv', 'HCV chair 7'), null); assert.equal(chairWarning([], null, 'Chair 1'), null)
  assert.equal(shiftNow(U, '06:59'), 0); assert.equal(shiftNow(U, '07:00'), 1); assert.equal(shiftNow(U, '11:30'), 2); assert.equal(shiftNow(U, '23:00'), 3)
  assert.equal(shiftWords(U, 2), 'Shift 2 · 11:30'); assert.equal(shiftWords(U, 4), 'Shift 4 · ?')
  assert.deepEqual(chairsOf(org, 'hd').map((c) => c.name), ['Chair 1', 'Chair 3', 'HCV chair 7', 'HBV chair 8'], 'the unit\'s, by position')
})

const row = (more: Partial<DueRow> = {}): DueRow => ({ patient_id: 'pt', slot_id: 'sl1', on: '2026-10-10', shift: 1, starts: '07:00', starts_at: ago(240), place_id: 'c1', hours: 4,
  isolation: [], last_on: '2026-10-07', ...more })
const who: PatientBanner = { id: 'pt', record_number: 10162, given_name: 'Hassan', middle_name: 'Fathy', family_name: 'Morsy', sex: 'male', born_on: '1960', age: 66, died_on: null,
  merged_into_id: null, phone_text: null }
const chair = (id: string) => CHAIRS.find((c) => c.id === id)

test('due: the key round trip, the words in order, C5\'s row, the order, isolation from the alerts', () => {
  const r = row(); const k = fromKey(keyOf(r))
  assert.deepEqual(k, { on: '2026-10-10', shift: 1, chair: 'c1', slot: 'sl1', hours: 4 })
  assert.deepEqual(fromKey(keyOf(row({ slot_id: undefined, move_id: 'mv' }))), { on: '2026-10-10', shift: 1, chair: 'c1', move: 'mv', hours: 4 })
  for (const junk of ['', 'x', 'a|b|c|d|e|f', '2026-10-10|9|c1|||4', '2026-10-10|1||||4', '2026-10-10|1|c1|||0']) assert.equal(fromKey(junk), null, junk)
  assert.deepEqual(dueWords(row({ starts_at: ago(29) }), chair('c1'), U, NOW), ['Chair 1', 'due 07:00', 'last session Wed'], 'up to 29 minutes late: plain')
  assert.deepEqual(dueWords(row({ starts_at: ago(30) }), chair('c1'), U, NOW), ['Chair 1', { text: 'due 07:00', tone: 'warn' }, 'last session Wed'], '30 minutes late: amber')
  assert.deepEqual(dueWords(row({ starts_at: ago(0), isolation: ['hcv'], place_id: 'c7' }), chair('c7'), U, NOW), ['HCV chair 7', 'due 07:00', { text: 'HCV', tone: 'info' }, 'last session Wed'])
  assert.deepEqual(dueWords(row({ starts_at: ago(0), isolation: ['hcv'], place_id: 'c3' }), chair('c3'), U, NOW),
    ['Chair 3', 'due 07:00', { text: 'HCV', tone: 'info' }, { text: 'HCV: Chair 3 is not kept for HCV', tone: 'warn' }, 'last session Wed'])
  assert.deepEqual(dueWords(row({ starts_at: ago(0), place_id: 'c8' }), chair('c8'), U, NOW), ['HBV chair 8', 'due 07:00', { text: 'HBV chair 8 is kept for HBV', tone: 'warn' }, 'last session Wed'])
  const w = (more: Partial<DueRow>) => dueWords(row({ starts_at: ago(0), ...more }), chair('c1'), U, NOW).slice(2)
  assert.deepEqual(w({ move_id: 'mv' }), ['moved here for today', 'last session Wed'])
  assert.deepEqual(w({ last_on: '2026-10-08' }), ['last session Thu'], 'two days ago: its day')
  assert.deepEqual(w({ last_on: '2026-10-04' }), ['last session Sun'], 'six days ago: its day still')
  assert.deepEqual(w({ last_on: '2026-10-01' }), ['last session 9 days ago'])
  assert.deepEqual(w({ last_on: undefined }), ['first session here'])
  assert.deepEqual(w({ elsewhere: 'Medical Ward' }), ['last session Wed', { text: 'in Medical Ward', tone: 'warn' }])
  assert.deepEqual(dueWords(row({ starts: undefined, shift: 2, starts_at: undefined }), undefined, U, NOW), ['due 11:30', 'last session Wed'], 'the setting\'s start when the row has none')
  const b = boardRow(row(), who, chair('c1'), U, NOW)
  assert.equal(b.key, keyOf(row())); assert.equal(b.patientId, 'pt'); assert.equal(b.number, 10162); assert.equal(b.name, 'Hassan Morsy'); assert.equal(b.sexAge, 'M 66')
  assert.equal(b.since, ago(240)); assert.equal(b.reason, 'Haemodialysis')
  assert.deepEqual([boardRow(row(), undefined, chair('c1'), U, NOW).name, boardRow(row(), undefined, chair('c1'), U, NOW).number], ['Patient', null])
  const rows = [row({ shift: 2, place_id: 'c1', patient_id: 'a' }), row({ place_id: 'c7', patient_id: 'b' }), row({ place_id: 'c3', patient_id: 'c' }), row({ place_id: 'c1', patient_id: 'd' })]
    .map((r) => boardRow(r, undefined, chair(r.place_id), U, NOW))
  assert.deepEqual(orderRows(rows, CHAIRS).map((r) => r.patientId), ['d', 'c', 'b', 'a'], 'by shift, then the chair\'s position')
  const due = dueOf({ on: '2026-10-10', shift: 1, patient_ids: ['pt'], rows: [{ patient_id: 'pt', on: '2026-10-10', shift: 1, place_id: 'c1', hours: 4, isolation: ['hcv'] }, { on: 'x' }, null] })
  assert.equal(due?.rows.length, 1); assert.deepEqual(due?.rows[0].isolation, ['hcv']); assert.equal(dueOf(null), null); assert.equal(dueOf({ rows: 'x' }), null)
  const alert = (code: string, status: string, more: Partial<ServerEntry> = {}) =>
    E('alert', { data: { concept: { text: code, codings: [{ system: 'local.alert', code }] }, status }, ...more })
  const a1 = alert('isolation_hcv', 'active')
  assert.deepEqual(isolationOf([a1]), ['hcv'])
  assert.deepEqual(isolationOf([a1, alert('isolation_hcv', 'inactive', { item: a1.item, item_version: 2 })]), [], 'its latest version inactive')
  assert.deepEqual(isolationOf([a1, E('crossed_out', { item: a1.item, item_version: 2 })]), [], 'crossed out')
  assert.deepEqual(isolationOf([alert('isolation_hbv', 'active'), alert('dnr', 'active'), a1]), ['hbv', 'hcv'])
})

const stay = { id: 'st1', place_id: 'c6', department_id: 'hd' }
test('Start: the session begun in the stay just opened, from the row\'s key', () => {
  const b = boardRow(row({ slot_id: 'sl1' }), who, chair('c1'), U, NOW)
  const es = startEntries(b, stay)
  assert.equal(es.length, 1); const e = es[0]
  assert.equal(e.type, 'haemodialysis.session'); assert.equal(e.visit_id, 'st1'); assert.equal(e.department_id, 'hd'); assert.equal(e.patient_id, 'pt'); assert.ok(e.id)
  const d = e.data as { concept: unknown; status: string; performed: { value: string; precision: string }; haemodialysis: Record<string, unknown> }
  assert.deepEqual(d.concept, SESSION); assert.equal(d.status, 'in-progress'); assert.equal(d.performed.precision, 'minute'); assert.ok(Date.parse(d.performed.value) > NOW - 86_400_000 * 365)
  assert.deepEqual(d.haemodialysis, { on: '2026-10-10', shift: 1, chair: 'c1', slot: 'sl1', hours: 4 }, 'the scheduled chair, whichever chair Start chose')
  assert.deepEqual(startEntries({ ...b, key: 'junk' }, stay), [])
})

test('Missed: the session not done, in no stay, "Did not come"', () => {
  const e = missedEntry(boardRow(row(), who, chair('c1'), U, NOW), 'hd')
  assert.equal(e.type, 'haemodialysis.session'); assert.equal(e.visit_id, undefined); assert.equal(e.department_id, 'hd')
  const d = e.data as { status: string; performed: unknown; reason: string; haemodialysis: Record<string, unknown> }
  assert.equal(d.status, 'not-done'); assert.deepEqual(d.performed, { value: '2026-10-10', precision: 'day' }); assert.equal(d.reason, 'Did not come')
  assert.deepEqual(d.haemodialysis, { on: '2026-10-10', shift: 1, chair: 'c1', slot: 'sl1', hours: 4, missed: 'not_came' })
  assert.throws(() => missedEntry({ key: 'junk' } as BoardRow, 'hd'))
  // offered once the row's shift has begun: the next shift is listed up to an hour early
  assert.equal(missedShows({ since: ago(-45) }, NOW), false, 'the shift starts in 45 minutes'); assert.equal(missedShows({ since: ago(0) }, NOW), true)
  assert.equal(missedShows({ since: ago(240) }, NOW), true); assert.equal(missedShows({ since: null }, NOW), true, 'no start time: shown')
})

test('the tile: the session\'s time, the blood pressure, a chair that does not fit; nothing before the read or for a visit', () => {
  const st = (placeId = 'c1') => presence('st1', { kind: 'stay', state: 'admitted', department_id: 'hd', place_id: placeId })
  const ctx = (placeId = 'c1') => ({ dept: { id: 'hd', packs: ['haemodialysis'] }, place: chair(placeId) ?? null, org })
  const board = (f: Board['stays'][string]): Board => ({ patient_ids: ['pt'], stays: { st1: f } })
  const on = (min: number, hours?: number) => ({ item: 'h1', status: 'in-progress', on: '2026-10-10', shift: 1, ...(hours ? { hours } : {}), started: ago(min) })
  for (const d of [undefined, null, 'x', { stays: [] }, { patient_ids: [], stays: {} }]) assert.equal(tileWords(st(), ctx(), d, NOW), null)
  assert.equal(tileWords(presence('v1', { kind: 'visit', state: 'with' }), ctx(), board({ session: on(10, 4) }), NOW), null, 'a visit: nothing')
  assert.deepEqual(tileWords(st(), ctx(), board({}), NOW), { words: [{ text: 'no session', tone: 'warn' }] })
  assert.deepEqual(tileWords(st(), ctx(), board({ session: on(150, 4) }), NOW), { words: ['on · 1:30 left'] })
  assert.deepEqual(tileWords(st(), ctx(), board({ session: on(250, 4) }), NOW), { words: [{ text: 'over by 0:10', tone: 'warn' }] })
  assert.deepEqual(tileWords(st(), ctx(), board({ session: on(150) }), NOW), { words: ['on · 2:30'] })
  assert.deepEqual(tileWords(st(), ctx(), board({ session: { ...on(300, 4), status: 'completed' } }), NOW), { words: [{ text: 'ended · not discharged', tone: 'warn' }] })
  const bp = (sys: number, dia: number) => tileWords(st(), ctx(), board({ session: on(150, 4), bp: { sys, dia, at: ago(150) } }), NOW)?.words
  assert.deepEqual(bp(88, 54), ['on · 1:30 left', { text: 'BP 88/54', tone: 'danger' }])
  assert.deepEqual(bp(96, 60), ['on · 1:30 left', { text: 'BP 96/60', tone: 'warn' }])
  assert.deepEqual(bp(146, 84), ['on · 1:30 left', 'BP 146/84'])
  assert.deepEqual(tileWords(st('c3'), ctx('c3'), board({ session: on(150, 4), isolation: ['hcv'] }), NOW), { words: ['on · 1:30 left', { text: 'HCV: Chair 3 is not kept for HCV', tone: 'warn' }] })
  assert.deepEqual(tileWords(st('c7'), ctx('c7'), board({ session: on(150, 4), isolation: ['hcv'] }), NOW), { words: ['on · 1:30 left'] }, 'HCV in the HCV chair: no warning')
  assert.equal(hmm(90), '1:30'); assert.equal(hmm(5), '0:05'); assert.equal(hmm(-3), '0:00')
  assert.deepEqual(boardOf({ stays: { a: {} } }), { patient_ids: [], stays: { a: {} } })
  // through the board's own tile line, with C7's read: the line sees the board as ctx.read
  const b = board({ session: on(150, 4), bp: { sys: 146, dia: 84, at: ago(150) } })
  const lines = [{ pack: 'haemodialysis', line: (r: PresenceRow, c: TileCtx) => tileWords(r, c, c.read, NOW), useRead: () => b }]
  const tc = (packs: string[]): TileCtx => ({ ...ctx(), dept: { id: 'hd', packs }, identity: null, day: 1, can: () => true })
  assert.deepEqual(tileLineOf(lines, st(), tc(['haemodialysis']), { haemodialysis: b }), [{ pack: 'haemodialysis', words: [{ text: 'on · 1:30 left' }, { text: 'BP 146/84' }] }])
  assert.deepEqual(tileLineOf(lines, st(), tc(['haemodialysis'])), [], 'before the board answers: nothing')
  assert.deepEqual(tileLineOf(lines, st(), tc([])), [], 'only where the unit uses the pack')
  assert.deepEqual(tileLineOf(lines, st(), tc(['haemodialysis']), { other: b }), [], 'never another pack\'s read')
  const a = [presence('s2', { version: 3 }), presence('s1', { version: 1, has_vitals: true })]
  assert.equal(staysKey(a), staysKey([...a].reverse())); assert.equal(staysKey(a), 's1@1:1,s2@3:0')
})

test('the week: a row a chair, a cell a day; a move in, a slot (moved away or not), a kept chair, free; the count and what is taken', () => {
  const week = weekOfData({ from: '2026-10-10', to: '2026-10-15', today: '2026-10-10', patient_ids: ['pt', 'p2', 'p3', 'p4', 'p5'],
    isolation: { p2: ['hcv'], p4: ['hbv'], pt: [] },
    slots: [{ id: 's1', patient_id: 'pt', days: 'sat_mon_wed', shift: 1, place_id: 'c1', starts_on: '2026-09-01' },
      { id: 's2', patient_id: 'p2', days: 'sun_tue_thu', shift: '1', place_id: 'c1', starts_on: '2026-10-13', note: 'new here' },
      { id: 's3', patient_id: 'p3', days: 'sun_tue_thu', shift: 1, place_id: 'c3', starts_on: '2026-09-01', ends_on: '2026-10-12' },
      { id: 's4', patient_id: 'p4', days: 'sat_mon_wed', shift: 2, place_id: 'c8', starts_on: '2026-09-01' },
      { id: 'junk', patient_id: 'p9', days: 'mon_wed', shift: 1, place_id: 'c3', starts_on: '2026-09-01' }],
    moves: [{ id: 'm1', patient_id: 'pt', slot_id: 's1', from_on: '2026-10-12', to_on: '2026-10-15', shift: 1, place_id: 'c3', reason: 'family wedding' },
      { id: 'm2', patient_id: 'p5', to_on: '2026-10-14', shift: 1, place_id: 'c7', reason: 'extra' }, { id: 'm3', patient_id: 'p6', reason: 'nowhere' }] }) as Week
  assert.ok(week); assert.equal(week.slots.length, 4, 'a slot of no pattern passed over'); assert.equal(week.moves.length, 2, 'a move from and to nowhere passed over')
  assert.equal(week.slots[1].shift, 1); assert.equal(week.slots[1].note, 'new here'); assert.equal(weekOfData(null), null); assert.equal(weekOfData({ from: '2026-10-10', slots: 'x', moves: [] }), null)
  const say = (c: ReturnType<typeof grid>[number]['cells'][number]['cell']) => c.kind === 'slot' ? `slot ${c.slot.id}${c.warn ? ` ! ${c.warn}` : ''}`
    : c.kind === 'away' ? `away ${c.slot.id} ${awayWords(c.move)}` : c.kind === 'in' ? `in ${c.move.id}${c.warn ? ` ! ${c.warn}` : ''}` : c.kind === 'kept' ? `kept ${c.kept}` : 'free'
  const g = grid(week, 1, chairsOf(org, 'hd'), U)
  assert.deepEqual(g.map((r) => r.chair.name), ['Chair 1', 'Chair 3', 'HCV chair 7', 'HBV chair 8'])
  assert.deepEqual(g[0].cells.map((c) => c.on), ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'])
  assert.deepEqual(g[0].cells.map((c) => say(c.cell)), ['slot s1', 'free', 'away s1 moved to Thu', 'slot s2 ! HCV: Chair 1 is not kept for HCV', 'slot s1', 'slot s2 ! HCV: Chair 1 is not kept for HCV'],
    'the other pattern\'s slot only from its first day; the one moved away struck')
  assert.deepEqual(g[1].cells.map((c) => say(c.cell)), ['free', 'slot s3', 'free', 'free', 'free', 'in m1'], 'a slot until its last day; a move in')
  assert.deepEqual(g[2].cells.map((c) => say(c.cell)), ['kept hcv', 'kept hcv', 'kept hcv', 'kept hcv', 'in m2 ! HCV chair 7 is kept for HCV', 'kept hcv'])
  assert.deepEqual(g[3].cells.map((c) => say(c.cell)), Array(6).fill('kept hbv'), 'another shift\'s slot absent')
  assert.deepEqual(grid(week, 2, chairsOf(org, 'hd'), U)[3].cells.map((c) => say(c.cell)), ['slot s4', 'kept hbv', 'slot s4', 'kept hbv', 'slot s4', 'kept hbv'], 'HBV in the HBV chair: no warning')
  assert.equal(awayWords({}), 'off this day'); assert.equal(inWords, 'this week only')
  assert.equal(slotCount(week), 10, 's1 twice (Monday moved away), s2 twice, s3 once, s4 three times, two moves in')
  assert.equal(taken(week, 'c1', '2026-10-10', 1), true); assert.equal(taken(week, { id: 'c1' }, '2026-10-12', 1), false, 'moved away: free that day')
  assert.equal(taken(week, 'c3', '2026-10-15', 1), true, 'a move in'); assert.equal(taken(week, 'c7', '2026-10-10', 1), false); assert.equal(taken(week, 'c1', '2026-10-10', 2), false)
  assert.equal(patternTaken(week, 'c1', 'sat_mon_wed', 1), true); assert.equal(patternTaken(week, 'c3', 'sat_mon_wed', 1), false); assert.equal(patternTaken(week, 'c3', 'sun_tue_thu', 1), true)
  assert.equal(patternTaken(week, 'c3', 'sun_tue_thu', 1, '2026-10-13'), true, 'from Tue: the move into Chair 3 on Thu holds it')
  assert.equal(patternTaken(week, 'c3', 'sun_tue_thu', 1, '2026-10-16'), false, 'from Fri: the slot ended Mon, the move in was Thu')
  assert.equal(patternTaken(week, 'c1', 'sat_mon_wed', 1, '2026-11-01'), true, 'an open slot holds its chair from any day')
  assert.equal(patternTaken(week, 'c7', 'sun_tue_thu', 1), false, 'a move in on another pattern\'s day')
  const m1 = week.moves[0]; const plus = (m: Week['moves'][number]) => ({ ...week, moves: [...week.moves, m] })
  assert.equal(undoBlocked(week, m1), null, 'Chair 1 free on Mon: the session can come back')
  assert.equal(undoBlocked(plus({ id: 'm9', patient_id: 'p5', to_on: '2026-10-12', shift: 1, place_id: 'c1', reason: 'x' }), m1), 'chair_taken', 'another session moved into Chair 1 that Mon')
  assert.equal(undoBlocked(plus({ id: 'm9', patient_id: 'p5', to_on: '2026-10-12', shift: 2, place_id: 'c1', reason: 'x' }), m1), null, 'another shift')
  assert.equal(undoBlocked(plus({ id: 'm9', patient_id: 'pt', to_on: '2026-10-12', shift: 1, place_id: 'c7', reason: 'x' }), m1), 'already_due', 'the patient comes that Mon by another move')
  assert.equal(undoBlocked(week, week.moves[1]), null, 'an extra session: nothing comes back')
  assert.equal(nameOf(who), 'Hassan Morsy'); assert.equal(nameOf(undefined), 'Patient')
})

test('words: the refusals in the pack\'s words', () => {
  registerWords(REFUSALS)
  assert.equal(words('chair_taken'), 'That chair is taken then'); assert.equal(words('session_on_day'), 'A session is recorded for this patient today already')
  assert.equal(words('shifts_out_of_order'), 'Shifts start in order: earliest first'); assert.equal(words('already_due'), 'This patient comes that day already')
})

// the session (D2b): Before, the prescription, the readings, the tile's fluid words
sessionGroups(test)
// the session's end (D2c): events, the unit's drugs, End, the banner's word
endGroups(test)

console.log(`haemodialysis: ${n} groups passed`)
