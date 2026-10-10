// Print her table (spec/openCare.md §5.8; the picture #haem-inr): under /inr as drawn (the week as the card has it) and in the
// Anticoagulation section (the week now, signed), a person's click through the core's print facility — logged like a read under the
// purpose the chart's reads carry; the same week printed again marked Reprint. Built 2026-10-10.
import { PrintButton, usePrint } from '@core/print'
import { purposeFor } from '@core/hooks/reads'
import { TABLE_KEY, type InrTable } from './printout'

export function PrintTable({ table, patientId, departmentId, label = 'Print' }: { table: InrTable; patientId: string; departmentId?: string | null; label?: string }) {
  const print = usePrint()
  return <PrintButton size="sm" variant="outline" label={label}
    print={() => print({ key: TABLE_KEY, data: table, thing: table.thing, patientId, ...(departmentId ? { departmentId } : {}), ...purposeFor(patientId) })} />
}
