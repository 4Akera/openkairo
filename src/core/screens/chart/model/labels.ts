// The chart's plain words (chart-plan.md §1.1, §6): one place for what a block, the panel and the Summary say, English now (Arabic
// can be added here later). Pure: no React, no window, so the model and its node test import it directly.
import type { Organization } from '../../../db/types'
import type { Family, Kind } from './items'

type Types = Organization['types'] | undefined

/** a key in words: history_physical → History physical */
export const words = (key: string) => { const s = key.replace(/[._]+/g, ' ').trim(); return s ? s[0].toUpperCase() + s.slice(1) : s }
/** a type's plain label: the registry's own (org.types[].labels.en), else its key in words without the pack's prefix */
export const typeLabel = (type: string, types?: Types) => types?.find((t) => t.key === type)?.labels.en ?? words(type.replace(/^[a-z0-9]+\./, ''))
const FIELD: Record<string, string> = { bp: 'Blood pressure', hr: 'Heart rate', rr: 'Respiratory rate', temp: 'Temperature', spo2: 'SpO₂', bmi: 'BMI', prn: 'When needed',
  as_needed_for: 'When needed for', duration_days: 'Days', status_reason: 'Why', body_site: 'Body site', lot: 'Lot', specimen: 'Specimen' }
/** a field's label for the Fallback block: never the raw key (the _text, _on and _id endings go, underscores become spaces) */
export const fieldLabel = (key: string) => FIELD[key] ?? words(key.replace(/_(text|on|id)$/, ''))

// ── families and kinds ──
export const FAMILY_WORD: Record<Family, string> = { note: 'Note', vitals: 'Vitals', result: 'Result', medication: 'Medicine', order: 'Order', problem: 'Problem',
  allergy: 'Allergy', review: 'List review', given: 'Given', procedure: 'Procedure', observation: 'Observation', alert: 'Alert', died: 'Died', other: 'Entry' }
/** the family's icon, a lucide name (the blocks map it to the component; the model stays free of React) — colour is for state, never type */
export const FAMILY_ICON: Record<Family, string> = { note: 'FileText', vitals: 'Activity', result: 'FlaskConical', medication: 'Pill', order: 'Send', problem: 'Stethoscope',
  allergy: 'ShieldAlert', review: 'ListChecks', given: 'Syringe', procedure: 'Scissors', observation: 'ClipboardList', alert: 'TriangleAlert', died: 'HeartOff', other: 'File' }
export const KIND_WORD: Record<Kind | 'all', string> = { all: 'All', notes: 'Notes', results: 'Results', vitals: 'Vitals', medicines: 'Medicines', orders: 'Orders',
  problems: 'Problems', allergies: 'Allergies', other: 'Other' }

// ── notes ──
const NOTE_KIND: Record<string, string> = { progress: 'Progress note', history_physical: 'History & examination', plan: 'Plan', procedure: 'Procedure note', nurse: 'Nursing note',
  letter: 'Letter', report: 'Report', consult: 'Consult reply', discharge: 'Discharge summary', referral: 'Referral', emergency: 'Emergency note', other: 'Note' }
/** a note's kind in words; a note answering an order is its reply (a report stays a report) */
export const noteKind = (kind: string | null | undefined, answersOrder = false) => answersOrder && kind !== 'report' ? 'Consult reply' : NOTE_KIND[kind ?? ''] ?? (kind ? words(kind) : 'Note')
const SECTION: Record<string, string> = { hx: 'History', history: 'History', ex: 'Examination', exam: 'Examination', examination: 'Examination', plan: 'Plan', p: 'Plan',
  s: 'Subjective', o: 'Objective', a: 'Assessment', assessment: 'Assessment', dx: 'Diagnosis', impression: 'Impression', findings: 'Findings' }
/** a note's text as small labelled paragraphs: hx: ex: plan: and S O A P lines, and a report's Findings: / Impression: */
export function sections(text: string | null | undefined): { label: string | null; text: string }[] {
  const out: { label: string | null; text: string }[] = []
  for (const line of (text ?? '').split('\n')) {
    const m = /^\s*([A-Za-z]+)\s*:\s*(.*)$/.exec(line); const label = m ? SECTION[m[1].toLowerCase()] : undefined
    if (label) out.push({ label, text: m![2].trim() })
    else if (out.length && line.trim()) out[out.length - 1].text = [out[out.length - 1].text, line.trim()].filter(Boolean).join('\n')
    else if (line.trim()) out.push({ label: null, text: line.trim() })
  }
  return out
}

// ── statuses ──
export const PROBLEM_STATUS: Record<string, string> = { active: 'Active', recurrence: 'Recurrence', relapse: 'Relapse', inactive: 'Inactive', remission: 'In remission', resolved: 'Resolved' }
export const MED_STATUS: Record<string, string> = { active: 'Current', 'on-hold': 'On hold', stopped: 'Stopped', completed: 'Completed' }
export const ALLERGY_STATUS: Record<string, string> = { active: 'Active', inactive: 'Inactive', resolved: 'Resolved', refuted: 'Not an allergy (ruled out)' }
export const ORDER_STATUS: Record<string, string> = { active: 'Sent', 'in-progress': 'In progress', 'on-hold': 'Held', completed: 'Done', revoked: 'Cancelled', rejected: 'Declined',
  cancelled: 'Cancelled', failed: 'Failed' }
