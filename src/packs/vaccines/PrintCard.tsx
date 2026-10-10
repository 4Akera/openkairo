// Print the child's card (spec/openCare.md §5.8, Q26 b): the Vaccines section's button, a person's click (or P) through the core's
// print facility — the print of the child's information logged like a read, under the purpose the chart's reads carry; a later copy of
// the same card marked Reprint. Built 2026-10-10.
import { PrintButton, usePrint } from '@core/print'
import { purposeFor } from '@core/hooks/reads'
import { CARD_KEY, type VaxCard } from './printout'

export function PrintCard({ card, patientId, departmentId }: { card: VaxCard; patientId: string; departmentId: string | null }) {
  const print = usePrint()
  return <PrintButton className="justify-self-start" size="sm" variant="outline" label="Print the child's card"
    print={() => print({ key: CARD_KEY, data: card, thing: card.thing, patientId, departmentId, ...purposeFor(patientId) })} />
}
