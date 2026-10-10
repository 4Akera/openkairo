// Print the action plan (spec/openCare.md §5.8; the picture #chest-spiro): the Chest section's button beside the plan, a person's click
// through the core's print facility — the print logged like a read under the purpose the chart's reads carry; the same plan printed
// again marked Reprint. Built 2026-10-10.
import { PrintButton, usePrint } from '@core/print'
import { purposeFor } from '@core/hooks/reads'
import { PLAN_KEY, type PlanSheet } from './printout'

export function PrintPlan({ sheet, patientId, departmentId }: { sheet: PlanSheet; patientId: string; departmentId: string }) {
  const print = usePrint()
  return <PrintButton size="sm" variant="ghost" label="Print the plan"
    print={() => print({ key: PLAN_KEY, data: sheet, thing: sheet.thing, patientId, departmentId, ...purposeFor(patientId) })} />
}
