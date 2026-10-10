// The theatre pack's Print buttons (spec/openCare.md §5.8; built 2026-10-10), through the core's print facility: Print the list on the
// operating list (each patient on the paper logged like a read first, through the reader's own shape printed, one call a patient — a
// core print logs one patient; if any cannot be logged nothing prints; *chosen by Claude at the owner's request*, asked), and Print the
// form under /op's card (the patient's consent form, logged like a read under the purpose the chart's reads carry).
import { read } from '@core/db/rpc'
import { purposeFor } from '@core/hooks/reads'
import { PrintButton, usePrint } from '@core/print'
import { CONSENT_KEY, LIST_KEY, listThing, type ConsentForm, type OpListSheet } from './printout'

export function PrintOpList({ sheet, patients, departmentId }: { sheet: () => OpListSheet; patients: string[]; departmentId: string }) {
  const print = usePrint()
  const go = async () => {
    const data = sheet(); const thing = listThing(data)
    await Promise.all([...new Set(patients)].map((id) => read({ shape: 'printed', patient_id: id, department_id: departmentId, purpose: 'TREAT', printout: LIST_KEY, what: thing })))
    return print({ key: LIST_KEY, data, thing, departmentId })
  }
  return <PrintButton label="Print the list" keyed print={go} />
}

export function PrintConsent({ form, patientId }: { form: ConsentForm; patientId: string }) {
  const print = usePrint()
  return <PrintButton size="sm" variant="outline" label="Print the form"
    print={() => print({ key: CONSENT_KEY, data: form, thing: form.thing, patientId, ...purposeFor(patientId) })} />
}
