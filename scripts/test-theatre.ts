// Theatre (spec/openCare.md §5.7), as pure decisions: /op's words (the operation by its words or code, the side, elective · urgent ·
// emergency, day case or admitted, the anaesthetic wanted, the surgeon, ? the question) and the order it writes (the pack's type on the
// base's order, its words beside); where a case stands and the list's next key; the order of a room's day and To schedule; the
// sessions with room for a case's usual time; the WHO checklist's counts.   npm run test:theatre
import assert from 'node:assert/strict'
import { opLine, opWords, parseOp, knowOperations } from '../src/packs/theatre/line'
import { STEP_OF_PART, byPosition, countOff, freeSessions, nextOf, operationsOf, roomsOf, toSchedule, waiting, type Part } from '../src/packs/theatre/model'
import { draftEntries } from '../src/core/db/entries'
import type { Ctx } from '../src/core/screens/visit/parse'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const svc = (code: string, name: string) => ({ id: code, code, name, department_id: 'th', section_name: 'General surgery', steps: ['scheduled', 'operating'] })
const OPS = [svc('ihr_mesh', 'Inguinal hernia repair, open mesh (Lichtenstein)'), svc('uhr_mesh', 'Umbilical hernia repair, mesh'), svc('lapchole', 'Laparoscopic cholecystectomy'), svc('lapappx', 'Laparoscopic appendicectomy')]
const ctx: Ctx = { services: OPS, departments: [{ id: 'sc', name: 'Surgery clinic', packs: ['surgery'] }, { id: 'th', name: 'Theatre', packs: ['theatre'] }], problems: [], departmentId: 'sc', templates: [] }

