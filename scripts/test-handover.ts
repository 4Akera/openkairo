// Ward nursing's handover (spec/openCare.md §5.6, W3a): the shift being handed over and the next from the ward's shifts, with the
// 30-minute grace; whether a stay is handed over this shift; the row's facts (the tile's own words, each alert in amber, the orders
// out); the base's note one bed becomes (kind handover); the op's answer read safely; the tab's rows in bed order. Pure: no browser,
// no database.   npm run test:handover
import assert from 'node:assert/strict'
import { setClinicTimeZone } from '../src/core/ui/time'
import { GRACE, factsOf, handedOver, handoverNote, handoverOf, handoverRows, shiftNow, type HandoverRead } from '../src/packs/bedside/handover'
import { presence } from './chart-fixtures'
import type { PresenceRow } from '../src/core/db/types'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
// a Cairo clock time (UTC+3 until 29 October 2026) as an instant
const C = (t: string, d = '2026-10-09') => new Date(`${d}T${t}:00+03:00`).toISOString()
const at = (t: string, d?: string) => Date.parse(C(t, d))
const NOW = Date.parse('2026-10-09T07:30:00Z')
const S = [480, 840, 1200]

test('the shift now and the next, with the grace', () => {
  assert.equal(NOW, at('10:30'))
  assert.deepEqual(shiftNow(S, NOW), { from: '08–14', to: '14–20', at: '14:00', day: '2026-10-09', shift: 0 })
  assert.equal(`${shiftNow(S, at('14:20')).from} → ${shiftNow(S, at('14:20')).to}`, '08–14 → 14–20')
  assert.equal(shiftNow(S, at('14:30')).from, '08–14')
  assert.deepEqual(shiftNow(S, at('14:31')), { from: '14–20', to: '20–08', at: '20:00', day: '2026-10-09', shift: 1 })
  assert.deepEqual(shiftNow(S, at('03:00')), { from: '20–08', to: '08–14', at: '08:00', day: '2026-10-08', shift: 2 })
  const two = shiftNow([420, 1140], at('10:30'))
  assert.equal(two.from, '07–19'); assert.equal(two.to, '19–07'); assert.equal(two.at, '19:00')
})

test('handed over this shift', () => {
  const sh = shiftNow(S, NOW)
  assert.equal(GRACE, 30)
  assert.equal(handedOver({ at: C('09:00') }, S, sh), true)
  assert.equal(handedOver({ at: C('07:50') }, S, sh), false, 'the night’s')
  assert.equal(handedOver({ at: C('14:00') }, S, shiftNow(S, at('13:30'))), true)
  assert.equal(handedOver({ at: C('14:05') }, S, shiftNow(S, at('14:10'))), true, 'done for 08–14')
  assert.equal(handedOver({ at: C('14:05') }, S, shiftNow(S, at('19:50'))), false, 'not for 14–20')
  assert.equal(handedOver({ at: 'not a time' }, S, sh), false)
  assert.equal(handedOver(undefined, S, sh), false)
})

test('the row’s facts: the tile’s words, the alerts in amber, the orders out', () => {
  const line = { words: [{ text: 'NEWS2 6', tone: 'warn' as const }, { text: 'obs due 11:20' }, 'balance +390 mL'] }
  assert.deepEqual(factsOf(line, ['Fall risk'], 2), [{ text: 'NEWS2 6', tone: 'warn' }, { text: 'obs due 11:20' }, { text: 'balance +390 mL' },
    { text: 'Fall risk', tone: 'warn' }, { text: '2 orders out' }])
  assert.deepEqual(factsOf(line, [], 1).at(-1), { text: '1 order out' })
  assert.equal(factsOf(line, [], 0).length, 3)
  assert.deepEqual(factsOf({ words: 'no obs yet' }, [], 0), [{ text: 'no obs yet' }])
  assert.deepEqual(factsOf({ words: ['  ', { text: '' }, 'NEWS2 2'] }, [' '], 0), [{ text: 'NEWS2 2' }])
  assert.deepEqual(factsOf(null, ['Do not resuscitate'], 3), [{ text: 'Do not resuscitate', tone: 'warn' }, { text: '3 orders out' }])
})

