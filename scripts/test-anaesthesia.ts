// Anaesthesia (spec/openCare.md §5.8), as pure decisions: a patient's medicines against the clinic's list of what to stop (shown, never
// a stop), the Arabic sheet, the record's 5-minute columns and a setting carried on, the dose per kg, recovery's line (minutes in,
// Aldrete first → last, pain, ready for the ward at 9 or more), /preop's draft about the operation.   npm run test:anaesthesia
import assert from 'node:assert/strict'
import { arabicSheet, carried, columns, oxygenOf, perKg, recoveryWords, stopLines, type StopRule } from '../src/packs/anaesthesia/model'
import { recoveryLine } from '../src/packs/anaesthesia/recovery'
import { aldreteNotice, backEntries, backLine, freeBeds, parseBack, wardsFor } from '../src/packs/anaesthesia/back'
import { draftEntries } from '../src/core/db/entries'
import { sawOps } from '../src/packs/anaesthesia/seen'
import { parsePreop } from '../src/packs/anaesthesia/preopLine'
import type { Ctx } from '../src/core/screens/visit/parse'
import type { Department, Place, PresenceRow } from '../src/core/db/types'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const RULES: StopRule[] = [{ match: 'aspirin, B01AC06', what: 'continue, also on the day' }, { match: 'metformin, A10BA02', what: 'no dose on the morning of the operation', days: 0 },
  { match: 'empagliflozin, A10BK', what: 'stop 3 days before', days: 3, warn: true }, { match: 'valsartan, C09', what: 'no dose on the morning', days: 0 }]
const med = (drug_name: string, drug_code: string | null, dose_number: number | null = null, frequency: string | null = 'OD') => ({ drug_name, drug_code, dose_number, dose_unit: 'mg', frequency, status: 'active' })

