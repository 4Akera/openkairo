// Anaesthesia (spec/openCare.md §5.7), as pure decisions: a patient's medicines against the clinic's list of what to stop (shown, never
// a stop), the Arabic sheet, the record's 5-minute columns and a setting carried on, the dose per kg, recovery's line (minutes in,
// Aldrete first → last, pain, ready for the ward at 9 or more), /preop's draft about the operation.   npm run test:anaesthesia
import assert from 'node:assert/strict'
import { arabicSheet, carried, columns, perKg, recoveryWords, stopLines, type StopRule } from '../src/packs/anaesthesia/model'
import { keepForTest, recoveryLine } from '../src/packs/anaesthesia/recovery'
import { sawOps } from '../src/packs/anaesthesia/seen'
import { parsePreop } from '../src/packs/anaesthesia/preopLine'
import type { Ctx } from '../src/core/screens/visit/parse'
import type { PresenceRow } from '../src/core/db/types'

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
test('recovery\'s line: minutes in, Aldrete first → last, pain, ready for the ward at 9 or more', () => {
  const since = '2026-10-08T09:55:00Z'; const now = Date.parse('2026-10-08T10:25:00Z')
  const rows = [{ patient_id: 'g', kind: 'aldrete' as const, value: 8, at: '2026-10-08T09:56:00Z' }, { patient_id: 'g', kind: 'aldrete' as const, value: 10, at: '2026-10-08T10:24:00Z' },
    { patient_id: 'g', kind: 'pain' as const, value: 2, at: '2026-10-08T10:20:00Z' }, { patient_id: 'g', kind: 'aldrete' as const, value: 4, at: '2026-10-07T10:00:00Z' }]
  assert.deepEqual(recoveryWords(rows, 'g', since, now), ['in 30 min', { text: 'Aldrete 8 → 10', tone: 'ok' }, 'pain 2', { text: 'ready for the ward', tone: 'ok' }])
  assert.deepEqual(recoveryWords([{ patient_id: 'm', kind: 'aldrete', value: 6, at: '2026-10-08T10:21:00Z' }], 'm', '2026-10-08T10:20:00Z', now), ['in 5 min', { text: 'Aldrete 6', tone: 'warn' }])
  keepForTest('rec', rows)
  assert.deepEqual(recoveryLine({ patient_id: 'g', checked_in_at: since } as PresenceRow, { dept: { id: 'rec', packs: ['anaesthesia'] } }, now)?.words[1], { text: 'Aldrete 8 → 10', tone: 'ok' })
})
test('/preop: the pack\'s pre-op about the patient\'s operation, as the chart last read it', () => {
  sawOps('hamed', [{ item: 'op1', name: 'Inguinal hernia repair, open mesh', status: 'active', ordered_at: '2026-07-20' }])
  const r = parsePreop('', { services: [], departments: [], problems: [], departmentId: 'pre', templates: [], record: { patient: { id: 'hamed' } } } as unknown as Ctx)
  assert.ok(r && 'ok' in r); assert.equal(r.ok[0].function, 'anaesthesia.preop'); assert.equal(r.ok[0].params.op, 'op1'); assert.equal(r.ok[0].action, 'write:anaesthesia.preop')
})
console.log(`anaesthesia: ${n} groups passed`)
