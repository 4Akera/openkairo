// Drafts become entries here (spec/openCare.md §4.7): the composer's typed lines and cards are drafts in the browser; Done turns them into
// one set of entries built from core datatypes — codings (ICD-10, ATC, LOINC, the catalog's allergens), quantities with their UCUM unit.
import { v7 as uuid } from 'uuid'
import type { EntryIn, SetIn } from './rpc'
import type { Organization, RecordView, RequestQueueRow, ServiceField, VisitRow } from './types'
import { findAllergen, findDrug } from '../screens/visit/catalog'

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
export const qty = (value: number | string | null | undefined, unit?: string | null, ucum?: string | null) =>
  value == null || value === '' ? undefined : Object.fromEntries(Object.entries({ value: String(value), unit: unit ?? undefined, ucum: ucum ?? ucumOf(unit) }).filter(([, v]) => v !== undefined))
const clean = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length))) as T
const partial = (s: string | null | undefined) => !s ? undefined : { value: s, precision: s.length === 4 ? 'year' : s.length === 7 ? 'month' : 'day' }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

// ── what a timing code means: BD twice a day ──
const PER_DAY: Record<string, [number, number, string]> = { OD: [1, 1, 'd'], BD: [2, 1, 'd'], TDS: [3, 1, 'd'], QDS: [4, 1, 'd'], q4h: [1, 4, 'h'], q6h: [1, 6, 'h'], q8h: [1, 8, 'h'], q12h: [1, 12, 'h'], weekly: [1, 1, 'wk'], monthly: [1, 1, 'mo'] }
const timing = (code: string | null | undefined) => { if (!code) return undefined; const p = PER_DAY[code]; return clean({ code, frequency: p?.[0], period: p?.[1], period_unit: p?.[2] }) }

// ── the base types, from a draft's fields ──
function vitals(q: Q) {
  return clean({ bp: q.systolic != null && q.diastolic != null ? { sys: qty(q.systolic, 'mmHg', 'mm[Hg]'), dia: qty(q.diastolic, 'mmHg', 'mm[Hg]') } : undefined,
    hr: qty(q.pulse, 'bpm', '/min'), rr: qty(q.respiratory_rate, '/min', '/min'), temp: qty(q.temperature, '°C', 'Cel'), spo2: qty(q.spo2, '%', '%'),
    weight: qty(q.weight, 'kg', 'kg'), height: qty(q.height, 'cm', 'cm'), glucose: qty(q.glucose, 'mg/dL', 'mg/dL'), pain: qty(q.pain, '/10', '{score}') })
}
function problemData(q: Q, was?: Record<string, unknown>) {
  const code = String(q.code ?? '').startsWith('icd10:') ? String(q.code).slice(6) : null
  const oldConcept = was?.concept as { codings?: unknown[] } | undefined
  return clean({ concept: { text: String(q.name ?? ''), codings: code ? [{ system: 'icd10', code, display: String(q.name ?? '') }] : oldConcept?.codings ?? [] },
    category: 'problem-list-item', clinical_status: q.action === 'resolve' ? 'resolved' : 'active', verification: q.certainty === 'suspected' ? 'provisional' : 'confirmed',
    onset: q.onset_on ? partial(String(q.onset_on)) : q.action === 'update' || q.action === 'resolve' ? (q.onset_on === '' ? undefined : was?.onset) : undefined,
    note: q.text ? String(q.text) : q.action === 'resolve' || q.text === '' ? undefined : was?.note })
}
function allergyCodings(name: string) {
  const a = findAllergen(name); const d = findDrug(name)
  return a ? [{ system: 'local.allergen', code: slug(a.name), display: a.name }] : d ? [{ system: 'atc', code: d.atc, display: d.name }] : []
}
function allergyData(q: Q) {
  const name = String(q.substance?.name ?? '')
  const reactions = String(q.reactions_text ?? '').split(/,\s*/).map((x) => x.trim()).filter(Boolean)
  return clean({ concept: { text: name, codings: allergyCodings(name) }, type: q.kind === 'intolerance' ? 'intolerance' : 'allergy', category: findDrug(name) || findAllergen(name)?.kind?.startsWith('drug') ? ['medication'] : undefined,
    criticality: q.severity === 'severe' ? 'high' : undefined, clinical_status: 'active', verification: 'confirmed',
    reactions: reactions.map((r, i) => clean({ manifestation: { text: r }, severity: i === 0 && q.severity ? q.severity : undefined })) })
}
function medicationData(q: Q, was?: Record<string, unknown>) {
  const name = String(q.drug?.name ?? (was?.drug as { text?: string } | undefined)?.text ?? '')
  const atc = String(q.drug?.code ?? '').startsWith('atc:') ? String(q.drug.code).slice(4) : findDrug(name)?.atc
  if (q.action === 'stop') return clean({ ...(was ?? {}), status: 'stopped', status_reason: q.stop_reason_text || undefined })
  if (q.action === 'repeat' && was) return clean({ ...was, status: 'active' })
  return clean({ basis: 'prescribed', drug: { text: name, codings: atc ? [{ system: 'atc', code: atc, display: name }] : [] },
    dosage: clean({ dose: qty(q.dose_number, q.dose_unit), timing: timing(q.frequency && q.frequency !== 'PRN' ? q.frequency : null), as_needed: q.prn || undefined, as_needed_for: q.prn ? q.prn_reason_text || undefined : undefined, route: q.route || undefined }),
    duration_days: q.duration_days || undefined, instructions: q.instructions_text || undefined, reasons: ((q.problems as { id: string }[] | undefined) ?? []).map((p) => ({ to: 'item', id: p.id })), status: 'active' })
}