test('the patient\'s medicines against the clinic\'s list: by name or ATC; one not on the list asks the anaesthetist', () => {
  const l = stopLines([med('Aspirin', 'atc:B01AC06', 75), med('Metformin', 'atc:A10BA02', 1000, 'BD'), med('Jardiance', 'atc:A10BK03', 10), med('Losartan', 'atc:C09CA01', 50), med('Omeprazole', null, 20)], RULES)
  assert.deepEqual(l.map((x) => x.what), ['continue, also on the day', 'no dose on the morning of the operation', 'stop 3 days before', 'no dose on the morning', 'ask the anaesthetist'])
  assert.equal(l[1].medicine, 'Metformin 1000 mg twice'); assert.ok(l[2].warn)
  assert.match(arabicSheet(l), /صباح يوم العملية/); assert.match(arabicSheet(l), /بست ساعات/)
})
test('the record\'s columns every 5 minutes from the start; a blank keeps the last setting; the dose per kg', () => {
  assert.deepEqual(columns('08:38', '08:52'), ['08:35', '08:40', '08:45', '08:50'])
  const cells = [{ agent_pct: '2.0' }, {}, { agent_pct: '2.2' }, {}]
  assert.deepEqual(carried(cells, 'agent_pct', 1), { v: '2.0', typed: false }); assert.deepEqual(carried(cells, 'agent_pct', 2), { v: '2.2', typed: true })
  assert.equal(perKg(150, 78), 1.9); assert.equal(perKg(150, null), null)
})
test('FiO₂ on a column is the base\'s oxygen (oxygen.fio2, in %): a fraction read as its percentage; nothing implausible written', () => {
  assert.deepEqual(oxygenOf('50'), { on: 'oxygen', fio2: { value: '50', unit: '%', ucum: '%' } })
  assert.deepEqual(oxygenOf('0.4')?.fio2.value, '40'); assert.deepEqual(oxygenOf(' 100 ')?.fio2.value, '100')
  for (const x of ['', undefined, 'off', '20', '101', '45.5', '0.1']) assert.equal(oxygenOf(x), null, String(x))
})
test('recovery\'s line: minutes in, Aldrete first → last, pain, ready for the ward at 9 or more', () => {
  const since = '2026-10-08T09:55:00Z'; const now = Date.parse('2026-10-08T10:25:00Z')
  const rows = [{ patient_id: 'g', kind: 'aldrete' as const, value: 8, at: '2026-10-08T09:56:00Z' }, { patient_id: 'g', kind: 'aldrete' as const, value: 10, at: '2026-10-08T10:24:00Z' },
    { patient_id: 'g', kind: 'pain' as const, value: 2, at: '2026-10-08T10:20:00Z' }, { patient_id: 'g', kind: 'aldrete' as const, value: 4, at: '2026-10-07T10:00:00Z' }]
  assert.deepEqual(recoveryWords(rows, 'g', since, now), ['in 30 min', { text: 'Aldrete 8 → 10', tone: 'ok' }, 'pain 2', { text: 'ready for the ward', tone: 'ok' }])
  assert.deepEqual(recoveryWords([{ patient_id: 'm', kind: 'aldrete', value: 6, at: '2026-10-08T10:21:00Z' }], 'm', '2026-10-08T10:20:00Z', now), ['in 5 min', { text: 'Aldrete 6', tone: 'warn' }])
  assert.deepEqual(recoveryLine({ patient_id: 'g', checked_in_at: since } as PresenceRow, { read: rows }, now)?.words[1], { text: 'Aldrete 8 → 10', tone: 'ok' }, 'from its read (C7)')
  assert.deepEqual(recoveryLine({ patient_id: 'g', checked_in_at: since } as PresenceRow, {}, now)?.words, ['in 30 min'], 'while it reads: the minutes only')
})
test('/preop: the pack\'s pre-op about the patient\'s operation, as the chart last read it', () => {
  sawOps('hamed', [{ item: 'op1', name: 'Inguinal hernia repair, open mesh', status: 'active', ordered_at: '2026-07-20' }])
  const r = parsePreop('', { services: [], departments: [], problems: [], departmentId: 'pre', templates: [], record: { patient: { id: 'hamed' } } } as unknown as Ctx)
  assert.ok(r && 'ok' in r); assert.equal(r.ok[0].function, 'anaesthesia.preop'); assert.equal(r.ok[0].params.op, 'op1'); assert.equal(r.ok[0].action, 'write:anaesthesia.preop')
  const [e] = draftEntries({ id: 'pre1', function: r.ok[0].function, params: r.ok[0].params }, { patientId: 'hamed', departmentId: 'pre' })
  assert.equal(e.refers_to, 'op1'); assert.equal(e.relation, 'about', 'about the operation (C6): the operating list reads it'); assert.ok(!('refers' in (e.data as object)))
  sawOps('nobody', [])
  const none = parsePreop('', { services: [], departments: [], problems: [], departmentId: 'pre', templates: [], record: { patient: { id: 'nobody' } } } as unknown as Ctx)
  assert.ok(none && 'ok' in none); assert.equal(draftEntries({ id: 'pre2', function: 'anaesthesia.preop', params: none.ok[0].params }, { patientId: 'nobody', departmentId: 'pre' })[0].refers_to, undefined, 'no operation yet: about nothing')
})
test('/back: Recovery\'s stay passes back to the ward in one Done (beds Q3), or home; the ward\'s free beds; Aldrete under 9 a notice', () => {
  const ctx = { departmentId: 'rec', departments: [{ id: 'rec', name: 'Recovery' }, { id: 'sw', name: 'Surgical Ward' }, { id: 'mw', name: 'Medical Ward' }, { id: 'cw', name: 'Children\'s ward' }] }
  const ok = (rest: string) => { const r = parseBack(rest, ctx); assert.ok(r && 'ok' in r, rest); return r.ok[0].params }
  assert.deepEqual(ok(''), { to: 'ward' }, 'the card presets where the patient came from'); assert.deepEqual(ok('home'), { to: 'home' })
  assert.deepEqual(ok('surgical'), { to: 'ward', department_id: 'sw', department: 'Surgical Ward' })
  const r = parseBack('ward', ctx); assert.ok(r && 'error' in r && /fits/.test(r.error), 'two wards fit: not guessed')
  assert.equal(backLine({ to: 'ward', department_id: 'sw', department: 'Surgical Ward', place_id: 'b6', place: 'Bed 6' }), 'Back to Surgical Ward · Bed 6')
  assert.equal(backLine({ to: 'ward', department_id: 'sw', department: 'Surgical Ward', place_id: null }), 'Back to Surgical Ward · the ward chooses')
  assert.equal(backLine({ to: 'ward' }), 'Back to a ward: choose it'); assert.equal(backLine({ to: 'home' }), 'Home from Recovery')
  const deps = [{ id: 'rec', name: 'Recovery', work: 'stays' }, { id: 'sw', name: 'Surgical Ward', work: 'stays' }, { id: 'q', name: 'Clinic', work: 'visits' }] as Department[]
  assert.deepEqual(wardsFor(deps, 'rec').map((d) => d.id), ['sw'], 'other departments of stays only')
  const place = (id: string, position: number, closed = false) => ({ id, department_id: 'sw', name: `Bed ${position}`, position, closed } as Place)
  assert.deepEqual(freeBeds([place('b2', 2), place('b1', 1), place('b3', 3, true), place('b4', 4)], 'sw', [{ place_id: 'b4', state: 'admitted' }, { place_id: 'b1', state: 'discharged' }]).map((b) => b.id),
    ['b1', 'b2'], 'not closed, not held by an admitted stay, in order')
  const stay = { item: 'st', patient_id: 'p', latest_entry: 'e2', reason: 'lap chole' }
  const [dis, adm] = backEntries({ to: 'ward', department_id: 'sw', department: 'Surgical Ward', place_id: 'b6' }, stay, 'rec')
  assert.deepEqual([dis.type, dis.visit_id, dis.refers_to, dis.relation, dis.department_id, dis.data], ['discharged', 'st', 'e2', 'changes', 'rec', { disposition: 'oth', note: 'to Surgical Ward' }])
  assert.deepEqual([adm.type, adm.visit_id === adm.id, adm.refers_to, adm.relation, adm.department_id, adm.data],
    ['admitted', true, 'st', 'about', 'rec', { department_id: 'sw', place_id: 'b6', admit_source: 'other', reason: 'lap chole' }], 'the ward\'s stay about the Recovery stay')
  assert.equal((backEntries({ to: 'ward', department_id: 'sw', place_id: null }, stay, 'rec')[1].data as { place_id?: string }).place_id, undefined, 'the ward chooses: no bed')
  assert.deepEqual(backEntries({ to: 'home' }, stay, 'rec').map((e) => [e.type, e.data]), [['discharged', { disposition: 'home' }]], 'a day case: home')
  assert.throws(() => backEntries({ to: 'ward' }, stay, 'rec'), /Choose the ward/); assert.throws(() => backEntries({ to: 'ward', department_id: 'rec' }, stay, 'rec'), /another department/)
  assert.equal(aldreteNotice(10), null); assert.match(aldreteNotice(8)!, /under 9/); assert.match(aldreteNotice(null)!, /No Aldrete/)
})
console.log(`anaesthesia: ${n} groups passed`)
