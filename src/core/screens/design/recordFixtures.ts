// /design · Record blocks: a made-up record for "Demo Patient" (design-system.md §7), as the reader would return it — entries, and the
// derived tables with their source entries — folded by the chart's own model (itemsOf, bySet, draftItems), so the gallery draws
// exactly what the chart draws. No one here is real and nothing is read: the directory below is fake too.
import type { Draft } from '../../db/entries'
import type { ListRowData, OrderRow, Organization, ReviewRow, ServerEntry, ServerRecord, TableRead, ValueRow } from '../../db/types'
import { bySet, listPool, type SetGroup } from '../chart/model/encounter'
import { MOVES, draftItems, itemsOf } from '../chart/model/items'

const at = (daysAgo: number, h: number, m = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.toISOString() }
const ME = 'demo-dr', LAB_TECH = 'demo-lab', PH_TECH = 'demo-ph', GP = 'demo-gp', LAB = 'demo-lab-dept', PH = 'demo-pharmacy', PSY = 'demo-psy', PT = 'demo-patient', VISIT = 'demo-visit'
const T = { visit: at(0, 9, 40), lab: at(0, 11, 20), month: at(30, 10), year: at(365, 11), yesterday: at(1, 16, 10) }

const TYPE = (key: string, en: string, in_record = true, base_type: string | null = null) => ({ key, version: 1, layer: base_type ? 'demo' : 'base', base_type, in_record, may_be_private: key === 'note', labels: { en } })
export const SAMPLE_ORG = {
  organization: { id: 'demo-org', name: 'Demo Clinic', time_zone: 'UTC', record_view: 'visits' },
  me: { id: ME, name: 'Dr. Demo Doctor', kind: 'staff', departments: [], actions: [], works_in: [], holdings: [] },
  users: [{ id: ME, name: 'Dr. Demo Doctor' }, { id: LAB_TECH, name: 'Sample Lab Technician' }, { id: PH_TECH, name: 'Sample Pharmacist' }],
  allDepartments: [{ id: GP, name: 'General Practice' }, { id: LAB, name: 'Laboratory' }, { id: PH, name: 'Pharmacy' }, { id: PSY, name: 'Psychiatry' }],
  departments: [], templates: [], sites: [], packs: [], roles: [], actions: [], screens: [], parked_pack_calls: 0, loginUsers: [], places: [],
  services: [{ id: 'svc-cbc', department_id: LAB, name: 'Complete blood count', code: 'cbc', reply_type: 'result', steps: ['collected', 'received'], fields: [] },
    { id: 'svc-a1c', department_id: LAB, name: 'HbA1c', code: 'a1c', reply_type: 'result', steps: ['collected'], fields: [] },
    { id: 'svc-rx', department_id: PH, name: 'Dispensing', code: 'dispense', reply_type: 'pharmacy.dispense', steps: [], fields: [] }],
  types: [...[['note', 'Note'], ['vitals', 'Vitals'], ['result', 'Result'], ['medication', 'Medication'], ['order', 'Order'], ['problem', 'Problem'], ['allergy', 'Allergy'],
    ['list_review', 'List review'], ['given', 'Given'], ['procedure', 'Procedure'], ['observation', 'Observation'], ['alert', 'Alert'], ['died', 'Died'], ['crossed_out', 'Crossed out'],
    ['step', 'Step']].map(([k, en]) => TYPE(k, en)), ...[...MOVES].map((k) => TYPE(k, k, false)), TYPE('pharmacy.dispense', 'Dispense', true, 'step'), TYPE('demo.device_check', 'Device check')],
} as unknown as Organization

let n = 0
function E(type: string, data: Record<string, unknown> | undefined, over: Partial<ServerEntry> = {}): ServerEntry {
  const id = over.id ?? `demo-${type}-${++n}`; const t = over.recorded_at ?? T.visit
  return { id, type, type_version: 1, item: id, item_version: 1, patient_id: PT, department_id: GP, visit_id: VISIT, occurred_at: t, precision: 'second', recorded_at: t, set_id: 'demo-set-visit',
    replaces: null, refers_to: null, relation: null, source: 'staff', hidden: false, line: type, author_id: ME, data, ...over }
}
const next = (was: ServerEntry, data: Record<string, unknown>, over: Partial<ServerEntry> = {}, how: 'changes' | 'replaces' = 'changes') =>
  E(was.type, data, { item: was.item, item_version: was.item_version + 1, ...(how === 'replaces' ? { replaces: was.id } : { refers_to: was.id, relation: 'changes' as const }), ...over })