/** one draft → the entries it writes (a medication sent to the pharmacy is two: the medication, and an order about it) */
export function draftEntries(d: Draft, w: Where): EntryIn[] {
  const q = d.params as Q; const base = { patient_id: w.patientId, department_id: w.departmentId, visit_id: w.visitId ?? null }
  const listed = (list: 'problems' | 'medications' | 'allergies', item: string) => (w.record?.[list] as { id: string; entry_id?: string; data?: Record<string, unknown> }[] | undefined)?.find((x) => x.id === item)
  switch (d.function) {
    case 'vitals': return [{ ...base, id: d.id, type: 'vitals', data: vitals(q) }]
    case 'note': return [{ ...base, id: d.id, type: 'note', data: clean({ kind: q.kind ?? 'progress', text: String(q.text ?? '').trim() }) }]
    case 'list_review': return [{ ...base, id: d.id, type: 'list_review', data: { list: q.list, outcome: q.outcome ?? 'reviewed' } }]
    case 'problem': {
      if (q.action === 'add') return [{ ...base, id: d.id, type: 'problem', data: problemData(q) }]
      const was = listed('problems', String(q.problem_id))
      return [{ ...base, id: d.id, type: 'problem', data: problemData(q, was?.data), refers_to: was?.entry_id ?? String(q.problem_id), relation: 'changes' }]
    }
    case 'allergy': {
      if (q.action === 'add') return [{ ...base, id: d.id, type: 'allergy', data: allergyData(q) }]
      const was = listed('allergies', String(q.allergy_id))
      return [{ ...base, id: d.id, type: 'allergy', data: { ...(was?.data ?? {}), clinical_status: 'inactive', verification: 'refuted' }, refers_to: was?.entry_id ?? String(q.allergy_id), relation: 'changes' }]
    }
    case 'medication': {
      const was = q.medication_id ? listed('medications', String(q.medication_id)) : undefined
      const med: EntryIn = q.action === 'start' ? { ...base, id: d.id, type: 'medication', data: medicationData(q) }
        : { ...base, id: d.id, type: 'medication', data: medicationData(q, was?.data), refers_to: was?.entry_id ?? String(q.medication_id), relation: 'changes' }
      if (!q.send) return [med]
      const svc = w.org?.services.find((s) => s.reply_type === 'pharmacy.dispense')
      return svc ? [med, { ...base, id: newId(), type: 'order', data: { service: { id: svc.id, code: svc.code, name: svc.name }, department_id: svc.department_id, priority: 'routine', status: 'active' },
        refers_to: med.id, relation: 'about' }] : [med]
    }
    case 'order': {
      const svc = q.service_id ? w.org?.services.find((s) => s.id === q.service_id) : undefined
      if (svc) return [{ ...base, id: d.id, type: 'order', data: clean({ service: clean({ id: svc.id, code: svc.code, name: svc.name, coding: svc.coding ?? undefined }), department_id: svc.department_id, priority: q.priority ?? 'routine', status: 'active', question: q.question_text || undefined }) }]
      // a consult: the department's own consult service if it has one (a note answers it), else a named consult
      const consult = w.org?.services.find((s) => s.department_id === q.to_department_id && s.reply_type === 'note')
      return [{ ...base, id: d.id, type: 'order', data: clean({ service: consult ? { id: consult.id, code: consult.code, name: consult.name } : { name: 'Consult', answer: 'note' },
        department_id: q.to_department_id, priority: q.priority ?? 'routine', status: 'active', question: q.question_text || undefined }) }]
    }
    default: return [{ ...base, id: d.id, type: d.function, data: q }]
  }
}

