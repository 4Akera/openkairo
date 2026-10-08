// The family pack's pure half (spec/openCare.md §5.7, Q49; pictures #family-folder, #family-checks): the checks due by age and sex (and a
// BMI from an age), each met by an entry with one of its codes within its interval (or once); the member's relation as the viewer reads
// it; the desk's step asked only while the setting says so, and what it still needs. No browser, no database. npm run test:family_medicine
import assert from 'node:assert/strict'
import { askAtNewPatient, checksFor, checksOf, dueWords, metOf, relationTo, stepMissing, type FamilyCheck } from '../src/packs/family_medicine/checks'
import type { Organization } from '../src/core/db/types'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const now = new Date('2026-10-08T10:00:00Z')
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
const CHECKS: FamilyCheck[] = [
  { name: 'Blood pressure', who: 'everyone 18 and over', sex: 'any', from: 18, every_years: 1, codes: ['loinc:8480-6'] },
  { name: 'Sugar', who: '35 and over; younger with BMI 25+', sex: 'any', from: 35, bmi_from: 25, bmi_age_from: 18, every_years: 3, codes: ['loinc:4548-4', 'loinc:1558-6'] },
  { name: 'Lipids', sex: 'male', from: 40, every_years: 5, codes: ['loinc:2089-1'] },
  { name: 'Cervical screening', who: 'women 25–65', sex: 'female', from: 25, to: 65, every_years: 3, codes: ['family_medicine.check:cervical'] },
  { name: 'Hepatitis C', sex: 'any', from: 18, once: true, codes: ['loinc:16128-1'] }]
const org = (ask?: boolean) => ({ settings: [{ key: 'family_medicine.checks', thing_id: null, data: { checks: CHECKS } }, ...(ask === undefined ? [] : [{ key: 'family_medicine.files', thing_id: null, data: { ask_at_new_patient: ask } }])],
  settingKeys: [], datatypes: {} }) as unknown as Organization

test('Basma, 34, BMI 31: blood pressure met today, sugar due (BMI 25+, last 2022), cervical never done, hepatitis C once and done', () => {
  const met = metOf([{ code: 'loinc:8480-6', value: 124, at: ago(0) }, { code: 'loinc:39156-5', value: 31.3, at: ago(0) }, { code: 'loinc:1558-6', value: 96, at: ago(1400) }, { code: 'loinc:16128-1', value: 0.1, at: ago(2500) }])
  const st = checksFor(checksOf(org()), { sex: 'female', born: '1992-06-01' }, met, now)
  assert.deepEqual(st.map((s) => [s.check.name, s.state]), [['Blood pressure', 'met'], ['Sugar', 'due'], ['Cervical screening', 'due'], ['Hepatitis C', 'met']])
  assert.equal(st[1].why, 'BMI 25 or more', 'younger than 35: due for her BMI'); assert.equal(dueWords(st), '2 checks due')
})
test('by age and sex: a man of 45 gets lipids, not cervical screening; a child none; a sex not known only the checks for everyone', () => {
  const man = checksFor(CHECKS, { sex: 'male', born: '1981-01-01' }, [], now).map((s) => s.check.name)
  assert.ok(man.includes('Lipids') && !man.includes('Cervical screening') && man.includes('Sugar'))
  assert.deepEqual(checksFor(CHECKS, { sex: 'male', born: '2020-01-01' }, [], now), [])
  assert.deepEqual(checksFor(CHECKS, { sex: 'unknown', born: '1980-01-01' }, [], now).map((s) => s.check.name), ['Blood pressure', 'Sugar', 'Hepatitis C'])
  assert.deepEqual(checksFor(CHECKS, { sex: 'female', born: null }, [], now), [], 'no birth date: nothing worked out')
  const coded = checksFor(CHECKS, { sex: 'female', born: '1980-01-01' }, metOf([], [{ codes: ['family_medicine.check:cervical'], occurred_at: ago(100) }]), now)
  assert.equal(coded.find((s) => s.check.name === 'Cervical screening')?.state, 'met', 'met by a coded observation')
  assert.equal(dueWords([]), null)
})
test('a member as the viewer reads them: a wife’s head is her husband, his mother', () => {
  assert.equal(relationTo('wife', 'head'), 'husband'); assert.equal(relationTo('wife', 'mother'), 'his mother'); assert.equal(relationTo('husband', 'father'), 'her father')
  assert.equal(relationTo('head', 'son'), 'son'); assert.equal(relationTo('son', 'head'), 'head of the family'); assert.equal(relationTo('son', null), '')
})
test('the desk’s step: asked while the setting says so (on by default); what it still needs', () => {
  assert.equal(askAtNewPatient(org()), true); assert.equal(askAtNewPatient(org(false)), false)
  assert.match(stepMissing(null) ?? '', /Join a family file or start one/)
  assert.equal(stepMissing({ mode: 'join', household: 'h', number: 12, relation: '', dept: 'd' }), 'How are they related?')
  assert.equal(stepMissing({ mode: 'none' }), null); assert.equal(stepMissing({ mode: 'start', address: '', dept: 'd' }), null)
})

console.log(`✓ family: ${n} groups passed`)
