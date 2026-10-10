// Print the patient's sheet under /preop's card (spec/openCare.md §5.8, Q43; built 2026-10-10): a person's click through the core's
// print facility, logged like a read under the purpose the chart's reads carry; the same sheet printed again marked Reprint.
import { PrintButton, usePrint } from '@core/print'
import { purposeFor } from '@core/hooks/reads'
import { SHEET_KEY, type PreopSheet } from './printout'

export function PrintSheet({ sheet, patientId }: { sheet: PreopSheet; patientId: string }) {
  const print = usePrint()
  return <PrintButton size="sm" variant="outline" label="Print the patient's sheet"
    print={() => print({ key: SHEET_KEY, data: sheet, thing: sheet.thing, patientId, ...purposeFor(patientId) })} />
}
