// how the composer and the drafts show an entry's kind
import type { Tone } from '../../ui/tone'
/** the numbers a general clinic follows, in the order they are shown: HbA1c, creatinine, Hb, LDL, BP (systolic, diastolic), weight */
export const KEY_TESTS = ['loinc:4548-4', 'loinc:2160-0', 'loinc:718-7', 'loinc:2089-1', 'loinc:8480-6', 'loinc:8462-4', 'loinc:29463-7']
export const KIND_TONE: Record<string, Tone> = { note: 'neutral', vitals: 'info', request: 'warn', consult: 'warn', prescription: 'accent', problem: 'accent', allergy: 'danger', review: 'neutral', pregnancy: 'info', feeding: 'info', alert: 'danger' }
export const NOTE_KINDS: [string, string][] = [['progress', 'Progress'], ['history_physical', 'History & examination'], ['plan', 'Plan'], ['procedure', 'Procedure'], ['nurse', 'Nurse'], ['letter', 'Letter'], ['other', 'Other']]
