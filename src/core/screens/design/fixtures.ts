// /design's made-up data (design-system.md §7): "Demo Patient" and the values its samples show. Nothing here is read from the
// database and no one in it is real. Times are counted back from now, so "today" and "12 Jun" read as they would in a clinic.
import type { AnalyteRow, Flag, Step } from '../../ui'

const at = (daysAgo: number, h = 9, m = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.toISOString() }

export const PATIENT = { record_number: 10001, given_name: 'Demo', family_name: 'Patient', sex: 'female', age: 58, died_on: null, phone_text: '010 0000 0000' }
export const PATIENT_SUB = '58 y · F · #10001 · 010 0000 0000'

type Point = { at: string; value: number; flag?: Flag; entryId?: string; corrected?: boolean }
/** HbA1c: one normal, then high (abnormal: a hollow ring), the last one corrected */
export const HBA1C: Point[] = [{ at: at(420), value: 5.4, entryId: 'demo-1' }, { at: at(330), value: 5.9, flag: 'high', entryId: 'demo-2' },
  { at: at(240), value: 6.8, flag: 'high', entryId: 'demo-3' }, { at: at(120), value: 7.9, flag: 'high', entryId: 'demo-4' }, { at: at(20), value: 7.2, flag: 'high', entryId: 'demo-5', corrected: true }]
export const HBA1C_BAND = { low: 4.0, high: 5.6 }
/** potassium: normal, high, one critical (a filled dot with ‼), back to normal */
export const POTASSIUM: Point[] = [{ at: at(9, 8), value: 4.2 }, { at: at(6, 8), value: 4.8 }, { at: at(4, 8), value: 5.6, flag: 'high' },
  { at: at(2, 7, 40), value: 6.8, flag: 'critical', entryId: 'demo-6' }, { at: at(1, 8), value: 4.9 }]
export const POTASSIUM_BAND = { low: 3.5, high: 5.1 }
export const POTASSIUM_CRITICAL = { low: 2.8, high: 6.2 }
export const WEIGHT = [{ at: at(200), value: 84 }, { at: at(90), value: 82.5 }, { at: at(30), value: 81.2 }, { at: at(0), value: 80.4 }]

/** a renal panel: normal, a critical high with its direction (HH), a high, a low with a method line */
export const PANEL: AnalyteRow[] = [
  { name: 'Sodium', value: 139, unit: 'mmol/L', low: 135, high: 145, flag: 'normal', previous: { value: 141, at: at(30) } },
  { name: 'Potassium', value: 6.8, unit: 'mmol/L', low: 3.5, high: 5.1, flag: 'critical', interp: 'HH', previous: { value: 4.9, at: at(30) } },
  { name: 'Creatinine', value: 1.4, unit: 'mg/dL', low: 0.6, high: 1.2, flag: 'high', interp: 'H', previous: { value: 1.1, at: at(30) } },
  { name: 'Urea', value: 7.1, unit: 'mmol/L', low: 2.5, high: 7.8, flag: 'normal' },
  { name: 'eGFR', value: 52, unit: 'mL/min', low: 60, flag: 'low', interp: 'L', text: 'CKD-EPI 2021', previous: { value: 61, at: at(30) } },
]

export const STEPS: Step[] = [{ key: 'sent', label: 'Sent', at: at(0, 8, 5), state: 'done' }, { key: 'collected', label: 'Collected', at: at(0, 8, 40), state: 'done' },
  { key: 'received', label: 'Received', at: at(0, 9, 10), state: 'current' }, { key: 'resulted', label: 'Resulted', state: 'todo' }]
export const STEPS_FAILED: Step[] = [{ key: 'sent', label: 'Sent', at: at(1, 14), state: 'done' }, { key: 'rejected', label: 'Sample rejected', at: at(1, 15), state: 'failed' }]

/** a clinic list: next, where the arrows are (with ↵), long waits, one who left */
export const QUEUE = [
  { number: 10001, name: 'Demo Patient', age: '58F', status: 'Waiting · follow-up', who: 'Dr. Demo', minutes: 12, next: true },
  { number: 10002, name: 'Sample Person', age: '34M', status: 'Back with results', who: 'Dr. Demo', minutes: 35, selected: true, enter: true },
  { number: 10003, name: 'Test Child', age: '7F', status: 'With the nurse', who: 'Room 2', minutes: 75 },
  { number: 10004, name: 'Example Elder', age: '81M', status: 'Left without being seen', minutes: null, muted: true },
]
export const FREQUENCIES: [string, string][] = [['od', 'Once a day'], ['bid', 'Twice a day'], ['tid', 'Three times'], ['prn', 'When needed']]
export const REASONS = ['Side effect', 'Not working', 'Cost', 'Patient choice']