test('the base’s note for one bed', () => {
  const sh = { from: '08–14', to: '14–20' }; const facts = [{ text: 'NEWS2 6' }, { text: 'Fall risk', tone: 'warn' as const }]
  assert.equal(handoverNote(facts, { shift: ' ', next: '' }, sh), null)
  assert.deepEqual(handoverNote(facts, { shift: 'a', next: 'b' }, sh),
    { kind: 'handover', heading: 'Handover 08–14 → 14–20', text: 'At handover: NEWS2 6 · Fall risk\nThis shift: a\nFor the next shift: b' })
  assert.equal(handoverNote([], { shift: 'a', next: 'b' }, sh)?.text, 'This shift: a\nFor the next shift: b')
  assert.equal(handoverNote([], { shift: '', next: '  b ' }, sh)?.text, 'For the next shift: b')
  assert.equal(handoverNote(facts, { shift: '  a  ', next: '' }, sh)?.text, 'At handover: NEWS2 6 · Fall risk\nThis shift: a')
})

test('the op’s answer, read safely', () => {
  assert.equal(handoverOf(null, 'st'), undefined)
  assert.equal(handoverOf({ stays: {} }, 'st'), undefined)
  const bad = { stays: { st: { alerts: 'Fall risk', last: { at: 'never' } } } } as unknown as HandoverRead
  assert.deepEqual(handoverOf(bad, 'st'), { alerts: [] })
  const mixed = { stays: { st: { alerts: [1, '', 'Fall risk'] } } } as unknown as HandoverRead
  assert.deepEqual(handoverOf(mixed, 'st'), { alerts: ['Fall risk'] })
  const good = { alerts: ['Fall risk'], last: { at: C('07:50'), by: 'u', heading: 'Handover 20–08 → 08–14', text: 'This shift: x' } }
  assert.deepEqual(handoverOf({ stays: { st: good } }, 'st'), good)
})

test('the tab’s rows: beds by position, then no bed by admission; the discharged and the visits left out', () => {
  const stay = (item: string, over: Partial<PresenceRow>) => presence(item, { kind: 'stay', state: 'admitted', department_id: 'ward', ...over })
  const rows = [stay('b3', { place_id: 'p3', checked_in_at: C('06:00') }), stay('b1', { place_id: 'p1', checked_in_at: C('09:00') }),
    stay('late', { checked_in_at: C('09:30') }), stay('early', { checked_in_at: C('05:00') }), stay('gone', { state: 'discharged', place_id: 'p2' }),
    presence('visit', { state: 'with' })]
  const pos: Record<string, number> = { p1: 1, p2: 2, p3: 3 }
  const position = (r: PresenceRow) => r.place_id ? pos[r.place_id] ?? null : null
  const read = { stays: { b1: { alerts: [], last: { at: C('09:00') } }, late: { alerts: ['Fall risk'], last: { at: C('07:50') } } } }
  const sh = shiftNow(S, NOW)
  const all = handoverRows(rows, read, S, sh, position)
  assert.deepEqual(all.map((x) => x.row.item), ['b1', 'b3', 'early', 'late'])
  assert.deepEqual(all.map((x) => x.done), [true, false, false, false])
  assert.deepEqual(all[3].stay?.alerts, ['Fall risk'])
  assert.deepEqual(handoverRows(rows, read, S, sh, position, true).map((x) => x.row.item), ['b3', 'early', 'late'])
  assert.deepEqual(handoverRows(rows, null, S, sh, position).map((x) => x.done), [false, false, false, false])
})

console.log(`handover: ${n} groups passed`)
