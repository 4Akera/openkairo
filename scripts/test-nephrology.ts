// Nephrology (spec/openCare.md §5.7), as pure decisions: the KDIGO 2012 square from the latest eGFR and urine ACR and the one a year
// before; eGFR worked out from creatinine by CKD-EPI 2021 where the laboratory gave none; the fall a year; the CKD panel with what stands
// beside each test; the renal list's line under /rx (the lowest threshold the eGFR is under speaks).   npm run test:nephrology
import assert from 'node:assert/strict'
import { aOf, ckdEpi2021, egfrSeries, fallOf, gOf, panelOf, riskOf, squaresOf, squareWord } from '../src/packs/nephrology/kidney'
import { renalSays, renalWords, type RenalRule } from '../src/packs/nephrology/renal'
import { renalLine } from '../src/packs/nephrology/rxline'
import type { Medication, ValueRow } from '../src/core/db/types'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const v = (code: string, value: number, at: string, entry = `${code}${at}`, interpretation: string | null = null): ValueRow => ({ id: entry + code, item: entry, key: code.split(':')[1] ?? code,
  patient_id: 'p', code, name: code, value, ucum: null, unit: null, interpretation, at, entry_id: entry, visit_id: null, source_entries: [] })
const E = 'loinc:98979-8', ACR = 'loinc:14959-1', CR = 'loinc:2160-0'
const saeed = [v(E, 48, '2024-10-08'), v(E, 44, '2025-04-11'), v(E, 41, '2025-10-05'), v(ACR, 260, '2025-10-05'), v(E, 36, '2026-02-10'), v(E, 31, '2026-06-10'),
  v(E, 28, '2026-10-03'), v(ACR, 420, '2026-10-03')]

test('the square: G by eGFR, A by ACR in mg/g, its risk (KDIGO 2012)', () => {
  assert.deepEqual([95, 60, 59, 45, 44, 30, 29, 15, 14].map(gOf), [0, 1, 2, 2, 3, 3, 4, 4, 5])
  assert.deepEqual([29, 30, 300, 301].map(aOf), [0, 1, 1, 2])
  assert.equal(riskOf({ g: 4, a: 2 }), 3); assert.equal(riskOf({ g: 3, a: 1 }), 3); assert.equal(riskOf({ g: 2, a: 0 }), 1); assert.equal(riskOf({ g: 0, a: 0 }), 0)
  assert.equal(riskOf({ g: 2, a: null }), null, 'no ACR: no square')
})
test('now and a year before: the latest eGFR with its ACR; the one nearest a year earlier; the fall a year', () => {
  const s = egfrSeries(saeed, '1959-08-29', false); const { now, before } = squaresOf(s, saeed)
  assert.equal(squareWord(now!), 'G4 A3'); assert.equal(squareWord(before!), 'G3b A2'); assert.equal(before!.egfr.value, 41)
  assert.equal(fallOf(now, before), 13)
})
test('eGFR worked out from creatinine by CKD-EPI 2021 where the laboratory gave none (an adult\'s, mg/dL)', () => {
  assert.equal(ckdEpi2021(2.45, 67, false), 28); assert.equal(ckdEpi2021(0.8, 40, true), 95)
  const s = egfrSeries([v(CR, 2.45, '2026-10-03', 'x'), v(CR, 1.0, '2026-01-01', 'y'), v(E, 30, '2026-01-01', 'y')], '1959-08-29', false)
  assert.deepEqual(s.map((x) => x.value), [30, 28], 'the laboratory\'s where given; worked out only where not')
  assert.deepEqual(egfrSeries([v(CR, 0.5, '2026-10-03')], '2015-01-01', false), [], 'a child: none worked out')
})
const med = (atc: string, name: string, dose = 1): Medication => ({ id: atc, drug_code: `atc:${atc}`, drug_name: name, dose_number: dose, dose_unit: 'mg', route: 'oral', frequency: 'OD', prn: false, problem_id: null, status: 'active', started_on: '' })
test('the CKD panel: each test with what stands beside it on the list', () => {
  const vals = [v('loinc:718-7', 9.6, '2026-10-03', 'p', 'L'), v('loinc:2276-4', 85, '2026-10-03', 'p'), v('loinc:2502-3', 16, '2026-10-03', 'p', 'L'), v('loinc:17861-6', 8.9, '2026-10-03', 'p'),
    v('loinc:1751-7', 3.8, '2026-10-03', 'p'), v('loinc:2777-1', 5.1, '2026-10-03', 'p', 'H'), v('loinc:2823-3', 5.3, '2026-10-03', 'p', 'H')]
  const rows = panelOf(vals, [med('C09CA01', 'Losartan', 100)])
  assert.equal(rows[0].beside, 'ferritin 85 · TSAT 16 % · iron not on · ESA not on'); assert.equal(rows[1].beside, 'corrected for albumin 3.8: 9.1')
  assert.equal(rows[2].beside, 'no binder'); assert.equal(rows[3].value, null); assert.equal(rows[5].beside, 'on Losartan 100 mg')
  assert.equal(panelOf(vals, [med('B05CB04', 'Sodamint')])[4].beside, 'on Sodamint 1 mg')
})
const RULES: RenalRule[] = [{ medicine: 'metformin', atc: 'A10BA02', under: 45, says: 'halve the dose' }, { medicine: 'metformin', atc: 'A10BA02', under: 30, says: 'stop' },
  { medicine: 'NSAID', atc: 'M01A', under: 30, says: 'avoid' }]
test('the renal list: the lowest threshold the eGFR is under speaks; by ATC or by name; nothing above it', () => {
  assert.equal(renalSays({ name: 'Metformin', atc: 'A10BA02' }, 28, RULES)?.says, 'stop')
  assert.equal(renalSays({ name: 'Cidophage (metformin) 500' }, 40, RULES)?.says, 'halve the dose', 'by the ingredient\'s name')
  assert.equal(renalSays({ name: 'Metformin', atc: 'A10BA02' }, 50, RULES), null); assert.equal(renalSays({ name: 'Metformin' }, null, RULES), null)
  assert.equal(renalSays({ name: 'Brufen', atc: 'M01AE01' }, 25, RULES)?.medicine, 'NSAID', 'an ATC class')
  assert.equal(renalWords(RULES[1], { value: 28 }, '3 Oct'), 'eGFR 28 (3 Oct): metformin — the clinic\'s renal list says stop under 30')
})
test('the line under /rx: the clinic\'s list at the latest eGFR, in warn; nothing when the list says nothing', () => {
  const org = { settings: [], settingKeys: [{ key: 'nephrology.renal_list', shape: { type: 'object', properties: { rules: { type: 'array', default: RULES } } } }], datatypes: {}, organization: { id: 'o' } }
  const ctx = { record: { values: [v(E, 28, '2026-10-03T09:00:00Z')] }, org } as unknown as Parameters<typeof renalLine>[1]
  const l = renalLine({ drug: { name: 'Metformin', code: 'atc:A10BA02' } }, ctx)
  assert.equal(l?.rows[0][0].tone, 'warn'); assert.match(l!.rows[0][0].text, /^eGFR 28 \(3 Oct\): metformin — the clinic's renal list says stop under 30$/)
  assert.equal(renalLine({ drug: { name: 'Amlodipine', code: 'atc:C08CA01' } }, ctx), null); assert.equal(renalLine({ drug: { name: '' } }, ctx), null)
})
console.log(`✓ nephrology: ${n} groups of checks`)
