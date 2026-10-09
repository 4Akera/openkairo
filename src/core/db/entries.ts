// Drafts become entries here (spec/openCare.md §4.7): the composer's typed lines and cards are drafts in the browser; Done turns them into
// one set of entries built from core datatypes — codings (ICD-10, ATC, LOINC, the catalog's allergens), quantities with their UCUM unit.
import { v7 as uuid } from 'uuid'
import type { EntryBody, EntryIn, EntryOf, SetIn } from './rpc'
import type { EntryData, PartialDate, Quantity, Timing } from './shapes.generated'
import type { Organization, RecordView, RequestQueueRow, ServiceField, VisitRow } from './types'
import { findAllergen, findDrug } from '../screens/visit/catalog'
import { scoreData, type ScoreParams } from '../screens/visit/score'
import { sendTarget } from '../screens/visit/send'

export const newId = () => uuid()
type Q = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export interface Draft { id: string; function: string; params: Record<string, unknown>; line?: string; kind?: string; tag?: string }
export interface Where { patientId: string; departmentId: string; visitId?: string | null; record?: RecordView | null; org?: Organization | null }

// ── units ──
const UNIT_UCUM: Record<string, string> = { mg: 'mg', g: 'g', mcg: 'ug', ug: 'ug', µg: 'ug', ml: 'mL', l: 'L', units: '[iU]', unit: '[iU]', u: '[iU]', iu: '[iU]', tab: '{tbl}', tabs: '{tbl}', tablet: '{tbl}',
  cap: '{cap}', caps: '{cap}', puff: '{puff}', puffs: '{puff}', drop: '[drp]', drops: '[drp]', sachet: '{sachet}', 'g/dl': 'g/dL', 'mg/dl': 'mg/dL', 'mmol/l': 'mmol/L', '%': '%', 'u/l': 'U/L',
  '10^9/l': '10*3/uL', '10^3/ul': '10*3/uL', 'x10^9/l': '10*3/uL', 'mmhg': 'mm[Hg]', bpm: '/min', '/min': '/min', '°c': 'Cel', c: 'Cel', kg: 'kg', cm: 'cm', 'ng/ml': 'ng/mL', 'pg/ml': 'pg/mL', 'ug/dl': 'ug/dL',
  'µmol/l': 'umol/L', 'umol/l': 'umol/L', 'meq/l': 'mEq/L', 'mm/h': 'mm/h', s: 's', 'miu/l': 'm[IU]/L', 'mg/l': 'mg/L', 'g/l': 'g/L' }
export const ucumOf = (unit: string | null | undefined) => unit ? UNIT_UCUM[unit.toLowerCase()] ?? undefined : undefined
/** a value with the unit as written and its UCUM code (the value a decimal string, so its precision is kept) */
export function qty(value: number | string | null | undefined, unit?: string | null, ucum?: string | null): Quantity | undefined {
  if (value == null || value === '') return undefined
  const u = ucum ?? ucumOf(unit)
  return { value: String(value), ...(unit != null ? { unit } : {}), ...(u !== undefined ? { ucum: u } : {}) }
}
// clean<EntryData['problem']>({…}): the type argument checks the literal against the shape (keys and enums) before the empties go
const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length))) as T
const partial = (s: string | null | undefined): PartialDate | undefined => !s ? undefined : { value: s, precision: s.length === 4 ? 'year' : s.length === 7 ? 'month' : 'day' }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

// ── what a timing code means: BD twice a day ──
const PER_DAY: Record<string, [number, number, NonNullable<Timing['period_unit']>]> = { OD: [1, 1, 'd'], BD: [2, 1, 'd'], TDS: [3, 1, 'd'], QDS: [4, 1, 'd'], q4h: [1, 4, 'h'], q6h: [1, 6, 'h'], q8h: [1, 8, 'h'], q12h: [1, 12, 'h'], weekly: [1, 1, 'wk'], monthly: [1, 1, 'mo'] }
const timing = (code: string | null | undefined): Timing | undefined => { if (!code) return undefined; const p = PER_DAY[code]; return clean<Timing>({ code, frequency: p?.[0], period: p?.[1], period_unit: p?.[2] }) }

