// The composer's pure half: the speed line, /shortcuts, suggestions and the catalog warnings.
// npm run test:composer   (no browser, no database)
import assert from 'node:assert/strict'
import { lineOf, parse, type Ctx, type Parsed } from '../src/core/screens/visit/parse'
import { expand, suggest } from '../src/core/screens/visit/expand'
import { drugWarnings, allergyWarnings, doseWarnings, duplicateProblem, findDrug } from '../src/core/screens/visit/catalog'
import type { Allergy, Medication, Organization, Problem, Template } from '../src/core/db/types'
import { draftEntries } from '../src/core/db/entries'

const ctx: Ctx = {
  departmentId: 'im', now: new Date('2026-09-24T10:00:00Z'),
  services: [{ id: 's1', code: 'cbc', name: 'Complete blood count', department_id: 'lab' }, { id: 's2', code: 'hba1c', name: 'HbA1c', department_id: 'lab' }, { id: 's3', code: 'visit', name: 'Clinic visit', department_id: 'im' }],
  templates: [], departments: [{ id: 'im', name: 'Internal Medicine' }, { id: 'lab', name: 'Laboratory' }, { id: 'card', name: 'Cardiology' }],
  problems: [{ id: 'p1', name: 'Type 2 diabetes mellitus' }],
}
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const ok = (line: string): Parsed[] => { const r = parse(line, ctx); assert.ok(r && 'ok' in r, `${line} → ${JSON.stringify(r)}`); return r.ok }
const err = (line: string): string => { const r = parse(line, ctx); assert.ok(r && 'error' in r, `${line} should be refused, got ${JSON.stringify(r)}`); return r.error }
const p = (line: string) => ok(line)[0].params as Record<string, unknown>