const q = (value: string, unit?: string, ucum?: string) => ({ value, ...(unit ? { unit } : {}), ...(ucum ? { ucum } : {}) })
const icd = (code: string) => [{ system: 'icd10', code }]
const med = (drug: string, strength: string, dose: string, unit: string, timing: string, more: Record<string, unknown> = {}) =>
  ({ basis: 'prescribed', drug: { text: drug }, strength, dosage: { dose: q(dose, unit), route: 'oral', timing: { code: timing } }, status: 'active', ...more })
const lab = (key: string, name: string, code: string, value: string, unit: string, interpretation: string, low: number, high: number, more: Record<string, unknown> = {}) =>
  ({ key, name, code: { system: 'loinc', code }, value: q(value, unit), interpretation, range: { low: q(String(low)), high: q(String(high)) }, ...more })

// ── the visit: Dr. Demo Doctor signs Done at 09:40 ──
const vitals = E('vitals', { bp: { sys: q('150', 'mmHg', 'mm[Hg]'), dia: q('95', 'mmHg', 'mm[Hg]') }, hr: q('88', 'bpm', '/min'), temp: q('37.1', '°C', 'Cel'), spo2: q('97', '%', '%'),
  weight: q('80.4', 'kg', 'kg'), method: 'seated, left arm' }, { occurred_at: at(0, 9, 32) })
const dm1 = E('problem', { concept: { text: 'Type 2 diabetes', codings: icd('E11.9') }, category: 'problem-list-item', clinical_status: 'active', verification: 'confirmed', onset: { value: '2019', precision: 'year' } }, { recorded_at: T.year, set_id: 'demo-old', visit_id: 'demo-old-visit' })
const dm2 = next(dm1, { ...dm1.data, note: 'HbA1c rising; starting metformin.' })
const htn = E('problem', { concept: { text: 'Hypertension', codings: icd('I10') }, category: 'problem-list-item', clinical_status: 'active', verification: 'provisional' })
const pen = E('allergy', { concept: { text: 'Penicillin' }, type: 'allergy', category: ['medication'], criticality: 'high', clinical_status: 'active', verification: 'confirmed',
  reactions: [{ manifestation: { text: 'Hives' }, severity: 'severe' }, { manifestation: { text: 'Wheeze' } }] })
const asa1 = E('allergy', { concept: { text: 'Aspirin' }, type: 'intolerance', clinical_status: 'active', verification: 'unconfirmed', reactions: [{ manifestation: { text: 'Heartburn' }, severity: 'mild' }] }, { recorded_at: T.month, set_id: 'demo-month' })
const asa2 = next(asa1, { ...asa1.data, clinical_status: 'inactive', verification: 'refuted', note: 'Heartburn only, on an empty stomach' })
const review = E('list_review', { list: 'medications', outcome: 'reviewed' })
const metformin = E('medication', med('Metformin', '500 mg', '1', 'tablet', 'BD', { duration_days: 30, quantity: q('60', 'tablets'), reasons: [{ to: 'item', id: dm1.item }], instructions: 'With meals' }))
const aml1 = E('medication', med('Amlodipine', '5 mg', '5', 'mg', 'OD'), { recorded_at: T.month, set_id: 'demo-month' })
const aml2 = next(aml1, med('Amlodipine', '10 mg', '10', 'mg', 'OD', { reasons: [{ to: 'item', id: htn.item }] }))
const ibu1 = E('medication', med('Ibuprofen', '400 mg', '1', 'tablet', 'TDS'), { recorded_at: T.month, set_id: 'demo-month' })
const ibu2 = next(ibu1, { ...ibu1.data, status: 'stopped', status_reason: 'stomach pain' })
const dispense = E('order', { service: { id: 'svc-rx', name: 'Dispensing' }, department_id: PH, priority: 'routine', status: 'active' }, { refers_to: metformin.id, relation: 'about' })
const given = E('pharmacy.dispense', { status: 'completed', pharmacy: { items: [{ drug: { text: 'Metformin 500 mg' }, dose: q('1', 'tablet'), quantity: q('60') }] } },
  { refers_to: dispense.id, relation: 'answers', department_id: PH, author_id: PH_TECH, visit_id: null, recorded_at: at(0, 10, 5), set_id: 'demo-set-ph' })
