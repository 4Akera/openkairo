// Print the form from the Surgery section (spec/openCare.md §5.8; built 2026-10-10): for a planned operation, a person's click through
// the core's print facility. The order's words (side, surgeon, anaesthetic, the risks told) are read from the order itself when asked
// (the reader's item read, logged as reads are), then the form is printed, logged like a read under the chart's purpose.
import { read } from '@core/db/rpc'
import type { ServerEntry } from '@core/db/types'
import { purposeFor } from '@core/hooks/reads'
import { PrintButton, usePrint } from '@core/print'
import { CONSENT_KEY, wordsOf, type Consent } from './printout'

export function PrintConsent({ op, operation, code, patient, departmentId }: { op: string; operation: string; code: string | null
  patient: { id: string; name: string; record: number; age_sex: string }; departmentId: string }) {
  const print = usePrint()
  const go = async () => {
    const entries = (await read<{ entries: ServerEntry[] | null }>({ shape: 'item', department_id: departmentId, item: op, ...purposeFor(patient.id) })).entries ?? []
    const w = wordsOf(entries, op)
    const data: Consent = { name: patient.name, record: patient.record, age_sex: patient.age_sex, operation, ...w, at: new Date().toISOString(), thing: `#${patient.record} · ${[code ?? operation, w.side].filter(Boolean).join(' ')}` }
    return print({ key: CONSENT_KEY, data, thing: data.thing, patientId: patient.id, departmentId, ...purposeFor(patient.id) })
  }
  return <PrintButton size="sm" variant="ghost" label="Print the form" print={go} />
}