const STEP: Record<string, string> = { sent: 'Sent', started: 'Started', held: 'Held', replied: 'Preliminary answer', completed: 'Done', rejected: 'Declined', cancelled: 'Cancelled',
  failed: 'Failed', revoked: 'Cancelled', resulted: 'Resulted' }
/** where an order stands (views.ts stepOf), or a step of its service (collected → Collected) */
export const stepWord = (step: string | null | undefined) => STEP[step ?? 'sent'] ?? words(step ?? '')
export const RESULT_STATUS: Record<string, string> = { registered: 'Registered', preliminary: 'Preliminary', final: 'Final', amended: 'Amended', corrected: 'Corrected', cancelled: 'Cancelled' }
export const PROCEDURE_STATUS: Record<string, string> = { preparation: 'Planned', 'in-progress': 'In progress', 'not-done': 'Not done', 'on-hold': 'On hold', stopped: 'Stopped', completed: 'Done' }
export const ALERT_STATUS: Record<string, string> = { active: 'Active', inactive: 'Inactive' }
export const GIVEN_STATUS: Record<string, string> = { completed: 'Given', 'not-done': 'Not given' }
export const CROSSED_REASON: Record<string, string> = { typo: 'Typing error', wrong_value: 'Wrong value', wrong_patient: 'Wrong patient', late_information: 'Late information', other: 'Other' }
/** a visit's or a stay's state (base.presence) in words */
export const PRESENCE_STATE: Record<string, string> = { waiting: 'Waiting', called: 'Called', with: 'With the clinician', pending: 'Waiting for results', back: 'Back',
  done: 'Done', left: 'Left', admitted: 'Admitted', discharged: 'Discharged' }
/** a presence move in words (a set head: "Seen · Done", "Moved to Bed 5") */
export const MOVE_WORD: Record<string, string> = { checked_in: 'Checked in', admitted: 'Admitted', here: 'Here', not_here: 'Not here', called: 'Called', seen: 'Seen',
  back_to_waiting: 'Back to waiting', away: 'Stepped out', urgent: 'Urgent', assigned: 'Assigned', transferred: 'Sent on', left: 'Left', done: 'Done', moved: 'Moved', discharged: 'Discharged' }

// ── medicines ──
export const FREQUENCY: Record<string, string> = { OD: 'once a day', BD: 'twice a day', TDS: 'three times a day', QDS: 'four times a day', q4h: 'every 4 hours', q6h: 'every 6 hours',
  q8h: 'every 8 hours', q12h: 'every 12 hours', weekly: 'once a week', monthly: 'once a month', PRN: 'when needed', once: 'once', stat: 'now, once' }
export const ROUTE: Record<string, string> = { oral: 'by mouth', sc: 'under the skin', im: 'into a muscle', iv: 'into a vein', topical: 'on the skin', inhaled: 'inhaled', pr: 'rectal',
  pv: 'vaginal', sl: 'under the tongue', nasal: 'in the nose' }

// ── vitals: the keys base.values writes (base.vital_keys), in the order the tiles show ──
export const VITALS: { key: string; code: string; short: string; name: string }[] = [
  { key: 'bp.sys', code: 'loinc:8480-6', short: 'BP', name: 'Blood pressure' }, { key: 'bp.dia', code: 'loinc:8462-4', short: 'BP', name: 'Diastolic BP' },
  { key: 'hr', code: 'loinc:8867-4', short: 'HR', name: 'Heart rate' }, { key: 'temp', code: 'loinc:8310-5', short: 'T', name: 'Temperature' },
  { key: 'spo2', code: 'loinc:59408-5', short: 'SpO₂', name: 'SpO₂' }, { key: 'rr', code: 'loinc:9279-1', short: 'RR', name: 'Respiratory rate' },
  { key: 'weight', code: 'loinc:29463-7', short: 'Wt', name: 'Weight' }, { key: 'height', code: 'loinc:8302-2', short: 'Ht', name: 'Height' },
  { key: 'bmi', code: 'loinc:39156-5', short: 'BMI', name: 'BMI' }, { key: 'pain', code: 'loinc:72514-3', short: 'Pain', name: 'Pain' },
  { key: 'glucose', code: 'loinc:41653-7', short: 'Glucose', name: 'Glucose (capillary)' }, { key: 'head', code: 'loinc:9843-4', short: 'Head', name: 'Head circumference' },
]
export const VITAL_CODES = new Set(VITALS.map((v) => v.code))
/** the key tests' short names (KEY_TESTS, visit/kinds.ts) */
export const SHORT: Record<string, string> = { 'loinc:4548-4': 'HbA1c', 'loinc:2160-0': 'Creatinine', 'loinc:718-7': 'Hb', 'loinc:2089-1': 'LDL' }

// ── history: observations by code (chart-plan §3.2) ──
export const FAMILY_HISTORY = new Set(['loinc:10157-6'])
export const SOCIAL_HISTORY = new Set(['loinc:72166-2', 'loinc:11331-6', 'loinc:11341-5', 'loinc:71802-3'])

/** how long ago a partial date was: 6 y · 4 mo · this month (moved from Side.tsx's since) */
export function sinceWords(on: string | null | undefined, now = new Date()) {
  if (!on) return null
  const [y, m = 1] = on.slice(0, 7).split('-').map(Number); const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m)
  return months >= 24 ? `${Math.floor(months / 12)} y` : months >= 1 ? `${months} mo` : 'this month'
}