const cbc = E('order', { service: { id: 'svc-cbc', name: 'Complete blood count' }, department_id: LAB, priority: 'urgent', status: 'active', question: 'Pale and tired for three weeks: anaemia?' })
const a1c = E('order', { service: { id: 'svc-a1c', name: 'HbA1c' }, department_id: LAB, priority: 'routine', status: 'active' })
const step = (k: string, h: number, m: number) => E('step', { status: 'in-progress', step: k }, { refers_to: cbc.id, relation: 'answers', department_id: LAB, author_id: LAB_TECH, visit_id: null, recorded_at: at(0, h, m), set_id: `demo-step-${k}` })
const collected = step('collected', 9, 55), received = step('received', 10, 20)
const paracetamol = E('given', { status: 'completed', drug: { text: 'paracetamol' }, dose: q('1', 'g'), route: 'oral', lot: 'PX-2291' }, { occurred_at: at(0, 9, 36) })
const note = E('note', { kind: 'progress', text: 'hx: Tired for three weeks; short of breath on the stairs.\nex: Pale. Chest clear. BP 150/95.\nplan: Blood count today. Start metformin; amlodipine up to 10 mg. Review in two weeks.',
  attachments: [{ name: 'referral-letter.pdf', mime: 'application/pdf', sha256: '0'.repeat(64), size: 48_213 }] })
const appendix = E('procedure', { concept: { text: 'Appendicectomy' }, performed: { value: '2010', precision: 'year' }, status: 'completed', outcome: 'no complications' })
const smoking = E('observation', { code: { text: 'Tobacco smoking status', codings: [{ system: 'loinc', code: '72166-2' }] }, value: { concept: { text: 'Current every day smoker' } }, note: '10 a day since age 20' })
const dnr = E('alert', { concept: { text: 'Do not resuscitate' }, status: 'active', period: { start: T.month }, note: 'Decided with the patient and her family.' })
const moves = ['seen', 'done'].map((t) => E(t, t === 'done' ? {} : undefined))

// ── results back: the laboratory at 11:20; a potassium corrected ──
const inLab = { department_id: LAB, author_id: LAB_TECH, visit_id: null, recorded_at: T.lab, set_id: 'demo-set-lab' }
const blood = E('result', { status: 'final', service: { id: 'svc-cbc', name: 'Complete blood count' }, specimen: 'S-0117', analytes: [
  lab('hb', 'Haemoglobin', '718-7', '6.4', 'g/dL', 'LL', 12, 15.5, { critical: { low: q('7') } }), lab('wbc', 'White cells', '6690-2', '7.1', '×10⁹/L', 'N', 4, 11),
  lab('plt', 'Platelets', '777-3', '132', '×10⁹/L', 'L', 150, 400), lab('mcv', 'MCV', '787-2', '71', 'fL', 'L', 80, 100)] }, { ...inLab, refers_to: cbc.id, relation: 'answers', occurred_at: at(0, 9, 55) })
const k1 = E('result', { status: 'final', service: { name: 'Potassium' }, analytes: [lab('k', 'Potassium', '2823-3', '6.8', 'mmol/L', 'HH', 3.5, 5.1)] }, { ...inLab, recorded_at: at(0, 11, 5), set_id: 'demo-set-lab0', line: 'Potassium 6.8 mmol/L' })
const k2 = next(k1, { status: 'corrected', service: { name: 'Potassium' }, analytes: [lab('k', 'Potassium', '2823-3', '4.9', 'mmol/L', 'N', 3.5, 5.1)],
  conclusion: 'Findings: The first sample was haemolysed.\nImpression: Potassium normal on a fresh sample.' }, { ...inLab, line: 'Potassium 4.9 mmol/L' }, 'replaces')

