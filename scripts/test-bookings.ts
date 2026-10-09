// The bookings pack's client (spec/openCare.md §5.7) and the core changes it brought (h), (l), (m), as pure decisions: how long "/book 3m"
// is, the nearest free places, a session's places, which orders wait to be booked, a row's place and the queue in its turn, the words
// on a row and an order, the bench's To book; every refusal the pack raises has its words; bookings names no other pack.
//   npm run test:bookings
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { addDays, capacityOf, dayWords, groupOf, inDays, inWords, nearest, placeOfRow, placesOf, toBook, wordsOfRow, type FreeSession, type Places, type Session } from '../src/packs/bookings/logic'
import { REFUSALS } from '../src/packs/bookings/words'
import { benchViewsOf, inTurn, orderWordsOf, placeOf, registerBenchView, registerOrderWords, registerRowPlace, turnOf, type BenchViewDef, type OrderWordsDef, type PackRow, type RowCtx, type RowPlaceDef } from '../src/core/screens/rows'
import type { OrderRow } from '../src/core/db/types'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const root = new URL('../', import.meta.url)
const read = (p: string) => readFileSync(new URL(p, root), 'utf8')
const order = (item: string, service: string | null, step: string | null = 'sent'): OrderRow => ({ item, patient_id: 'pt', visit_id: null, requester_id: 'dr', from_department_id: 'gp',
  to_department_id: 'ecg', service_id: service, service_code: null, service_name: service, priority: 'routine', status: 'active', step, step_key: null, step_item: null, step_entry: null,
  answers: [], answered_at: null, final: false, about_item: null, ordered_at: '2026-10-08T08:00:00Z', last_at: '2026-10-08T08:00:00Z', day: '2026-10-08', latest_entry: 'e', version: 1, source_entries: [] })
const row = (key: string, orders: OrderRow[], visit: string | null = null): PackRow => ({ key, patient_id: 'pt', visit_id: visit, orders })
const ctx = (packs: string[]): RowCtx => ({ list: 'bench', dept: { id: 'ecg', name: 'ECG room', packs, declared: {} }, can: () => true })

test('/book: 3m is three months, 2w two weeks, 10d ten days, a weekday the next one; nothing is a week; anything else asks again', () => {
  assert.deepEqual(['3m', '2w', '10d', '1y', '', ' 6 '].map((t) => inDays(t)), [91, 14, 10, 365, 7, 6])
  assert.equal(inDays('tue', 'sun'), 2); assert.equal(inDays('sunday', 'sun'), 7, 'a weekday that is today: next week'); assert.equal(inDays('thu', 'fri'), 6)
  assert.deepEqual(['0', 'soon', '3x'].map((t) => inDays(t)), [null, null, null])
  assert.deepEqual([91, 14, 10, 7, 1].map(inWords), ['3 months', '2 weeks', '10 days', '1 week', '1 day'])
})
test('a day as the desk says it, and days ahead', () => {
  assert.equal(dayWords('2026-10-11'), 'Sun 11 Oct'); assert.equal(dayWords('2027-01-10T08:00:00Z'), 'Sun 10 Jan')
  assert.equal(addDays('2026-12-30', 3), '2027-01-02'); assert.equal(addDays('2026-10-08', -8), '2026-09-30')
})
const free = (day: string, how: 'time' | 'number', extra: Partial<FreeSession> = {}): FreeSession => ({ session_id: `${how}`, name: how, day, how, from: how === 'time' ? '17:00' : '09:00', to: '20:00',
  every: 15, doctor_id: null, place_id: null, services: [], capacity: 10, booked: 0, left: 5, next_number: how === 'number' ? 6 : null,
  times: how === 'time' ? [{ at: `${day}T14:00:00Z`, taken: true }, { at: `${day}T14:30:00Z`, taken: false }] : null, ...extra })