test('vitals by name and by position', () => {
  assert.deepEqual(p('/v 148/92 p 84 t 37.2 w 86'), { systolic: 148, diastolic: 92, pulse: 84, temperature: 37.2, weight: 86 })
  assert.deepEqual(p('/v 148/92 84 37 86 97'), { systolic: 148, diastolic: 92, pulse: 84, temperature: 37, weight: 86, spo2: 97 })
  assert.deepEqual(p('/v 140/90 p80'), { systolic: 140, diastolic: 90, pulse: 80 })
  assert.match(err('/v 148/92 84 45.5'), /not plausible/)
  assert.match(err('/v 148/92 84 37 86 97 12'), /Too many/)
})
test('prescription: catalog name, code, unit and route; PRN needs its reason', () => {
  const q = p('/rx glucophage 850 bd 30d for dm')
  assert.deepEqual(q.drug, { name: 'Metformin', code: `atc:${findDrug('metformin')!.atc}` })
  assert.equal(q.dose_unit, 'mg'); assert.equal(q.frequency, 'BD'); assert.equal(q.duration_days, 30)
  assert.deepEqual(q.problems, [{ id: 'p1', name: 'Type 2 diabetes mellitus' }])
  assert.equal(p('/rx metformin 5 ml bd').dose_unit, 'ml')                       // a typed unit is kept
  assert.match(err('/rx paracetamol 1g qds prn'), /PRN is for/)
  assert.equal(p('/rx paracetamol 1g qds prn pain ; after food').prn_reason_text, 'pain')
  assert.equal(p('/rx paracetamol 1 g prn for fever').prn_reason_text, 'fever')
  const both = p('/rx paracetamol 1g prn pain for dm'); assert.equal(both.prn_reason_text, 'pain'); assert.equal((both.problems as { id: string }[])[0].id, 'p1')
  assert.match(err('/rx for dm'), /drug name/)
})
test('problem and allergy: catalog names and codes', () => {
  const dx = p('/dx dm since 5y ; poorly controlled')
  assert.equal(dx.name, 'Type 2 diabetes mellitus'); assert.match(String(dx.code), /^icd10:E11/); assert.equal(dx.onset_on, '2021'); assert.equal(dx.text, 'poorly controlled')
  assert.equal(p('/dx ? pneumonia').certainty, 'suspected')
  const al = p('/al penicillin: rash severe')
  assert.deepEqual(al.substance, { name: 'Penicillins', class_code: 'penicillin' }); assert.equal(al.reactions_text, 'rash'); assert.equal(al.severity, 'severe')
})
test('the grammar: / is a command, anything else a note', () => {
  assert.equal(ok('rx metformin 500 bd')[0].function, 'note')                // no slash: never an order
  assert.equal(suggest('rx metformin 500 bd', ctx, [], new Set())!.items[0].insert, '/rx metformin 500 bd')   // … but the card offers the command
  assert.match(err('/zz x'), /No command/)
  assert.match(expand('/rx', ctx, [])!.label ?? '', /Prescription/)              // a command alone: an empty card
  assert.ok(expand('/note', ctx, [])!.drawer)                                    // … or the note beside the record
  assert.equal(ok('hx: 3 months of thirst')[0].tag, 'note:history_physical')        // a label picks the heading
  assert.match(parse('/rx metformin 500 bd', { ...ctx, can: (a) => a !== 'write:medication' })!.error ?? '', /not open to your role/)
})
test('requests, consults, notes', () => {
  assert.deepEqual(ok('/order urgent cbc, hba1c').map((x) => x.params), [{ service_id: 's1', priority: 'urgent' }, { service_id: 's2', priority: 'urgent' }])
  assert.match(err('/order visit'), /No service/)                                   // this department's own services are not requested from here
  assert.equal(p('/order cardiology: chest pain on effort').to_department_id, 'card')
  const note = ok('plan: review in 3 months')[0]; assert.equal(note.tag, 'note:plan'); assert.equal(note.append, true)
})
test('lineOf follows the fields the card edits', () => {
  const [rx] = ok('/rx metformin 500 bd')
  assert.equal(lineOf({ ...rx, params: { ...rx.params, dose_number: 1000, duration_days: 30 } }), 'Metformin 1000 mg BD × 30d')
  assert.equal(lineOf({ function: 'medication', kind: 'prescription', line: '', params: { action: 'stop', drug: { name: 'Metformin' }, stop_reason_text: 'Side effect' } }), 'Stop Metformin — Side effect')
  assert.equal(lineOf(ok('/v 148/92 84')[0]), 'BP 148/92 · P 84')
})
const preset: Template = { id: 't1', department_id: 'im', name: 'DM follow-up', shortcut: 'dm', items: [{ service_id: 's2' }, { service_id: 's3' }], lines: ['/rx metformin 500 bd 30d for dm', 'rx nothing prn'] }
test('/shortcuts: a preset runs its services and lines; built-ins; unknown ones are refused', () => {
  const e = expand('#dm', ctx, [preset])!
  assert.deepEqual(e.items.map((x) => x.kind), ['request', 'prescription'])      // its own department's service is left out
  assert.equal(e.errors.length, 0); assert.match(e.skipped![0], /rx nothing prn/)       // a bad line is left out; the rest still goes in
  assert.ok(expand('/note', ctx, [])!.drawer)
  assert.ok(expand('#soap', ctx, [{ ...preset, id: 't2', shortcut: 'soap', items: [], lines: ['S:', 'O:', 'A:', 'P:'] }])!.drawer)   // headings only: a note to fill
  assert.equal(expand('/al none', ctx, [])!.items[0].function, 'list_review')
  assert.match(expand('/zz', ctx, [preset])!.errors[0], /No command/)
  assert.match(expand('/dm', ctx, [preset])!.errors[0], /#dm/)                    // a preset typed with / says where it lives
  const noDm = expand('#dm', { ...ctx, problems: [] }, [preset])!                // no DM on this patient's list: the line stays, unlinked
  assert.deepEqual((noDm.items[1].params as { problems: unknown[] }).problems, []); assert.equal(noDm.items[1].line, 'Metformin 500 mg BD × 30d')
  const asthma: Template = { ...preset, shortcut: 'asthma', items: [], lines: ['/dx asthma', 'rx salbutamol 100mcg inh prn for wheeze for asthma'] }
  const ea = expand('#asthma', { ...ctx, problems: [] }, [asthma])!                  // links to the problem the same preset adds; the PRN reason stays
  assert.equal(ea.skipped!.length, 0); const rx = ea.items[1].params as { problems: { id: string }[]; prn_reason_text: string }
  assert.equal(rx.problems[0].id, ea.items[0].id); assert.equal(rx.prn_reason_text, 'wheeze')
})
test('suggestions: shortcuts, drugs, problems, allergens, services', () => {
  assert.ok(suggest('#d', ctx, [preset], new Set())!.items.map((x) => x.label).includes('#dm'))
  assert.ok(!suggest('/d', ctx, [preset], new Set())!.items.some((x) => x.label === '/dm'))   // presets are on #, never /
  assert.equal(suggest('/rx metf', ctx, [], new Set())!.items[0].insert, '/rx Metformin ')
  assert.equal(suggest('/rx metformin 500', ctx, [], new Set()), null)             // no suggestions once the dose is typed
  assert.equal(suggest('/dx diab', ctx, [], new Set())!.items[0].label, 'Type 2 diabetes mellitus')
  assert.equal(suggest('/al penic', ctx, [], new Set())!.items[0].insert, '/al Penicillins: ')
  assert.equal(suggest('/order hb', ctx, [], new Set())!.items[0].insert, '/order hba1c, ')
})
const allergy = (substance_name: string, class_code: string | null = null): Allergy => ({ id: 'a1', substance_name, class_code, kind: 'allergy', reactions_text: 'rash', severity: 'severe', status: 'active' })
const med = (drug_name: string, started_on = '2026-01-01'): Medication => ({ id: 'm1', drug_code: null, drug_name, dose_number: 500, dose_unit: 'mg', route: 'oral', frequency: 'BD', prn: false, problem_id: null, status: 'active', started_on })
test('warnings: allergy to the drug or its class blocks; a duplicate is a caution', () => {
  assert.equal(drugWarnings('Metformin', [allergy('Glucophage')], [])[0].level, 'block')
  assert.deepEqual(drugWarnings('Metformin', [], [med('Metformin')]).map((w) => w.level), ['caution'])
  assert.match(drugWarnings('Metformin', [], [med('Metformin', '')])[0].text, /already written in this visit/)
  assert.deepEqual(drugWarnings('Metformin', [], [med('Metformin')], 'm1'), [])   // editing that one
  assert.equal(allergyWarnings('Metformin', [med('Metformin')]).length, 1)
  const t2dm: Problem = { id: 'p1', code: 'icd10:E11.9', name: 'Type 2 diabetes mellitus', status: 'active', onset_on: null, note_text: null, certainty: 'confirmed' }
  assert.equal(duplicateProblem('T2DM', [t2dm])?.id, 'p1')
})
test('the catalog: classes and cross-reactions', () => {
  const lv = (drug: string, allergyName: string) => drugWarnings(drug, [allergy(allergyName)], []).map((w) => w.level)
  assert.deepEqual(lv('Amoxicillin', 'Penicillins'), ['block'])                 // same class
  assert.deepEqual(lv('Amoxicillin + clavulanic acid', 'Penicillins'), ['block'])
  assert.deepEqual(lv('Ceftriaxone', 'Penicillins'), ['caution'])               // low cross-reactivity
  assert.deepEqual(lv('Ibuprofen', 'Aspirin'), ['block'])                        // COX-1: warn → block
  assert.deepEqual(lv('Celecoxib', 'NSAIDs'), ['caution'])                       // COX-2 selective: usually tolerated
  assert.deepEqual(lv('Paracetamol', 'NSAIDs'), [])
  assert.equal(p('/rx co-amoxiclav 625 tds 7d').drug && (p('/rx co-amoxiclav 625 tds 7d').drug as { name: string }).name, 'Amoxicillin + clavulanic acid')
  assert.equal(findDrug('ppi'), undefined)                                        // names six drugs: suggests, never guesses
  assert.ok(suggest('/rx ppi', ctx, [], new Set())!.items.length >= 5)
  assert.equal(p('/rx fluticasone (nasal) 50 mcg bd').route, 'nasal')
})
test('review fixes: allergy lines, durations, units, doses, free text, reverse checks', () => {
  const sub = (l: string) => p(l).substance as { name: string; class_code?: string }
  assert.deepEqual(sub('/al co-amoxiclav: rash'), { name: 'Co-amoxiclav', class_code: 'penicillin' })          // a hyphen inside a name stays
  assert.equal(sub('/al Co-trimoxazole: rash').class_code, 'sulfonamide_antibiotic')
  const ana = p('/al penicillin anaphylaxis'); assert.equal((ana.substance as { name: string }).name, 'Penicillins'); assert.equal(ana.reactions_text, 'anaphylaxis'); assert.equal(ana.severity, 'severe')
  assert.equal(p('/al penicillin rash').reactions_text, 'rash')                                                // no colon: the known name, then the reaction
  for (const l of ['/rx amoxicillin 500 tds for 7 days', '/rx amoxicillin 500 tds for 7d', '/rx amoxicillin 500 tds 7 days']) { const q = p(l); assert.equal(q.duration_days, 7, l); assert.equal(q.instructions_text, null, l) }
  const mor = p('/rx morphine 10mg prn pain for 5 days'); assert.equal(mor.prn_reason_text, 'pain'); assert.equal(mor.duration_days, 5)
  const ins = p('/rx insulin 10 od'); assert.equal(ins.dose_unit, null); assert.equal(ins.route, null)          // not in the list: no guessed mg, no guessed oral
  assert.equal(doseWarnings('Digoxin', 125, 'mg')[0].level, 'block'); assert.match(doseWarnings('Digoxin', 125, 'mg')[0].text, /125 mcg/)
  assert.deepEqual(doseWarnings('Digoxin', 125, 'mcg'), []); assert.deepEqual(doseWarnings('Metformin', 500, 'mg'), [])
  assert.match(doseWarnings('Levothyroxine', 100, 'mg')[0]?.text ?? '', /100 mcg/)
  assert.deepEqual(drugWarnings('Amoxicillin susp', [allergy('Penicillins')], []).map((w) => w.level), ['block'])   // a known word inside a free name
  assert.match(drugWarnings('Amox', [allergy('Penicillins')], [])[0].text, /not in the drug list/)                  // unknown: says it was not checked
  assert.deepEqual(drugWarnings('Sacubitril + valsartan', [allergy('ACE inhibitors')], []).map((w) => w.level), ['block'])
  assert.deepEqual(drugWarnings('Losartan', [allergy('ACE inhibitors')], []).map((w) => w.level), ['caution'])
  assert.equal(allergyWarnings('Aspirin', [med('Ibuprofen')])[0].level, 'block')                               // recording an allergy checks what is taken, cross rules too
  assert.equal(allergyWarnings('Penicillins', [med('Cefalexin', '')])[0].level, 'caution')
})
test('drafts become entries: codings and quantities (spec §4.7)', () => {
  const org = { services: [{ id: 's1', code: 'cbc', name: 'Complete blood count', department_id: 'lab', reply_type: 'result', coding: { system: 'loinc', code: '58410-2' }, fields: [], section_name: null },
    { id: 'rx', code: 'dispense', name: 'Dispense', department_id: 'ph', reply_type: 'pharmacy.dispense', coding: null, fields: [], section_name: null }] } as unknown as Organization
  const at = { patientId: 'pt', departmentId: 'im', visitId: 'v1', org }
  const one = (line: string, extra: Record<string, unknown> = {}) => { const d = ok(line)[0]; return draftEntries({ id: 'e1', function: d.function, params: { ...d.params, ...extra } }, at) }
  const [med] = one('/rx metformin 500 bd 30d for dm'); const md = med.data as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(med.type, 'medication'); assert.equal(med.visit_id, 'v1')
  assert.deepEqual(md.drug.codings[0], { system: 'atc', code: findDrug('metformin')!.atc, display: 'Metformin' })
  assert.deepEqual(md.dosage.dose, { value: '500', unit: 'mg', ucum: 'mg' }); assert.equal(md.dosage.timing.frequency, 2)
  assert.deepEqual(md.reasons, [{ to: 'item', id: 'p1' }])
  const sent = one('/rx metformin 500 bd 30d', { send: true })                                  // sent to the pharmacy: an order about the medication
  assert.deepEqual(sent.map((e) => e.type), ['medication', 'order']); assert.equal(sent[1].refers_to, sent[0].id); assert.equal(sent[1].relation, 'about')
  const v = one('/v 148/92 p 84 t 37.2')[0].data as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.deepEqual(v.bp.sys, { value: '148', unit: 'mmHg', ucum: 'mm[Hg]' }); assert.equal(v.temp.ucum, 'Cel')
  const dx = one('/dx hypertension')[0].data as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(dx.concept.codings[0].system, 'icd10'); assert.equal(dx.clinical_status, 'active')
  const o = one('/order cbc')[0]; assert.equal(o.type, 'order'); assert.equal((o.data as { department_id: string }).department_id, 'lab')
})
console.log(`composer: ${n} groups passed`)