// ── a visit's moves: each changes its latest version (spec §4.2) ──
export function move(type: string, v: Pick<VisitRow, 'id' | 'patient_id' | 'latest_entry'>, departmentId: string, data: Record<string, unknown> = {}, refersTo?: string): EntryIn {
  return { id: newId(), type, patient_id: v.patient_id, department_id: departmentId, visit_id: v.id, refers_to: refersTo ?? v.latest_entry, relation: 'changes', data }
}
export function checkIn(patientId: string, deskId: string, toId: string, data: Record<string, unknown> = {}): EntryIn {
  const id = newId()
  return { id, type: 'checked_in', patient_id: patientId, department_id: deskId, visit_id: id, data: clean({ department_id: toId !== deskId ? toId : undefined, ...data }) }
}
export const oneSet = (entries: EntryIn[], extra: Partial<SetIn> = {}): SetIn => ({ set_id: newId(), entries, ...extra })
/** "I have seen it": a reviewed entry about the entry closes its review row */
export const reviewed = (entryId: string, patientId: string, departmentId: string, note?: string): EntryIn =>
  ({ id: newId(), type: 'reviewed', patient_id: patientId, department_id: departmentId, refers_to: entryId, relation: 'about', data: clean({ note }) })

// ── the bench: a result from the value grid, a step, a correction ──
export type Interp = 'N' | 'L' | 'H' | 'LL' | 'HH'
export function interpretation(f: ServiceField, raw: string): Interp | undefined {
  if (f.kind !== 'number' || raw === '' || !/^-?\d+(\.\d+)?$/.test(raw.trim())) return undefined
  const n = Number(raw)
  if (f.critical_low != null && n < f.critical_low) return 'LL'; if (f.critical_high != null && n > f.critical_high) return 'HH'
  if (f.reference_low != null && n < f.reference_low) return 'L'; if (f.reference_high != null && n > f.reference_high) return 'H'
  return f.reference_low != null || f.reference_high != null ? 'N' : undefined
}
export function resultEntry(r: RequestQueueRow, departmentId: string, fields: ServiceField[], vals: Record<string, string>, text: string, final: boolean, replaces?: string): EntryIn {
  const analytes = fields.flatMap((f) => { const raw = vals[f.key] ?? vals[f.code]; if (raw === undefined || raw === '') return []
    const [system, code] = f.code.includes(':') ? f.code.split(':') : [null, null]
    return [clean({ key: f.key, name: f.name, code: system ? { system, code, display: f.name } : undefined,
      value: f.kind === 'number' ? qty(raw.trim(), f.unit, f.ucum ?? ucumOf(f.unit)) : undefined, text: f.kind !== 'number' ? raw : undefined, interpretation: interpretation(f, raw),
      range: f.reference_low != null || f.reference_high != null ? clean({ low: qty(f.reference_low, f.unit, f.ucum), high: qty(f.reference_high, f.unit, f.ucum) }) : undefined,
      critical: f.critical_low != null || f.critical_high != null ? clean({ low: qty(f.critical_low, f.unit, f.ucum), high: qty(f.critical_high, f.unit, f.ucum) }) : undefined })] })
  const answersNote = r.reply_type === 'note'
  const data = answersNote ? clean({ kind: 'report', text: text.trim() || undefined })
    : clean({ status: replaces ? 'corrected' : final ? 'final' : 'preliminary', service: clean({ id: r.service_id ?? undefined, name: r.service_name ?? r.display_line }), analytes, conclusion: text.trim() || undefined })
  return { id: newId(), type: answersNote ? 'note' : 'result', patient_id: r.patient.id, department_id: departmentId, data,
    ...(replaces ? { replaces } : { refers_to: r.order.latest_entry, relation: 'answers' as const }) }
}
/** a step on an order: the first answers it; a later one changes the step before it (a pack's step type extends step) */
export function stepEntry(r: RequestQueueRow, departmentId: string, status: string, reason?: string, key?: string, type = 'step', extra: Record<string, unknown> = {}): EntryIn {
  const was = r.order.step_entry
  return { id: newId(), type, patient_id: r.patient.id, department_id: departmentId, data: clean({ status, reason, step: key, ...extra }),
    ...(was ? { refers_to: was, relation: 'changes' as const } : { refers_to: r.order.latest_entry, relation: 'answers' as const }) }
}
