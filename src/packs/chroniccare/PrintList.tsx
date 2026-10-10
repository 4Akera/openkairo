// Print the list (spec/openCare.md §5.8, Q29; the picture #chronic-list): the Chronic care tab's button, a person's click (or P), through
// the core's print facility. A list names many patients and a print of the core logs one, so each patient on the paper is logged like a
// read first, through the reader's own shape printed (the core's door, one call a patient); if any cannot be logged nothing prints.
// Built 2026-10-10. *Chosen by Claude at the owner's request* (asked: a core print of several patients).
import { read } from '@core/db/rpc'
import { PrintButton, usePrint } from '@core/print'
import { LIST_KEY, listThing, type ListSheet } from './printout'

export function PrintList({ sheet, patients, departmentId }: { sheet: () => ListSheet; patients: string[]; departmentId: string }) {
  const print = usePrint()
  const go = async () => {
    const data = sheet(); const thing = listThing(data)
    await Promise.all(patients.map((id) => read({ shape: 'printed', patient_id: id, department_id: departmentId, purpose: 'TREAT', printout: LIST_KEY, what: thing })))
    return print({ key: LIST_KEY, data, thing, departmentId })
  }
  return <PrintButton label="Print the list" keyed print={go} />
}