// ── yesterday: a private note from Psychiatry (the reader returned a placeholder), and a note crossed out ──
const hidden = E('note', undefined, { hidden: true, line: 'Private note', department_id: PSY, author_id: undefined, visit_id: 'demo-psy-visit', recorded_at: at(1, 14, 5), set_id: 'demo-set-psy' })
const wrong = E('note', { kind: 'progress', text: 'Chest pain since this morning, radiating to the left arm.' }, { recorded_at: T.yesterday, set_id: 'demo-set-y', visit_id: null })
const struck = next(wrong, { reason: 'wrong_patient', text: 'written on the wrong record' }, { type: 'crossed_out', recorded_at: at(1, 16, 14), set_id: 'demo-set-x', visit_id: null }, 'replaces')
const notGiven = E('given', { status: 'not-done', drug: { text: 'Amlodipine 10 mg' }, reason: 'the patient declined: dizzy this morning' }, { recorded_at: T.yesterday, set_id: 'demo-set-y', visit_id: null })

// ── the tables the one record read brings ──
const tab = <R,>(rows: R[], es: ServerEntry[]): TableRead<R> => ({ rows, entries: Object.fromEntries(es.map((e) => [e.id, e])), patients: {}, withheld: 0 })
const order = (o: ServerEntry, over: Partial<OrderRow>): OrderRow => ({ item: o.item, patient_id: PT, visit_id: VISIT, requester_id: ME, from_department_id: GP, to_department_id: LAB, service_id: null,
  service_code: null, service_name: null, priority: 'routine', status: 'active', step: null, step_key: null, step_item: null, step_entry: null, answers: [], answered_at: null, final: false, about_item: null,
  ordered_at: o.recorded_at, last_at: o.recorded_at, day: '', latest_entry: o.id, version: 1, source_entries: [o.id], ...over })
const list = (l: ListRowData['list'], es: ServerEntry[], status: string): ListRowData => ({ item: es[0].item, patient_id: PT, list: l, status, code: null, entry_id: es[es.length - 1].id,
  first_at: es[0].recorded_at, changed_at: es[es.length - 1].recorded_at, visit_id: es[0].visit_id, source_entries: es.map((e) => e.id) })
const val = (key: string, code: string | null, value: number, when: string, e: ServerEntry, interpretation: string | null = null): ValueRow =>
  ({ id: `${e.id}:${key}:${when}`, item: `${e.item}:${when}`, key, patient_id: PT, code, name: null, value, ucum: null, unit: null, interpretation, at: when, entry_id: `${e.id}:${when}`, visit_id: null, source_entries: [] })
const lists = [list('problems', [dm1, dm2], 'active'), list('problems', [htn], 'active'), list('allergies', [pen], 'active'), list('allergies', [asa1, asa2], 'inactive'),
  list('medications', [metformin], 'active'), list('medications', [aml1, aml2], 'active'), list('medications', [ibu1, ibu2], 'stopped')]
const earlier = [...[[at(30, 10), 140, 90, 80, 81.2], [at(90, 10), 146, 92, 84, 82.5]].flatMap(([w, s, d, h, kg]) => [val('bp.sys', 'loinc:8480-6', s as number, w as string, vitals),
  val('bp.dia', 'loinc:8462-4', d as number, w as string, vitals), val('hr', 'loinc:8867-4', h as number, w as string, vitals), val('weight', 'loinc:29463-7', kg as number, w as string, vitals)]),
  ...[[90, 12.8, 190, 6.2], [30, 12.1, 180, 6.8]].flatMap(([d, hb, plt, wbc]) => [val('hb', 'loinc:718-7', hb, at(d, 9), blood, 'N'), val('plt', 'loinc:777-3', plt, at(d, 9), blood, 'N'),
    val('wbc', 'loinc:6690-2', wbc, at(d, 9), blood, 'N')]), val('hb', 'loinc:718-7', 6.4, at(0, 9, 55), { ...blood, id: 'now' }, 'LL'), val('k', 'loinc:2823-3', 4.2, at(9, 8), k1, 'N')]