test('the nearest free places to a day: one a session and day, nearest first; a full one, or one whose times are all taken, never', () => {
  const ss = [free('2027-01-12', 'time'), free('2027-01-10', 'number'), free('2027-01-17', 'number'), free('2027-01-09', 'number', { left: 0 }),
    free('2027-01-11', 'time', { times: [{ at: '2027-01-11T14:00:00Z', taken: true }] })]
  const near = nearest(ss, '2027-01-10', 4)
  assert.deepEqual(near.map((x) => x.label), ['Sun 10 Jan · No. 6', 'Tue 12 Jan · 16:30', 'Sun 17 Jan · No. 6'], 'Cairo time; the full and the taken left out')
  assert.equal(near[1].at, '2027-01-12T14:30:00Z', 'a time session gives its first free time')
})
const sNum: Session = { id: 'm', name: 'Morning', days: ['sun'], from: '09:00', to: '13:00', how: 'number', places: 4 }
const sTime: Session = { id: 'e', name: 'Evening', days: ['sun'], from: '17:00', to: '18:00', how: 'time', every: 20 }
test('a session\'s places on a day: its numbers (and one overbooked past them), or its times, each with its bookings', () => {
  const b = (number: number | null, starts_at: string, session_id = 'm') => ({ session_id, day: '2026-10-11', number, starts_at })
  const ps = placesOf(sNum, '2026-10-11', [b(2, '2026-10-11T07:00:00Z'), b(5, '2026-10-11T10:00:00Z')])
  assert.deepEqual(ps.map((p) => `${p.at}:${p.b.length}`), ['No. 1:0', 'No. 2:1', 'No. 3:0', 'No. 4:0', 'No. 5:1'])
  const ts = placesOf(sTime, '2026-10-11', [b(null, '2026-10-11T14:20:00Z', 'e')])
  assert.deepEqual(ts.map((p) => `${p.at}:${p.b.length}`), ['17:00:0', '17:20:1', '17:40:0'], '17:20 Cairo is 14:20 UTC')
  assert.deepEqual([capacityOf(sNum), capacityOf(sTime)], [4, 3])
  const off = placesOf(sTime, '2026-10-11', [b(null, '2026-10-11T14:30:00Z', 'e')])
  assert.deepEqual(off.map((p) => `${p.at}:${p.b.length}`), ['17:00:0', '17:20:0', '17:30:1', '17:40:0'], 'a booking off the grid (the hours changed since) keeps its time and shows')
})
const places = (p: Partial<Places> = {}): Places => ({ visits: {}, orders: {}, today: '2026-10-08', now: '2026-10-08T09:00:00Z', books: ['echo', 'holter'], ...p })
const placed = (day: string, state: 'booked' | 'here' | 'missed' | 'cancelled', starts_at = `${day}T07:00:00Z`, number: number | null = null) => ({ day, state, starts_at, number, session_id: 's', department_id: 'ecg' })
test('a bench\'s orders to book: not started, a service a session books, no standing booking (a missed one is to book again)', () => {
  const r = row('pt', [order('o1', 'echo'), order('o2', 'ecg'), order('o3', 'echo', 'started'), order('o4', 'holter'), order('o5', 'echo')])
  const p = places({ orders: { o4: placed('2026-10-11', 'booked'), o5: placed('2026-10-07', 'missed') } })
  assert.deepEqual(toBook(r, p).map((o) => o.item), ['o1', 'o5'], 'the ECG (no session books it), the started echo and the booked Holter are not')
  assert.deepEqual(toBook(r, places({ books: 'any' })).map((o) => o.item), ['o1', 'o2', 'o4', 'o5'], 'a session naming no service books any')
  assert.deepEqual(['o1', 'o2', 'o4', 'o5'].map((o) => groupOf(o, r, p)), ['To book', null, 'Booked · coming', 'To book'], 'To book, and booked for a later day: coming')
  assert.equal(groupOf('o1', r, p, () => true), null, 'a walk-in with Now is here: it stays in To do')
  assert.equal(groupOf('o5', r, p, () => true), 'To book', 'a walk-in whose booking was missed is to book again')
  assert.equal(groupOf('o4', r, places({ orders: { o4: placed('2026-10-08', 'booked') } })), null, 'booked for today: it stays in To do, at its place')
})
test('a row\'s place: a booked visit at its time or number; a bench patient at today\'s booked order; none else', () => {
  const p = places({ visits: { v1: { at: '2026-10-08T08:24:00Z', number: 4, session: 'Morning' } }, orders: { o1: placed('2026-10-08', 'booked', '2026-10-08T10:00:00Z'),
    o2: placed('2026-10-08', 'here', '2026-10-08T09:30:00Z'), o3: placed('2026-10-09', 'booked') } })
  assert.equal(placeOfRow(row('a', [], 'v1'), p), '2026-10-08T08:24:00Z')
  assert.equal(placeOfRow(row('b', [order('o1', 'echo'), order('o2', 'echo')]), p), '2026-10-08T09:30:00Z', 'the earliest of today\'s')
  assert.equal(placeOfRow(row('c', [order('o3', 'echo')]), p), null, 'tomorrow\'s is not today\'s place'); assert.equal(placeOfRow(row('d', [], 'v9'), p), null)
})
test('the words: "booked · No. 4" on a booked visit; an order booked for another day, today, missed, here', () => {
  const p = places({ visits: { v1: { at: '2026-10-08T08:24:00Z', number: 4, session: 'Morning' } }, orders: { o1: placed('2026-10-11', 'booked', '2026-10-11T07:00:00Z'),
    o2: placed('2026-10-08', 'booked', '2026-10-08T07:30:00Z'), o3: placed('2026-10-07', 'missed'), o4: placed('2026-10-08', 'here') } })
  assert.deepEqual(wordsOfRow(row('a', [], 'v1'), p), [{ word: 'booked · No. 4', tone: 'info' }])
  assert.deepEqual(wordsOfRow(row('b', ['o1', 'o2', 'o3', 'o4'].map((o) => order(o, 'echo'))), p).map((w) => `${w.order}:${w.word}`),
    ['o1:booked · Sun 11 Oct 10:00', 'o2:booked · 10:30', 'o3:missed · Wed 7 Oct', 'o4:here'])
})

