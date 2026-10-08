// The specimen labels (spec/openCare.md §5.3, §3.13 Printing; the owner's decisions of 2026-10-08): one label a tube, printed at
// Collected where the laboratory's Sample labels setting says printed — the patient's name, age and sex, the record number, when the
// sample was collected, the tube's word (never its colour alone) and its tests, fasting where it was asked, and the sample number with
// its barcode, which Scan to receive reads. Every tube of a sample carries the sample's one number (D34); a patient with two samples
// waiting gets each tube its own sample's number. Print again prints the same numbers. Pure (npm run test:lis).
import type { RequestQueueRow } from '@core/db/types'
import { ageSex } from '@core/screens/bench/shared'
import { needsFasting, tubesFor, type Cap } from './tubes'

export interface Label { sample: string; name: string; age_sex: string; record: number; at: string | null; tube: string; cap: Cap; tests: string[]; fasting: 'Fasting' | 'Not fasting' | null }
type ServiceOf = (r: RequestQueueRow) => { code: string } | undefined
/** what is known at Collected, before the queue is read again: the number just written on these tests, when, and the fasting answer */
export interface JustCollected { sample: string; at: string; fasting: boolean | null }

const testName = (r: RequestQueueRow) => r.service_name ?? r.display_line
/** the labels of a patient's collected tests: by sample (in their order), then by tube in the fixed tube order (purple, yellow, grey,
 *  blue, red, cup), each tube with its tests; a test with no sample number has no label */
export function labelsOf(rows: RequestQueueRow[], serviceOf: ServiceOf, just?: JustCollected): Label[] {
  const bySample = new Map<string, RequestQueueRow[]>()
  for (const r of rows) {
    const s = just?.sample ?? r.step_data?.specimen
    if (s) bySample.set(s, [...(bySample.get(s) ?? []), r])
  }
  return [...bySample.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([sample, rs]) => {
    const p = rs[0].patient
    const at = just?.at ?? rs.map((r) => r.order.last_at).filter(Boolean).sort()[0] ?? null
    const notFasting = just ? just.fasting === false : rs.some((r) => r.step_data?.note === 'not fasting')
    const tests = rs.map((r) => ({ code: serviceOf(r)?.code ?? '', section_name: r.section_name, name: testName(r) }))
    return tubesFor(tests).map(({ tube, tests: ts }) => ({ sample, name: `${p.given_name} ${p.family_name}`.trim(), age_sex: ageSex(p), record: p.record_number, at,
      tube: tube.word, cap: tube.cap, tests: ts.map((t) => t.name), fasting: ts.some((t) => needsFasting(t.code)) ? notFasting ? 'Not fasting' as const : 'Fasting' as const : null }))
  })
}
/** the sample numbers the labels carry, each once: what the print names (the read log, the reprint mark) */
export const samplesOf = (labels: Label[]) => [...new Set(labels.map((l) => l.sample))].join(' ')
/** "Print 3 labels" */
export const printWords = (labels: Label[]) => `Print ${labels.length} ${labels.length === 1 ? 'label' : 'labels'}`
/** the tests still at Collected (not yet received): a label can still go on their tubes */
export const atCollected = (r: RequestQueueRow) => r.order.step_key === 'collected' && r.order.status !== 'on-hold' && !!r.step_data?.specimen