export const SAMPLE_TABLES: ServerRecord['tables'] = {
  'base.lists': tab(lists, [dm1, dm2, htn, pen, asa1, asa2, metformin, aml1, aml2, ibu1, ibu2]),
  'base.orders': tab([order(cbc, { service_id: 'svc-cbc', service_name: 'Complete blood count', priority: 'urgent', status: 'completed', step_key: 'received', answers: [blood.id], answered_at: T.lab,
      final: true, source_entries: [cbc.id, collected.id, received.id, blood.id] }), order(a1c, { service_id: 'svc-a1c', service_name: 'HbA1c' }),
    order(dispense, { to_department_id: PH, service_id: 'svc-rx', about_item: metformin.item, status: 'completed', answers: [given.id], answered_at: given.recorded_at, final: true, source_entries: [dispense.id, given.id] })],
    [cbc, collected, received, blood, a1c, dispense, given]),
  'base.review': tab<ReviewRow>([{ item: blood.item, patient_id: PT, why: 'critical', level: 'critical', critical: true, for_user: ME, for_department: GP, order_item: cbc.item, visit_id: VISIT,
    entry_id: blood.id, at: T.lab, source_entries: [blood.id] }], [blood]),
  'base.values': tab(earlier, []),
}

// ── folded by the chart's model ──
const ctx = { types: SAMPLE_ORG.types, services: SAMPLE_ORG.services, me: ME, departmentId: GP, orders: SAMPLE_TABLES['base.orders'], reviews: SAMPLE_TABLES['base.review']!.rows,
  pool: [...listPool({ tables: SAMPLE_TABLES }), struck, k1], newSince: at(0, 10) }
const page = [vitals, dm2, htn, pen, asa2, review, metformin, dispense, aml2, ibu2, cbc, a1c, paracetamol, note, appendix, smoking, dnr, blood, k2, hidden, wrong, notGiven]
const sets = bySet(itemsOf(page, ctx), moves, SAMPLE_ORG.types)
const setOf = (e: ServerEntry) => sets.find((s) => s.set_id === e.set_id)!
export const SAMPLE_SETS = { visit: setOf(vitals), lab: setOf(blood), private: setOf(hidden), crossed: setOf(wrong) }
/** Details start open on the corrected potassium (its versions) */
export const SAMPLE_OPEN = [k2.id]
export const SAMPLE_ENV = { org: SAMPLE_ORG, me: ME, departmentId: GP, can: () => true, tables: SAMPLE_TABLES, sample: true, startOpen: SAMPLE_OPEN }
export const SAMPLE_HIDDEN = [{ department_id: PSY, department: 'Psychiatry', items: 1 }]
export const SAMPLE_PATIENT = PT

// ── drafts, drawn with the exact type and data Done will write (the composer's own draftEntries) ──
const DRAFTS: Draft[] = [
  { id: 'demo-draft-v', function: 'vitals', params: { systolic: 138, diastolic: 88, pulse: 76 }, line: '/v 138/88 76' },
  { id: 'demo-draft-rx', function: 'medication', params: { action: 'start', drug: { name: 'Atorvastatin' }, dose_number: 20, dose_unit: 'mg', frequency: 'OD', duration_days: 30, send: true }, line: '/rx atorvastatin 20 od 30d' },
  { id: 'demo-draft-n', function: 'note', params: { kind: 'progress', text: 'plan: Recheck the blood pressure in two weeks.' }, line: 'plan: Recheck the blood pressure in two weeks.' },
]
export const SAMPLE_DRAFTS: SetGroup = bySet(draftItems(DRAFTS, { patientId: PT, departmentId: GP, visitId: VISIT, org: SAMPLE_ORG }, { ...ctx, now: at(0, 10, 2) }), [], SAMPLE_ORG.types)[0]

// ── two more families: a death, and a type with no block of its own (the Fallback) ──
const died = E('died', { cause: { text: 'Cardiac arrest', codings: icd('I46.9') } }, { occurred_at: at(2, 3, 20), precision: 'minute', set_id: 'demo-set-more', recorded_at: at(2, 4) })
const device = E('demo.device_check', { device_id: 'PUMP-07', battery_pct: 82, checked_on: '2026-09-20', alarm: true, note_text: 'Alarm tested' }, { set_id: 'demo-set-more', recorded_at: at(2, 4) })
export const SAMPLE_MORE: SetGroup = bySet(itemsOf([died, device], ctx), [], SAMPLE_ORG.types)[0]