// ── the base types, from a draft's fields ──
function vitals(q: Q): EntryData['vitals'] {
  const sys = qty(q.systolic, 'mmHg', 'mm[Hg]'); const dia = qty(q.diastolic, 'mmHg', 'mm[Hg]')   // a pressure is both or neither
  return clean<EntryData['vitals']>({ bp: sys && dia ? { sys, dia } : undefined,
    hr: qty(q.pulse, 'bpm', '/min'), rr: qty(q.respiratory_rate, '/min', '/min'), temp: qty(q.temperature, '°C', 'Cel'), spo2: qty(q.spo2, '%', '%'),
    weight: qty(q.weight, 'kg', 'kg'), height: qty(q.height, 'cm', 'cm'), glucose: qty(q.glucose, 'mg/dL', 'mg/dL'), pain: qty(q.pain, '/10', '{score}'),
    // ACVPU and air or oxygen (the owner's Q5): air alone, or oxygen with its device, its flow and FiO₂ as a percentage
    consciousness: q.consciousness || undefined,
    oxygen: q.oxygen === 'air' ? { on: 'air' } : q.oxygen === 'oxygen' ? clean<NonNullable<EntryData['vitals']['oxygen']>>({ on: 'oxygen', device: q.o2_device || undefined,
      flow: qty(q.o2_flow, 'L/min', 'L/min'), fio2: qty(q.fio2, '%', '%') }) : undefined })
}
function problemData(q: Q, was?: EntryData['problem']): EntryData['problem'] {
  const code = String(q.code ?? '').startsWith('icd10:') ? String(q.code).slice(6) : null
  return clean<EntryData['problem']>({ concept: { text: String(q.name ?? ''), codings: code ? [{ system: 'icd10', code, display: String(q.name ?? '') }] : was?.concept.codings ?? [] },
    category: 'problem-list-item', clinical_status: q.action === 'resolve' ? 'resolved' : 'active', verification: q.certainty === 'suspected' ? 'provisional' : 'confirmed',
    onset: q.onset_on ? partial(String(q.onset_on)) : q.action === 'update' || q.action === 'resolve' ? (q.onset_on === '' ? undefined : was?.onset) : undefined,
    note: q.text ? String(q.text) : q.action === 'resolve' || q.text === '' ? undefined : was?.note })
}
function allergyCodings(name: string) {
  const a = findAllergen(name); const d = findDrug(name)
  return a ? [{ system: 'local.allergen', code: slug(a.name), display: a.name }] : d ? [{ system: 'atc', code: d.atc, display: d.name }] : []
}
function allergyData(q: Q): EntryData['allergy'] {
  const name = String(q.substance?.name ?? '')
  const reactions = String(q.reactions_text ?? '').split(/,\s*/).map((x) => x.trim()).filter(Boolean)
  return clean<EntryData['allergy']>({ concept: { text: name, codings: allergyCodings(name) }, type: q.kind === 'intolerance' ? 'intolerance' : 'allergy', category: findDrug(name) || findAllergen(name)?.kind?.startsWith('drug') ? ['medication'] : undefined,
    criticality: q.severity === 'severe' ? 'high' : undefined, clinical_status: 'active', verification: 'confirmed',
    reactions: reactions.map((r, i) => clean({ manifestation: { text: r }, severity: i === 0 && q.severity ? q.severity : undefined })) })
}
function medicationData(q: Q, was?: EntryData['medication']): EntryData['medication'] {
  const name = String(q.drug?.name ?? was?.drug.text ?? '')
  const atc = String(q.drug?.code ?? '').startsWith('atc:') ? String(q.drug.code).slice(4) : findDrug(name)?.atc
  // a stop carries the medication as it stood (its drug and basis are required), or as the draft names it when that is not at hand
  if (q.action === 'stop') return clean<EntryData['medication']>({ ...(was ?? medicationData({ ...q, action: 'start' })), status: 'stopped', status_reason: q.stop_reason_text || undefined })
  if (q.action === 'repeat' && was) return clean<EntryData['medication']>({ ...was, status: 'active' })
  return clean<EntryData['medication']>({ basis: 'prescribed', drug: { text: name, codings: atc ? [{ system: 'atc', code: atc, display: name }] : [] },
    dosage: clean({ dose: qty(q.dose_number, q.dose_unit), timing: timing(q.frequency && q.frequency !== 'PRN' ? q.frequency : null), as_needed: q.prn || undefined, as_needed_for: q.prn ? q.prn_reason_text || undefined : undefined, route: q.route || undefined }),
    duration_days: q.duration_days || undefined, instructions: q.instructions_text || undefined, reasons: ((q.problems as { id: string }[] | undefined) ?? []).map((p) => ({ to: 'item', id: p.id })), status: 'active' })
}

