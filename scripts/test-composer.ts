// The composer's pure half: the speed line, /shortcuts, suggestions and the catalog warnings.
// npm run test:composer   (no browser, no database)
import assert from 'node:assert/strict'
import { lineOf, parse, type Ctx, type Parsed } from '../src/core/screens/visit/parse'
import { expand, suggest } from '../src/core/screens/visit/expand'
import { addToCommand, commandNamed, registerCommand } from '../src/core/screens/visit/commands'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { drugWarnings, allergyWarnings, doseWarnings, duplicateProblem, findDrug } from '../src/core/screens/visit/catalog'
import type { Allergy, Medication, Organization, Problem, Template } from '../src/core/db/types'
import { draftEntries } from '../src/core/db/entries'
import { PLAIN_SEND, registerSend } from '../src/core/screens/visit/send'
import { factMissing, isDay } from '../src/core/screens/visit/facts'

const ctx: Ctx = {
  departmentId: 'im', now: new Date('2026-09-24T10:00:00Z'),
  services: [{ id: 's1', code: 'cbc', name: 'Complete blood count', department_id: 'lab' }, { id: 's2', code: 'hba1c', name: 'HbA1c', department_id: 'lab' }, { id: 's3', code: 'visit', name: 'Clinic visit', department_id: 'im' }],
  templates: [], departments: [{ id: 'im', name: 'Internal Medicine' }, { id: 'lab', name: 'Laboratory' }, { id: 'card', name: 'Cardiology' }],
  problems: [{ id: 'p1', name: 'Type 2 diabetes mellitus' }],
}
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const quiet = <T,>(fn: () => T): T => { const e = console.error; console.error = () => {}; try { return fn() } finally { console.error = e } }
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
test('vitals: air or oxygen and ACVPU, the base\'s own (the owner\'s Q5); what /v refuses in words', () => {
  assert.deepEqual(p('/v 120/80 84 37 air a'), { systolic: 120, diastolic: 80, pulse: 84, temperature: 37, oxygen: 'air', consciousness: 'a' })
  assert.deepEqual(p('/v 120/80 84 37 oxygen 2l nasal v'), { systolic: 120, diastolic: 80, pulse: 84, temperature: 37, oxygen: 'oxygen', o2_flow: 2, o2_device: 'nasal_cannula', consciousness: 'v' })
  assert.deepEqual(p('/v 2l'), { oxygen: 'oxygen', o2_flow: 2 }, 'a flow is oxygen'); assert.deepEqual(p('/v venturi fio2 28'), { oxygen: 'oxygen', o2_device: 'venturi_mask', fio2: 28 })
  assert.deepEqual(p('/v 1.5lpm venturi mask'), { oxygen: 'oxygen', o2_flow: 1.5, o2_device: 'venturi_mask' }, 'one device in two words'); assert.equal(p('/v flow 4').o2_flow, 4)
  for (const [w, c] of [['alert', 'a'], ['confused', 'c'], ['voice', 'v'], ['pain', 'p'], ['unresponsive', 'u']]) assert.equal(p(`/v 120/80 ${w}`).consciousness, c, w)
  assert.equal(p('/v 120/80 p 90').pulse, 90, 'a bare p is the pulse'); assert.deepEqual(p('/v a'), { consciousness: 'a' }); assert.deepEqual(p('/v air'), { oxygen: 'air' })
  assert.match(err('/v 120/80 o2 94'), /spo2 .*oxygen/); assert.match(err('/v air 2l'), /Air and oxygen/); assert.equal(err('/v a v'), 'ACVPU said twice')
  assert.equal(err('/v air oxygen'), 'Air or oxygen said twice'); assert.match(err('/v pain 8'), /^pain 8: ACVPU's P is pain on its own/)
  assert.match(err('/v 120/80 84 37 c'), /confused/); assert.match(err('/v t 37 c'), /confused/); assert.match(err('/v fio2 0.4'), /percentage/)
  assert.match(err('/v flow 80'), /not plausible/); assert.match(err('/v fio2 120'), /not plausible/); assert.equal(err('/v flow'), 'Oxygen flow needs a number')
  for (const [l, d] of [['mask venturi', 'venturi_mask'], ['simple mask', 'simple_mask'], ['tracheostomy mask', 'tracheostomy_mask'], ['mask nrb', 'reservoir_mask'], ['high-flow nasal', 'high_flow_nasal'],
    ['nasal cannula', 'nasal_cannula']]) assert.equal(p(`/v ${l}`).o2_device, d, `the line's words: ${l}`)
  assert.equal(err('/v nasal mask'), 'Two oxygen devices: say one'); assert.equal(err('/v simple venturi'), 'Two oxygen devices: say one')
  assert.equal(err('/v 2l 3l'), 'Oxygen flow said twice'); assert.equal(err('/v nasal cpap'), 'Two oxygen devices: say one'); assert.equal(err('/v fio2 x'), 'FiO₂ needs a number')
  for (const w of ['constructor', '__proto__', 'tostring', '40%']) assert.match(err(`/v 120/80 ${w}`), /^Not a vital/, w)
  assert.equal(lineOf(ok('/v 120/80 84 37 air a')[0]), 'BP 120/80 · P 84 · T 37 · Air · ACVPU A'); assert.equal(ok('/v 120/80 84 37 air a')[0].line, 'BP 120/80 · P 84 · T 37 · Air · ACVPU A')
  assert.equal(ok('/v rr 22 oxygen 2l nasal spo2 93 u')[0].line, 'SpO₂ 93 · O₂ 2 L/min nasal cannula · RR 22 · ACVPU U'); assert.equal(ok('/v venturi fio2 28')[0].line, 'O₂ Venturi mask FiO₂ 28%')
  const at = { patientId: 'pt', departmentId: 'im' }
  const data = (line: string) => draftEntries({ id: 'e1', function: 'vitals', params: ok(line)[0].params }, at)[0].data as Record<string, unknown>
  assert.deepEqual(data('/v oxygen 2l nasal v'), { consciousness: 'v', oxygen: { on: 'oxygen', device: 'nasal_cannula', flow: { value: '2', unit: 'L/min', ucum: 'L/min' } } })
  assert.deepEqual(data('/v fio2 28'), { oxygen: { on: 'oxygen', fio2: { value: '28', unit: '%', ucum: '%' } } }); assert.deepEqual(data('/v 120/80 air').oxygen, { on: 'air' }, 'air alone')
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
    { id: 'rx', code: 'give', name: 'Give', department_id: 'ph', reply_type: 'testpack.give', coding: null, fields: [], section_name: null }] } as unknown as Organization
  registerSend('testpack.give', { ...PLAIN_SEND, to: 'the test pack' })   // a pack that answers prescriptions registers where they go (visit/send.ts)
  const at = { patientId: 'pt', departmentId: 'im', visitId: 'v1', org }
  const one = (line: string, extra: Record<string, unknown> = {}) => { const d = ok(line)[0]; return draftEntries({ id: 'e1', function: d.function, params: { ...d.params, ...extra } }, at) }
  const [med] = one('/rx metformin 500 bd 30d for dm'); const md = med.data as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(med.type, 'medication'); assert.equal(med.visit_id, 'v1')
  assert.deepEqual(md.drug.codings[0], { system: 'atc', code: findDrug('metformin')!.atc, display: 'Metformin' })
  assert.deepEqual(md.dosage.dose, { value: '500', unit: 'mg', ucum: 'mg' }); assert.equal(md.dosage.timing.frequency, 2)
  assert.deepEqual(md.reasons, [{ to: 'item', id: 'p1' }])
  const sent = one('/rx metformin 500 bd 30d', { send: true })                                  // sent on: an order about the medication
  assert.deepEqual(sent.map((e) => e.type), ['medication', 'order']); assert.equal(sent[1].refers_to, sent[0].id); assert.equal(sent[1].relation, 'about')
  assert.deepEqual((sent[1].data as { department_id: string; service: { id: string } }), { service: { id: 'rx', code: 'give', name: 'Give' }, department_id: 'ph', priority: 'routine', status: 'active' })
  const v = one('/v 148/92 p 84 t 37.2')[0].data as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.deepEqual(v.bp.sys, { value: '148', unit: 'mmHg', ucum: 'mm[Hg]' }); assert.equal(v.temp.ucum, 'Cel')
  const dx = one('/dx hypertension')[0].data as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(dx.concept.codings[0].system, 'icd10'); assert.equal(dx.clinical_status, 'active')
  const o = one('/order cbc')[0]; assert.equal(o.type, 'order'); assert.equal((o.data as { department_id: string }).department_id, 'lab')
})
test('a pack\'s command only where the department uses its pack; elsewhere the card says where (spec §5.1 rule 1)', () => {
  // a test-only pack command: the one pack, pharmacy, has none
  registerCommand({ name: 'tpk', label: 'Test pack line', example: '/tpk 3', action: 'write:testpack.line', pack: 'testpack',
    parse: (rest) => ({ ok: [{ function: 'testpack.line', kind: 'note', params: { text: rest }, line: `Test ${rest}` }] }) })
  const usedIn = (pack: string) => pack === 'testpack' ? ['ObGyn clinic', 'Labour ward'] : []
  const here = { ...ctx, packs: ['testpack'], usedIn }, there = { ...ctx, packs: [], usedIn }
  assert.equal(expand('/tpk 3', here, [])?.items[0].function, 'testpack.line')
  assert.ok(suggest('/tp', here, [], new Set())?.items.some((s) => s.label === '/tpk'), 'offered after /')
  const e = expand('/tpk 3', there, [])!
  assert.deepEqual(e.items, []); assert.deepEqual(e.errors, []); assert.equal(e.hint, '/tpk is used in: ObGyn clinic, Labour ward')
  assert.equal(suggest('/tp', there, [], new Set()), null, 'not offered after /')
  assert.equal(suggest('tpk 3', there, [], new Set()), null, 'nor offered for the word without its slash')
  assert.match(expand('/tpk', { ...ctx, packs: [], usedIn: () => [] }, [])!.hint!, /not used in any department here/)
  assert.equal(expand('/tpk 3', ctx, [])?.items.length, 1, 'no department in the context (tests, previews): every command')
  assert.equal(expand('/rx metformin 500 bd', there, [])?.items.length, 1, 'the base\'s commands everywhere')
  // a preset's line too: skipped for the department, not the role, and it says where it works
  const tp: Template = { ...preset, id: 't3', shortcut: 'tp', items: [], lines: ['/tpk 3', '/rx metformin 500 bd'] }
  const pe = expand('#tp', { ...there, can: () => true }, [tp])!
  assert.deepEqual(pe.items.map((x) => x.function), ['medication']); assert.deepEqual(pe.skipped, ['“/tpk 3”: /tpk is used in: ObGyn clinic, Labour ward'])
  assert.equal(expand('#tp', here, [tp])!.items.length, 2, 'in a department that uses it, the preset writes both')
  assert.deepEqual(parse('/tpk 3', there), { error: '/tpk is used in: ObGyn clinic, Labour ward' }, 'parse checks the department before the role')
})
test('a pack adds drafts to a core command where the department uses it (the owner\'s C3): derived, again on an edit, left out when dropped', () => {
  const add = (ds: Parsed[], _c: Ctx, more: { said: string[]; prev: Parsed[] }) => { const v = ds.find((d) => d.function === 'vitals'); if (!v?.params.pulse) return []
    const was = more.prev[0]?.params; return [{ function: 'score', kind: 'score', action: 'write:score', params: { pulse: v.params.pulse, tp: more.said.includes('tp') || !!was?.tp }, line: `Test ${v.params.pulse}` }] }
  assert.equal(addToCommand({ pack: 'testpack', name: 'v', writes: ['score'], words: ['TP'], add, note: () => 'test note' }), true)
  quiet(() => { assert.equal(addToCommand({ pack: 'base', name: 'v', writes: ['score'], add }), false, 'the base adds nothing')
    assert.equal(addToCommand({ pack: 'testpack', name: 'v', writes: ['score'], add }), false, 'one addition a pack to a command')
    assert.equal(addToCommand({ pack: 'other', name: 'v', writes: [], add }), false); assert.equal(addToCommand({ pack: 'other', name: 'v', writes: ['score'], add: 1 as never }), false) })
  const here: Ctx = { ...ctx, packs: ['testpack'] }
  const two = (parse('/v 120/80 84', here) as { ok: Parsed[] }).ok
  assert.deepEqual(two.map((d) => [d.function, d.by, d.action]), [['vitals', undefined, 'write:vitals'], ['score', 'testpack', 'write:score']])
  assert.equal(parse('/v 120/80 84', { ...ctx, packs: [] }) && (parse('/v 120/80 84', { ...ctx, packs: [] }) as { ok: Parsed[] }).ok.length, 1); assert.equal(ok('/v 120/80 84').length, 1, 'packs unknown: none')
  assert.equal(((parse('/v 120/80 84 tp', here) as { ok: Parsed[] }).ok[1].params.tp), true, 'its own word, taken out of the line')
  assert.match(err('/v 120/80 84 tp'), /^Not a vital: “tp”/, 'elsewhere it is no word of /v')
  const v = commandNamed('v', here)!; assert.deepEqual(v.writes, ['vitals', 'score']); assert.deepEqual(commandNamed('v', ctx)!.writes, ['vitals'])
  const edited = v.again!([{ ...two[0], params: { ...two[0].params, pulse: 100 } }, two[1]], '120/80 84', here)
  assert.deepEqual(edited.map((d) => d.line), ['BP 120/80 · P 84', 'Test 100'], 'derived again from the edited vitals')
  assert.deepEqual(v.again!(two, '120/80 84', here, ['testpack']).map((d) => d.function), ['vitals'], 'left out: it stays out')
  assert.equal(v.again!([two[0], { ...two[1], params: { ...two[1].params, tp: true } }], '120/80 84', here)[1].params.tp, true, 'prev: what its card chose')
  assert.match(String(renderToStaticMarkup(createElement('div', null, v.note!(two, here)))), /test note/)
  quiet(() => assert.equal(addToCommand({ pack: 'other2', name: 'tpk', writes: ['score'], add }), true))   // aimed at a pack's command: it never applies
  const tpkHere: Ctx = { ...here, packs: ['testpack', 'other2'] }
  assert.equal(commandNamed('tpk', tpkHere)!.again, undefined, 'a pack\'s command takes no addition'); assert.equal(commandNamed('tpk', tpkHere)!.writes, undefined)
  assert.equal((parse('/tpk 3', tpkHere) as { ok: Parsed[] }).ok.length, 1)
  assert.equal(expand('/v', here, [])!.items.length, 1, 'the empty card: nothing to derive from')
  const tpl: Template = { ...preset, id: 't4', shortcut: 'obs', items: [], lines: ['/v 120/80 84'] }
  const pre = expand('#obs', here, [tpl])!.items
  assert.deepEqual(pre.map((d) => d.function), ['vitals', 'score'], 'a preset line derives too')
  // …and again on a card edit, as the composer does for a preset's line (its command's again, with the line's own words)
  assert.deepEqual(v.again!([{ ...pre[0], params: { ...pre[0].params, pulse: 90 } }, pre[1]], '120/80 84', here).map((d) => d.line), ['BP 120/80 · P 84', 'Test 90'])
  const other = { function: 'note', kind: 'note', params: { text: 'x' }, line: 'x', by: 'elsewhere' }
  assert.deepEqual(v.again!([two[0], other, two[1]], '120/80 84', here).map((d) => d.by), [undefined, 'elsewhere', 'testpack'], 'another command\'s additions stay as they are')
  addToCommand({ pack: 'throws', name: 'v', writes: ['score'], add: () => { throw new Error('no') } })
  addToCommand({ pack: 'wrong', name: 'v', writes: ['score'], add: () => [{ function: 'note', kind: 'note', params: {}, line: 'x' }] })
  assert.deepEqual(quiet(() => (parse('/v 120/80 84', { ...ctx, packs: ['throws', 'wrong'] }) as { ok: Parsed[] }).ok.map((d) => d.function)), ['vitals'], 'a throwing add or a wrong function is left out')
})
test('the base facts: /preg with an LMP or weeks, /bf, /alert by kind; an end changes the standing fact; HIV is never written', () => {
  const was = { status: 'current', pregnant: true, weeks: 10 }
  const standing = { pregnancy: { entry_id: 'g1', data: was, words: 'Pregnant · 12 wk' }, breastfeeding: null,
    alerts: [{ entry_id: 'a1', data: { concept: { text: 'DNR' }, status: 'active' }, words: 'DNR', code: 'local.alert:dnr' }] }
  const fx: Ctx = { ...ctx, facts: standing }
  const one = (line: string, c: Ctx = ctx) => { const r = parse(line, c); assert.ok(r && 'ok' in r, `${line} → ${JSON.stringify(r)}`); return r.ok[0] }
  const no = (line: string, c: Ctx = ctx) => { const r = parse(line, c); assert.ok(r && 'error' in r, `${line} should be refused, got ${JSON.stringify(r)}`); return r.error }
  assert.deepEqual(one('/preg 12w').params, { action: 'record', pregnant: true, weeks: 12, lmp: null, entry_id: null }); assert.equal(one('/preg 12 weeks').line, 'Pregnant · 12 wk')
  assert.equal(one('/preg lmp 2026-08-01').line, 'Pregnant · LMP 2026-08-01'); assert.equal(one('/preg no').line, 'Not pregnant'); assert.equal(one('/preg').action, 'write:pregnancy')
  assert.match(no('/preg no 12w'), /no dates/); assert.match(no('/preg 12w lmp 2026-08-01'), /not both/); assert.match(no('/preg end'), /No pregnancy/)
  assert.equal(one('/preg 14w', fx).params.entry_id, 'g1', 'a standing pregnancy is changed, never doubled')
  const ended = one('/preg end delivered', fx); assert.equal(ended.line, 'End: Pregnant · 12 wk — delivered')
  const [e] = draftEntries({ id: 'd1', function: ended.function, params: ended.params }, { patientId: 'pt', departmentId: 'im' })
  assert.deepEqual({ type: e.type, data: e.data, refers_to: e.refers_to, relation: e.relation }, { type: 'pregnancy', data: { ...was, status: 'ended', reason: 'delivered' }, refers_to: 'g1', relation: 'changes' })
  const [g] = draftEntries({ id: 'd2', function: 'pregnancy', params: one('/preg lmp 2026-08-01').params }, { patientId: 'pt', departmentId: 'im' })
  assert.deepEqual(g.data, { status: 'current', pregnant: true, lmp: { value: '2026-08-01', precision: 'day' } })
  assert.equal(one('/bf').line, 'Breastfeeding'); assert.equal(one('/bf no').line, 'Not breastfeeding'); assert.match(no('/bf end'), /No breastfeeding/)
  assert.deepEqual(one('/alert hbv').params, { action: 'add', kind: 'isolation_hbv', text: 'Isolation · HBV' }); assert.equal(one('/alert dnr').line, 'Alert: DNR')
  assert.equal(one('/alert fall risk').params.kind, 'fall_risk'); assert.equal(one('/alert difficult airway').params.kind, 'other')
  assert.match(no('/alert isolation hiv'), /never names HIV/); assert.match(no('/alert HIV+'), /never names HIV/)
  const [al] = draftEntries({ id: 'd3', function: 'alert', params: one('/alert hcv').params }, { patientId: 'pt', departmentId: 'im' })
  assert.deepEqual(al.data, { concept: { text: 'Isolation · HCV', codings: [{ system: 'local.alert', code: 'isolation_hcv', display: 'Isolation · HCV' }] }, status: 'active' })
  const end = one('/alert end dnr', fx); assert.equal(end.line, 'End alert: DNR'); assert.equal(one('/alert end', fx).params.entry_id, 'a1', 'the one standing alert')
  const [ae] = draftEntries({ id: 'd4', function: 'alert', params: end.params }, { patientId: 'pt', departmentId: 'im' })
  assert.equal((ae.data as { status: string }).status, 'inactive'); assert.equal(ae.refers_to, 'a1')
})
test('the facts\' guards: a bare /alert is no alert yet; an LMP that is not a day; AIDS is HIV', () => {
  const no = (line: string) => { const r = parse(line, ctx); assert.ok(r && 'error' in r, `${line} should be refused, got ${JSON.stringify(r)}`); return r.error }
  const x = expand('/alert', ctx, []); assert.equal(x?.items.length, 1, JSON.stringify(x)); const bare = x!.items[0]
  assert.equal(bare.params.kind, null); assert.equal(bare.line, 'Alert')
  assert.match(factMissing(bare, '2026-10-06') ?? '', /Say what the alert is/, 'Enter on a bare /alert drafts nothing (never a DNR)')
  assert.equal(factMissing({ ...bare, params: { ...bare.params, kind: 'dnr', text: 'DNR' } }, '2026-10-06'), null, 'a kind picked: it may be added')
  assert.match(no('/preg lmp 2025-02-30'), /not a day/); assert.match(no('/preg 2025-13-01'), /not a day/)
  assert.match(factMissing({ function: 'pregnancy', params: { action: 'record', pregnant: true, lmp: '2025-02-30' } }, '2026-10-06') ?? '', /LMP is a day/)
  assert.equal(isDay('2024-02-29'), true); assert.equal(isDay('2025-02-29'), false)
  assert.match(no('/alert isolation AIDS'), /never names HIV/); assert.match(no('/alert human immunodeficiency virus'), /never names HIV/)
  assert.match(factMissing({ function: 'alert', params: { action: 'add', kind: 'other', text: 'Isolation B20' } }, '2026-10-06') ?? '', /never names HIV/)
})
test('the / list (owner, 2026-10-07): one column in groups, named in words, narrowing as typed', () => {
  const all = suggest('/', ctx, [], new Set())!.items
  const groups = [...new Set(all.map((x) => x.group))]
  assert.deepEqual(groups.slice(0, 3), ['Record', 'Orders and medicines', 'Safety and scores'], 'the base groups first, in order')
  assert.deepEqual(all.filter((x) => x.group === 'Record').map((x) => x.title), ['Vitals', 'Diagnosis', 'Allergy', 'Long note'])
  assert.equal(all.find((x) => x.label === '/rx')!.title, 'Prescription'); assert.equal(all.find((x) => x.label === '/rx')!.detail, '/rx metformin 500 bd 30d for dm', 'one short example')
  assert.deepEqual(suggest('/r', ctx, [], new Set())!.items.map((x) => x.label), ['/rx'], 'narrows as typed')
})
console.log(`composer: ${n} groups passed`)
