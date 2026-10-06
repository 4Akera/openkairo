// The record panel's list actions (chart-plan.md §2 #24–26), moved from visit/Side.tsx as they were: change a dose, stop with a
// reason and update a problem seed the composer's card; repeat, send to the pharmacy, resolve, refute, a list reviewed and no known
// allergies are drafts; + starts a line (/dx /rx /al, as Alt+P/M/A). Nothing is written until Done or Sign. No JSX here: the row
// parts that use these are in parts.tsx (fast refresh keeps components and hooks in separate files).
import { useDrafts, useDraftsFor, type Draft, type NewDraft } from '../../../hooks/drafts'
import { compose } from '../../../hooks/composer'
import type { Allergy, Medication, Problem } from '../../../db/types'
import { lineOf, type Parsed } from '../../visit/parse'
import type { Drafted } from '../sections'

const seed = (label: string, p: Omit<Parsed, 'line'>) => compose({ seed: { label, items: [{ ...p, line: lineOf({ ...p, line: '' }) }] } })
/** open the composer on a medication: a new dose */
export const changeMed = (m: Medication) => seed(`Change ${m.drug_name}`, { function: 'medication', kind: 'prescription', params: { action: 'change', medication_id: m.id, drug: { code: m.drug_code, name: m.drug_name },
  dose_number: m.dose_number, dose_unit: m.dose_unit, route: m.route, frequency: m.frequency, prn: m.prn, prn_reason_text: m.prn_reason_text ?? null, instructions_text: m.instructions_text ?? null } })
/** open the composer on a medication: stopping it, with a reason */
export const stopMed = (m: Medication) => seed(`Stop ${m.drug_name}`, { function: 'medication', kind: 'prescription', params: { action: 'stop', medication_id: m.id, drug: { code: m.drug_code, name: m.drug_name }, stop_reason_text: null } })
/** open the composer on a problem: certainty, since, note */
export const updateProblem = (p: Problem) => seed(`Update ${p.name}`, { function: 'problem', kind: 'problem', params: { action: 'update', problem_id: p.id, name: p.name, status: 'active', certainty: p.certainty, onset_on: p.onset_on, text: p.note_text } })
/** + : a line started in the composer */
export const startLine = (line: string) => compose({ text: line })

export type ListName = 'problems' | 'medications' | 'allergies'
/** the drafts a click adds, exactly as Side.tsx added them */
export const DRAFT = {
  repeat: (m: Medication): NewDraft => ({ function: 'medication', params: { action: 'repeat', medication_id: m.id, drug: { code: m.drug_code, name: m.drug_name }, dose_number: m.dose_number, dose_unit: m.dose_unit, route: m.route, frequency: m.frequency }, line: `Repeat ${m.drug_name}`, kind: 'prescription' }),
  send: (m: Medication): NewDraft => ({ function: 'medication', kind: 'prescription', params: { action: 'repeat', medication_id: m.id, drug: { code: m.drug_code, name: m.drug_name }, dose_number: m.dose_number, dose_unit: m.dose_unit, route: m.route, frequency: m.frequency, send: true }, line: `Send ${m.drug_name} → pharmacy` }),
  resolve: (p: Problem): NewDraft => ({ function: 'problem', params: { action: 'resolve', problem_id: p.id, name: p.name }, line: `Resolved: ${p.name}`, kind: 'problem' }),
  refute: (a: Allergy): NewDraft => ({ function: 'allergy', params: { action: 'refute', allergy_id: a.id, substance: { name: a.substance_name } }, line: `Refuted: ${a.substance_name}`, kind: 'allergy' }),
  reviewed: (list: ListName): NewDraft => ({ function: 'list_review', params: { list, outcome: 'reviewed' }, line: `${list} reviewed`, kind: 'review' }),
  noneKnown: (): NewDraft => ({ function: 'list_review', kind: 'review', params: { list: 'allergies', outcome: 'none_known' }, line: 'No known allergies' }),
}

/** a medicine's pending draft in words (→ pharmacy · stopping — reason · → the new dose · repeat), as Side.tsx marked it */
export function pendingWord(d: Draft, drug: string) {
  if (d.params.send) return '→ pharmacy'
  if (d.params.action === 'stop') return `stopping${d.params.stop_reason_text ? ` — ${String(d.params.stop_reason_text).toLowerCase()}` : ''}`
  if (d.params.action === 'change') return `→ ${d.line.replace(drug, '').replace(/^Change:\s*/, '').trim()}`
  return 'repeat'
}

/** this patient's drafts beside the lists: what was drafted, what is pending on an item, a list's review, no known allergies */
export function useListDrafts(patientId: string) {
  const drafts = useDraftsFor(patientId)
  return {
    drafts,
    add: (d: NewDraft) => useDrafts.getState().add(patientId, d),
    remove: (id: string) => useDrafts.getState().remove(patientId, id),
    drafted: (fn: string, action: string) => drafts.filter((d) => d.function === fn && d.params.action === action),
    pending: (fn: string, key: string, id: string) => drafts.find((d) => d.function === fn && d.params[key] === id),
    review: (list: ListName) => drafts.find((d) => d.function === 'list_review' && d.params.list === list),
    nka: drafts.find((d) => d.function === 'list_review' && d.params.list === 'allergies' && d.params.outcome === 'none_known'),
  }
}
export type ListDrafts = ReturnType<typeof useListDrafts>
/** the list drafts the chips count, as the section heads do: problems and medicines added, allergies added, none known drafted */
export function draftedOf(drafts: Draft[]): Drafted {
  const n = (fn: string, action: string) => drafts.filter((d) => d.function === fn && d.params.action === action).length
  return { problem: n('problem', 'add'), medication: n('medication', 'start'), allergy: n('allergy', 'add'),
    nka: drafts.some((d) => d.function === 'list_review' && d.params.list === 'allergies' && d.params.outcome === 'none_known') }
}