/** a standing fact (pregnancy, breastfeeding, an alert): a new one, the standing one changed, or its end (it carries what it ends) */
function factData(type: 'pregnancy' | 'breastfeeding' | 'alert', q: Q): EntryData['pregnancy' | 'breastfeeding' | 'alert'] {
  const was = (q.was ?? {}) as Q
  if (q.action === 'end') return type === 'alert' ? clean<EntryData['alert']>({ ...was as EntryData['alert'], status: 'inactive', period: { ...was.period, end: new Date().toISOString() } })
    : type === 'pregnancy' ? clean<EntryData['pregnancy']>({ ...was as EntryData['pregnancy'], status: 'ended', reason: q.reason || undefined })
    : clean<EntryData['breastfeeding']>({ ...was as EntryData['breastfeeding'], status: 'ended' })
  if (type === 'pregnancy') return clean<EntryData['pregnancy']>({ status: 'current', pregnant: !!q.pregnant, lmp: q.pregnant ? partial(q.lmp) : undefined,
    weeks: q.pregnant && q.weeks != null ? Number(q.weeks) : undefined })
  if (type === 'breastfeeding') return { status: 'current', breastfeeding: !!q.breastfeeding }
  const text = String(q.text ?? '').trim()
  return { concept: { text, codings: q.kind && q.kind !== 'other' ? [{ system: 'local.alert', code: String(q.kind), display: text }] : [] }, status: 'active' }
}