// ── the core changes (h), (l), (m): registered by a pack, drawn only where the department uses it, in its pack order ──
test('(h) the queue in its turn (owner: a booked patient goes in at their time, ahead of walk-ins who came earlier; walk-ins fill the gaps)', () => {
  const t = (h: string) => Date.parse(`2026-10-08T${h}:00Z`); const now = t('09:00')
  assert.deepEqual(turnOf(t('08:00'), t('08:30'), now), [0, t('08:30')], 'here before a place that has come: ahead, at the place')
  assert.deepEqual(turnOf(t('08:00'), t('09:30'), now), [1, t('09:30')], 'came early for a place still to come: waits for it')
  assert.deepEqual(turnOf(t('08:45'), t('08:30'), now), [1, t('08:45')], 'came after the place: as they came, into the gaps')
  assert.deepEqual(turnOf(t('08:10'), null, now), [1, t('08:10')], 'a walk-in: as they came')
  // the approved picture (book-queue): Fathy No. 5 and Samira No. 6 here for places that have come; Adel walked in 41 min ago; Wafaa came
  // early for No. 7, still to come; Rasha walked in 12 min ago; Omar is urgent
  const rows = [{ id: 'adel', urgent: false, came: '08:19', place: null }, { id: 'fathy', urgent: false, came: '08:35', place: '08:48' },
    { id: 'samira', urgent: false, came: '08:56', place: '08:56' }, { id: 'wafaa', urgent: false, came: '08:10', place: '09:12' },
    { id: 'rasha', urgent: false, came: '08:48', place: null }, { id: 'omar', urgent: true, came: '08:58', place: null }]
  assert.deepEqual(inTurn(rows, (r) => r.urgent ? 0 : 1, (r) => t(r.came), (r) => r.place ? t(r.place) : null, now).map((r) => r.id),
    ['omar', 'fathy', 'samira', 'adel', 'rasha', 'wafaa'], 'urgent; the booked whose places came, in place order; the walk-ins as they came; Wafaa waits for 09:12')
  assert.deepEqual(inTurn(rows, (r) => r.urgent ? 0 : 1, (r) => t(r.came), (r) => r.place ? t(r.place) : null, t('09:15')).map((r) => r.id),
    ['omar', 'fathy', 'samira', 'wafaa', 'adel', 'rasha'], 'at 09:15 her place has come: Wafaa goes ahead of the walk-ins')
  const defs: RowPlaceDef[] = [{ pack: 'other', place: () => 'not a time' }, { pack: 'bookings', place: () => '2026-10-08T09:00:00Z' }, { pack: 'off', place: () => '2026-10-08T01:00:00Z' }]
  assert.equal(placeOf(defs, row('a', []), ctx(['other', 'bookings']), {}), t('09:00'), 'the first pack the department uses that gives a time; a pack not used here says nothing')
  assert.equal(placeOf([{ pack: 'p', load: async () => 1, place: () => '2026-10-08T09:00:00Z' }], row('a', []), ctx(['p']), {}), null, 'a pack whose data is not read yet says nothing')
})
test('(l) the words on a row\'s orders and on the row: only orders on the row, one a pack, at most 40 letters, a state tone only; digits allowed', () => {
  const defs: OrderWordsDef[] = [{ pack: 'p', words: () => [{ order: 'o1', word: '  booked ·  Sun 11 Oct 10:00 ', tone: 'info' }, { order: 'o1', word: 'again' }, { order: 'zz', word: 'not here' },
    { word: 'booked · No. 4', tone: 'accent' as never }, { order: 'o2', word: 'x'.repeat(60) }] }]
  const m = orderWordsOf(defs, row('a', [order('o1', 'echo'), order('o2', 'echo')]), ctx(['p']), {})
  assert.deepEqual(m.get('o1'), [{ key: 'p', word: 'booked · Sun 11 Oct 10:00', tone: 'info' }], 'one a pack; spaces tidied; the date and time kept')
  assert.deepEqual(m.get(''), [{ key: 'p', word: 'booked · No. 4' }], 'the row\'s own, its colour dropped (not a state)')
  assert.equal(m.get('o2')![0].word.length, 40); assert.ok(!m.has('zz'), 'an order not on the row says nothing')
  assert.equal(orderWordsOf(defs, row('a', [order('o1', 'echo')]), ctx(['q']), {}).size, 0, 'a pack the department does not use says nothing')
})
test('(m) a pack\'s view on a bench: its label and its orders by group, only where the department uses it', () => {
  const defs: BenchViewDef[] = [{ pack: 'p', label: ' To book ', group: (o) => o === 'o1' ? 'To book' : o === 'o2' ? 'Booked · coming' : null }]
  const v = benchViewsOf(defs, [row('a', [order('o1', 'echo'), order('o2', 'echo'), order('o3', 'ecg')])], ctx(['p']), {})
  assert.deepEqual(v.map((x) => [x.label, [...x.groups.entries()]]), [['To book', [['o1', 'To book'], ['o2', 'Booked · coming']]]])
  assert.deepEqual(benchViewsOf(defs, [row('a', [order('o1', 'echo')])], ctx([]), {}), [])
})
test('each hook is a pack\'s, once: the core\'s or the base\'s, or a second, is refused', () => {
  const quiet = console.error; console.error = () => undefined
  try {
    assert.equal(registerRowPlace('base', { place: () => null }), false); assert.equal(registerOrderWords('core', { words: () => [] }), false)
    assert.equal(registerBenchView('t1', { label: '', group: () => null }), false, 'a view needs its label')
    assert.equal(registerRowPlace('t1', { place: () => null }), true); assert.equal(registerRowPlace('t1', { place: () => null }), false)
  } finally { console.error = quiet }
})