test('/op\'s words: the side, the priority, the stay, the anaesthetic wanted, the surgeon after "by", ? the question', () => {
  const s = opWords('lichtenstein right elective day spinal by Dr. Hesham Abdelaal')
  assert.deepEqual([s.words, s.side, s.priority, s.stay, s.technique, s.surgeon], [['lichtenstein'], 'right', 'routine', 'day', 'spinal', 'Dr. Hesham Abdelaal'])
  assert.equal(opWords('lap chole emergency ? perforated').priority, 'stat'); assert.equal(opWords('lap chole ? perforated').question, 'perforated')
  assert.equal(opLine('ihr_mesh', s, { side: 'left' }), '/op ihr_mesh left day spinal by Dr. Hesham Abdelaal ')
})
test('/op writes the base\'s order to the Theatre with theatre\'s words; a word fitting two is asked, none is said', () => {
  knowOperations([{ code: 'ihr_mesh', usual_min: 60, side: true, risks: ['bleeding', 'the hernia comes back'] }, { code: 'lapchole', usual_min: 75 }])
  const r = parseOp('lichtenstein right', ctx); assert.ok(r && 'ok' in r)
  const p = r.ok[0]; assert.equal(p.function, 'order'); assert.equal(p.params.service_id, 'ihr_mesh')
  assert.deepEqual(p.params.as, { type: 'theatre.op', words: { side: 'right', usual_min: 60, risks: ['bleeding', 'the hernia comes back'] } })
  const lap = parseOp('lap chole', ctx); assert.ok(lap && 'ok' in lap); assert.equal((lap.ok[0].params.as as { words: { side: string } }).words.side, 'none', 'no side asked: none')
  const two = parseOp('hernia', ctx); assert.ok(two && 'ok' in two); assert.deepEqual(two.ok[0].params.choices, ['ihr_mesh', 'uhr_mesh'])
  const none = parseOp('whipple', ctx); assert.ok(none && 'error' in none)
  const e = draftEntries({ id: 'd', function: 'order', params: { ...p.params } }, { patientId: 'p', departmentId: 'sc', org: { services: OPS } as never })
  assert.equal(e[0].type, 'theatre.op'); assert.equal((e[0].data as { theatre: { side: string } }).theatre.side, 'right')
})
test('where a case stands moves by one key at a time: Send for, Arrived, the three parts, Out, Back', () => {
  const parts = (...p: Part[]) => new Set<Part>(p)
  assert.equal(nextOf(null, parts())?.word, 'Schedule'); assert.equal(nextOf('scheduled', parts())?.word, 'Send for'); assert.equal(nextOf('sent_for', parts())?.word, 'Arrived')
  assert.equal(nextOf('arrived', parts())?.part, 'sign_in'); assert.equal(nextOf('anaesthetic', parts('sign_in'))?.part, 'time_out')
  assert.equal(nextOf('operating', parts('sign_in', 'time_out'))?.part, 'sign_out'); assert.equal(nextOf('operating', parts('sign_in', 'time_out', 'sign_out'))?.step, 'recovery')
  assert.equal(nextOf('recovery', parts('sign_in', 'time_out', 'sign_out'))?.step, 'back'); assert.equal(nextOf('back', parts('sign_in', 'time_out', 'sign_out')), null)
  assert.equal(STEP_OF_PART.sign_in, 'anaesthetic'); assert.equal(STEP_OF_PART.time_out, 'operating')
})
test('a room\'s day in the order put; To schedule by priority then weeks waiting', () => {
  const c = (pos: number, starts: string) => ({ slot: { position: pos, starts } })
  assert.deepEqual(byPosition([c(2, 'b'), c(0, 'a'), c(1, 'c')]).map((x) => x.slot.position), [0, 1, 2])
  const t = toSchedule([{ priority: 'routine', ordered_at: '2026-08-01' }, { priority: 'urgent', ordered_at: '2026-10-01' }, { priority: 'routine', ordered_at: '2026-06-01' }])
  assert.deepEqual(t.map((x) => x.ordered_at), ['2026-10-01', '2026-06-01', '2026-08-01'])
  assert.equal(waiting('2026-07-01T00:00:00Z', Date.parse('2026-10-08T00:00:00Z')), '14 wk'); assert.equal(waiting('2026-10-07T00:00:00Z', Date.parse('2026-10-08T00:00:00Z')), '1 day')
})
test('the sessions with room for the usual time, from tomorrow; what is booked there counted', () => {
  const sessions = [{ room: 'Theatre 1', weekday: 'sat' as const, from: '08:30', to: '14:30' }, { room: 'Theatre 1', weekday: 'mon' as const, from: '08:30', to: '14:30' }]
  const thu = new Date('2026-10-08T09:00:00')
  const free = freeSessions(sessions, 75, new Map([['Theatre 1|2026-10-10', 290]]), null, thu)
  assert.deepEqual(free.map((f) => [f.day, f.from, f.free]), [['2026-10-10', '13:20', 70 + 0 >= 75 ? 70 : 70]].slice(0, 0).concat([['2026-10-12', '08:30', 360], ['2026-10-17', '08:30', 360], ['2026-10-19', '08:30', 360]]),
    'Saturday has 70 minutes left: too little for 75')
  assert.equal(freeSessions(sessions, 60, new Map([['Theatre 1|2026-10-10', 290]]), null, thu)[0].from, '13:20')
})
test('the settings as the screens read them; a count that does not add up', () => {
  const org = { settings: [{ key: 'theatre.operations', thing_id: 'th', data: { operations: [{ code: 'lapchole', usual_min: 75 }] } }, { key: 'theatre.rooms', thing_id: 'th', data: { rooms: [{ name: 'Theatre 1' }], sessions: [] } }] }
  assert.equal(operationsOf(org, 'th')[0].usual_min, 75); assert.equal(roomsOf(org, 'th').rooms[0].name, 'Theatre 1'); assert.deepEqual(operationsOf(org, 'x'), [])
  assert.ok(countOff({ what: 'Swabs', before: 5, added: 0, after: 4 })); assert.ok(!countOff({ what: 'Swabs', before: 5, added: 2, after: 7 })); assert.ok(!countOff({ what: 'Needles', before: 2 }))
})
console.log(`theatre: ${n} groups passed`)