/** one draft → the entries it writes (a medication sent on is two: the medication, and an order about it) */
export function draftEntries(d: Draft, w: Where): EntryIn[] {
  const q = d.params as Q; const base = { patient_id: w.patientId, department_id: w.departmentId, visit_id: w.visitId ?? null }
  const listed = <T extends { id: string }>(list: T[] | undefined, item: unknown) => list?.find((x) => x.id === String(item))
  switch (d.function) {
    case 'vitals': return [{ ...base, id: d.id, type: 'vitals', data: vitals(q) }]
    case 'note': return [{ ...base, id: d.id, type: 'note', data: clean({ kind: q.kind ?? 'progress', text: String(q.text ?? '').trim() }) }]
    case 'list_review': return [{ ...base, id: d.id, type: 'list_review', data: { list: q.list, outcome: q.outcome ?? 'reviewed' } }]
    case 'problem': {
      if (q.action === 'add') return [{ ...base, id: d.id, type: 'problem', data: problemData(q) }]
      const was = listed(w.record?.problems, q.problem_id)
      return [{ ...base, id: d.id, type: 'problem', data: problemData(q, was?.data), refers_to: was?.entry_id ?? String(q.problem_id), relation: 'changes' }]
    }
    case 'allergy': {
      if (q.action === 'add') return [{ ...base, id: d.id, type: 'allergy', data: allergyData(q) }]
      // refuted: the allergy as it stood (its concept is required), or as the draft names it when that is not at hand
      const was = listed(w.record?.allergies, q.allergy_id)
      return [{ ...base, id: d.id, type: 'allergy', data: { ...(was?.data ?? allergyData(q)), clinical_status: 'inactive', verification: 'refuted' }, refers_to: was?.entry_id ?? String(q.allergy_id), relation: 'changes' }]
    }
    case 'medication': {
      const was = q.medication_id ? listed(w.record?.medications, q.medication_id) : undefined
      const med: EntryIn = q.action === 'start' ? { ...base, id: d.id, type: 'medication', data: medicationData(q) }
        : { ...base, id: d.id, type: 'medication', data: medicationData(q, was?.data), refers_to: was?.entry_id ?? String(q.medication_id), relation: 'changes' }
      if (!q.send) return [med]
      // sent on: an order about it to the service a pack's answer serves for this department (visit/send.ts)
      const svc = sendTarget(w.org, w.departmentId)?.service
      return svc?.department_id ? [med, { ...base, id: newId(), type: 'order', data: { service: { id: svc.id, code: svc.code, name: svc.name }, department_id: svc.department_id, priority: 'routine', status: 'active' },
        refers_to: med.id, relation: 'about' }] : [med]
    }
    case 'order': {
      const svc = q.service_id ? w.org?.services.find((s) => s.id === q.service_id) : undefined
      if (svc?.department_id) return [{ ...base, id: d.id, type: 'order', data: clean<EntryData['order']>({ service: clean({ id: svc.id, code: svc.code, name: svc.name, coding: svc.coding ?? undefined }), department_id: svc.department_id, priority: q.priority ?? 'routine', status: 'active', question: q.question_text || undefined }) }]
      // a consult: the department's own consult service if it has one (a note answers it), else a named consult
      const consult = w.org?.services.find((s) => s.department_id === q.to_department_id && s.reply_type === 'note')
      return [{ ...base, id: d.id, type: 'order', data: clean<EntryData['order']>({ service: consult ? { id: consult.id, code: consult.code, name: consult.name } : { name: 'Consult', answer: 'note' },
        department_id: q.to_department_id, priority: q.priority ?? 'routine', status: 'active', question: q.question_text || undefined }) }]
    }
    case 'pregnancy': case 'breastfeeding': case 'alert':
      return [{ ...base, id: d.id, type: d.function, data: factData(d.function, q), ...(q.entry_id ? { refers_to: String(q.entry_id), relation: 'changes' as const } : {}) } as EntryIn]
    // a score: the inputs and the server's total and band, with the version it used (§5.1 rule 8)
    case 'score': return [{ ...base, id: d.id, type: 'score', data: scoreData(q as ScoreParams) }]
    // another type's draft (the composer makes none today): its params are that type's data, which the writer checks
    default: return [{ ...base, id: d.id, type: d.function, data: q } as EntryIn]
  }
}

// ── a visit's moves: each changes its latest version (spec §4.2) ──
export function move<K extends keyof EntryData>(type: K, v: Pick<VisitRow, 'id' | 'patient_id' | 'latest_entry'>, departmentId: string, data: EntryData[K], refersTo?: string): EntryOf<K> {
  return { id: newId(), type, patient_id: v.patient_id, department_id: departmentId, visit_id: v.id, refers_to: refersTo ?? v.latest_entry, relation: 'changes', data }
}
export function checkIn(patientId: string, deskId: string, toId: string, data: EntryData['checked_in'] = {}): EntryIn<'checked_in'> {
  const id = newId()
  return { id, type: 'checked_in', patient_id: patientId, department_id: deskId, visit_id: id, data: clean({ department_id: toId !== deskId ? toId : undefined, ...data }) }
}
export const oneSet = (entries: EntryIn[], extra: Partial<SetIn> = {}): SetIn => ({ set_id: newId(), entries, ...extra })
/** "I have seen it": a reviewed entry about the entry closes its review row */
export const reviewed = (entryId: string, patientId: string, departmentId: string, note?: string): EntryIn<'reviewed'> =>
  ({ id: newId(), type: 'reviewed', patient_id: patientId, department_id: departmentId, refers_to: entryId, relation: 'about', data: clean({ note }) })