// ── words and boundaries ──
test('every refusal bookings raises has its words', () => {
  const sql = read('supabase/migrations/20260926000016_bookings.sql')
  const codes = [...new Set([...sql.matchAll(/core\.refuse\('([a-z_]+)'/g)].map((m) => m[1]))].filter((c) => !['not_found', 'too_many'].includes(c))
  const missing = codes.filter((c) => !REFUSALS[c]); assert.deepEqual(missing, [], 'words for each code')
  const checks = [...new Set([...sql.matchAll(/'code', '([a-z_]+)'/g)].map((m) => m[1]))].filter((c) => c !== 'duplicate')
  assert.deepEqual(checks.filter((c) => !REFUSALS[c]), [], 'and for the settings\' checks')
})
test('bookings names no other pack, in its screens or its server; a booking is never a record entry', () => {
  const others = readdirSync(new URL('src/packs/', root), { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'bookings').map((d) => d.name)
  const files = readdirSync(new URL('src/packs/bookings/', root)).map((f) => read(`src/packs/bookings/${f}`)).join('\n') + read('supabase/migrations/20260926000016_bookings.sql')
  for (const o of others) assert.ok(!new RegExp(`\\b${o}\\b`, 'i').test(files), `names ${o}`)
  assert.ok(!/declare_type\(/.test(read('supabase/migrations/20260926000016_bookings.sql')), 'no record type of its own')
})
console.log(`bookings: ${n} groups passed`)
