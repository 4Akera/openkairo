// What the chart has already read for oncology, kept for the composer's line (spec/openCare.md §5.8). The composer hands a command
// only its context (the record's lists and values, the services; never a setting, §5.5), so the pack keeps what its section and banner
// words were handed when the chart drew them: the clinic's regimens and, by patient, this pack's entries (the cancer and its cycles,
// as the reader may see them). /cancer and /chemo read it; nothing here is written. Pure.
import { regimensOf, type Entry, type Regimens } from './model'

type Org = Parameters<typeof regimensOf>[0]
let regimens: Regimens = { regimens: [], plans: [] }
const byPatient = new Map<string, Entry[]>()

/** the chart drew this patient's oncology entries (the section's own, each item's latest) with the clinic's settings */
export function saw(org: Org, patientId: string | null | undefined, entries: Entry[]) {
  if (org) regimens = regimensOf(org)
  if (patientId) byPatient.set(patientId, entries)
}
export const seenRegimens = (): Regimens => regimens
export const seenEntries = (patientId: string | null | undefined): Entry[] => (patientId && byPatient.get(patientId)) || []
/** for a test: what the chart saw */
export function seeForTest(r: Regimens, patientId?: string, entries: Entry[] = []) { regimens = r; if (patientId) byPatient.set(patientId, entries) }