// ── the bench: a result from the value grid, a step, a correction ──
export type Interp = 'N' | 'L' | 'H' | 'LL' | 'HH'
type Analyte = NonNullable<EntryData['result']['analytes']>[number]
export function interpretation(f: ServiceField, raw: string): Interp | undefined {
  if (f.kind !== 'number' || raw === '' || !/^-?\d+(\.\d+)?$/.test(raw.trim())) return undefined
  const n = Number(raw)
  if (f.critical_low != null && n < f.critical_low) return 'LL'; if (f.critical_high != null && n > f.critical_high) return 'HH'
  if (f.reference_low != null && n < f.reference_low) return 'L'; if (f.reference_high != null && n > f.reference_high) return 'H'
  return f.reference_low != null || f.reference_high != null ? 'N' : undefined
}
export function resultEntry(r: RequestQueueRow, departmentId: string, fields: ServiceField[], vals: Record<string, string>, text: string, final: boolean, replaces?: string): EntryIn<'note' | 'result'> {
  const analytes = fields.flatMap((f) => { const raw = vals[f.key] ?? vals[f.code]; if (raw === undefined || raw === '') return []
    const colon = f.code.indexOf(':')
    return [clean<Analyte>({ key: f.key, name: f.name, code: colon > 0 ? { system: f.code.slice(0, colon), code: f.code.slice(colon + 1), display: f.name } : undefined,
      value: f.kind === 'number' ? qty(raw.trim(), f.unit, f.ucum ?? ucumOf(f.unit)) : undefined, text: f.kind !== 'number' ? raw : undefined, interpretation: interpretation(f, raw),
      range: f.reference_low != null || f.reference_high != null ? clean({ low: qty(f.reference_low, f.unit, f.ucum), high: qty(f.reference_high, f.unit, f.ucum) }) : undefined,
      critical: f.critical_low != null || f.critical_high != null ? clean({ low: qty(f.critical_low, f.unit, f.ucum), high: qty(f.critical_high, f.unit, f.ucum) }) : undefined })] })
  const report = text.trim()
  // a note needs its text and a result a value or a conclusion (the shapes' anyOf): say so here rather than send what is refused
  if (!report && (r.reply_type === 'note' || !analytes.length)) throw new Error(r.reply_type === 'note' ? 'Write the report first' : 'Enter a value or a comment first')
  const head = { id: newId(), patient_id: r.patient.id, department_id: departmentId, ...(replaces ? { replaces } : { refers_to: r.order.latest_entry, relation: 'answers' as const }) }
  return r.reply_type === 'note' ? { ...head, type: 'note', data: { kind: 'report', text: report } }
    : { ...head, type: 'result', data: clean<EntryData['result']>({ status: replaces ? 'corrected' : final ? 'final' : 'preliminary', service: clean({ id: r.service_id ?? undefined, name: r.service_name ?? r.display_line }), analytes, conclusion: report || undefined }) }
}
// the first step on an order answers it; a later one changes the step before it
const answer = (r: RequestQueueRow) => r.order.step_entry ? { refers_to: r.order.step_entry, relation: 'changes' as const } : { refers_to: r.order.latest_entry, relation: 'answers' as const }
/** a step on an order: the first answers it; a later one changes the step before it (a pack's step type extends step) */
export function stepEntry(r: RequestQueueRow, departmentId: string, status: EntryData['step']['status'], reason?: string, key?: string, type = 'step'): EntryIn {
  const e: EntryIn<'step'> = { ...answer(r), id: newId(), type: 'step', patient_id: r.patient.id, department_id: departmentId, data: clean<EntryData['step']>({ status, reason, step: key }) }
  // a pack type extending step, named by the registry at run time (nextSteps): it takes a step's fields, checked against its own shape
  return type === 'step' ? e : { ...e, type } as EntryIn
}
/** a pack's answer on an order (its form's toWrite, a type and its data), linked like a step */
export const answerEntry = (r: RequestQueueRow, departmentId: string, body: EntryBody): EntryIn => ({ ...answer(r), id: newId(), patient_id: r.patient.id, department_id: departmentId, ...body })
