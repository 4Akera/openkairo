// Builders for the chart model's tests (npm run test:chart): server shapes as read() returns them, with only what a test names.
import type { ListRowData, OrderRow, Organization, PresenceRow, ReviewRow, ServerEntry, ServerRecord, TableRead, ValueRow } from '../src/core/db/types'
import { MOVES } from '../src/core/screens/chart/model/items'

export const T0 = '2026-09-27T08:00:00Z'
const BASE = ['note', 'vitals', 'result', 'medication', 'order', 'problem', 'allergy', 'list_review', 'given', 'procedure', 'observation', 'alert', 'died', 'crossed_out', 'step']
const type = (key: string, in_record: boolean, base_type: string | null = null, en = key) => ({ key, version: 1, layer: base_type ? 'pharmacy' : 'base', base_type, in_record, may_be_private: false, labels: { en } })
export const types: Organization['types'] = [...BASE.map((k) => type(k, true)), ...[...MOVES, 'reviewed', 'private', 'not_private', 'opened_anyway'].map((k) => type(k, false)),
  type('pharmacy.dispense', true, 'step', 'Dispense')]
export const org = {
  types, places: [{ id: 'bed3', name: 'Bed 3' }, { id: 'bed5', name: 'Bed 5' }],
  services: [{ id: 'cbc', name: 'Complete blood count', steps: ['collected', 'received'], department_id: 'lab', reply_type: 'result' },
    { id: 'rx', code: 'dispense', name: 'Dispensing', steps: ['prepared'], department_id: 'ph', reply_type: 'pharmacy.dispense' }],
  allDepartments: [{ id: 'gp', name: 'General Practice' }, { id: 'lab', name: 'Laboratory' }, { id: 'ward', name: 'Medical Ward' }, { id: 'psy', name: 'Psychiatry' }, { id: 'ph', name: 'Pharmacy' }],
  users: [{ id: 'dr', name: 'Dr. Ali Hassan' }, { id: 'tech', name: 'Lab Tech' }, { id: 'rn', name: 'Sarah Nurse' }],
} as unknown as Organization
export const ctx = { org, me: 'dr', departmentId: 'gp', now: new Date('2026-09-27T10:00:00Z') }

let seq = 0
/** an entry: its own item at version 1 in its own set, written now in General Practice by Dr. Ali, unless the test says otherwise */
export function E(t: string, over: Partial<ServerEntry> = {}): ServerEntry {
  const id = over.id ?? `e${++seq}`
  return { id, type: t, type_version: 1, item: id, item_version: 1, patient_id: 'pt', department_id: 'gp', visit_id: null, occurred_at: over.recorded_at ?? T0, precision: 'second',
    recorded_at: T0, set_id: `s-${id}`, replaces: null, refers_to: null, relation: null, source: 'staff', hidden: false, line: t, author_id: 'dr', data: {}, ...over }
}
/** the next version of an item: changes (a clinical update) or replaces (a correction, a cross-out) */
export const next = (was: ServerEntry, t: string, data: Record<string, unknown>, over: Partial<ServerEntry> = {}, how: 'changes' | 'replaces' = 'changes') =>
  E(t, { item: was.item, item_version: was.item_version + 1, data, ...(how === 'replaces' ? { replaces: was.id } : { refers_to: was.id, relation: 'changes' as const }), ...over })
export const table = <R,>(rows: R[], entries: (ServerEntry | undefined)[] = []): TableRead<R> =>
  ({ rows, entries: Object.fromEntries(entries.filter((e): e is ServerEntry => !!e).map((e) => [e.id, e])), patients: {}, withheld: 0 })

export function listRow(list: ListRowData['list'], es: ServerEntry[], status: string): ListRowData {
  const l = es[es.length - 1]
  return { item: es[0].item, patient_id: 'pt', list, status, code: null, entry_id: l.id, first_at: es[0].recorded_at, changed_at: l.recorded_at, visit_id: es[0].visit_id, source_entries: es.map((e) => e.id) }
}
export const val = (key: string, code: string | null, value: number, at: string, e: ServerEntry, interpretation: string | null = null, name: string | null = null): ValueRow =>
  ({ id: `${e.id}:${key}`, item: e.item, key, patient_id: 'pt', code, name, value, ucum: null, unit: null, interpretation, at, entry_id: e.id, visit_id: e.visit_id, source_entries: [e.id] })
export const presence = (item: string, over: Partial<PresenceRow> = {}): PresenceRow => ({ item, patient_id: 'pt', kind: 'visit', department_id: 'gp', from_department_id: null, place_id: null,
  state: 'done', here: true, away_since: null, urgent: false, assigned_id: null, calls: 1, missed: 0, checked_in_at: T0, called_at: null, called_by: null, seen_at: null, seen_by: 'dr',
  done_at: null, ended_at: null, wait: null, orders: 0, orders_out: 0, has_vitals: false, reason: null, came_from: null, for_order: null, last_at: T0, day: '2026-09-27',
  latest_entry: item, version: 1, source_entries: [item], ...over })
export const orderRow = (o: ServerEntry, over: Partial<OrderRow> = {}): OrderRow => ({ item: o.item, patient_id: 'pt', visit_id: o.visit_id, requester_id: 'dr', from_department_id: 'gp',
  to_department_id: 'lab', service_id: 'cbc', service_code: 'cbc', service_name: 'Complete blood count', priority: 'routine', status: 'active', step: null, step_key: null, step_item: null,
  step_entry: null, answers: [], answered_at: null, final: false, about_item: null, ordered_at: o.recorded_at, last_at: o.recorded_at, day: '2026-09-27', latest_entry: o.id, version: 1,
  source_entries: [o.id], ...over })
export const reviewRow = (e: ServerEntry, over: Partial<ReviewRow> = {}): ReviewRow => ({ item: e.item, patient_id: 'pt', why: 'not_seen', level: 'normal', critical: false, for_user: 'dr',
  for_department: 'gp', order_item: null, visit_id: null, entry_id: e.id, at: e.recorded_at, source_entries: [e.id], ...over })
export const record = (tables: ServerRecord['tables'] = {}, hidden: ServerRecord['hidden'] = []): Pick<ServerRecord, 'tables' | 'hidden'> => ({ tables, hidden })

// data in each type's shape
export const problem = (text: string, status = 'active', more: Record<string, unknown> = {}) => ({ concept: { text, codings: [{ system: 'icd10', code: 'X' }] }, clinical_status: status, verification: 'confirmed', ...more })
export const med = (text: string, dose: string, timing: string, more: Record<string, unknown> = {}) =>
  ({ basis: 'prescribed', drug: { text }, dosage: { dose: { value: dose, unit: 'mg' }, timing: { code: timing } }, status: 'active', ...more })
export const analyte = (key: string, code: string, value: string, interpretation: string, range?: [number, number]) => ({ key, name: key, code: { system: 'loinc', code }, value: { value },
  interpretation, ...(range ? { range: { low: { value: String(range[0]) }, high: { value: String(range[1]) } } } : {}) })
export const result = (service: string, analytes: unknown[], status = 'final') => ({ status, service: { id: 'cbc', name: service }, analytes })
