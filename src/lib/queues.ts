/**
 * One departments table is the whole org model; a department composes
 * capabilities (clinic queue, order fulfilment, direct entries — ward later).
 * A "queue" is the patients-only flavor: it presents as a lane on Today and
 * never gets a work view. Settings shows every flavor in one Departments
 * list, self-described via deptSummary.
 */
import type { Department } from '../types'

/** Ward = inpatient location. Explicit discriminator — never inferred from
 * absent capabilities, so a ward can never present as a queue or work view. */
export const isWard = (d: Pick<Department, 'kind'>) => d.kind === 'ward'

export const isQueueDept = (d: Department) =>
  !isWard(d) && !!d.can_receive_patients && !d.can_receive_orders && !d.can_create_direct

/**
 * Plain-language one-liner for a department row in Settings — derived from
 * capabilities, so the row explains itself without capability checkboxes.
 */
export function deptSummary(
  d: Pick<Department, 'can_receive_orders' | 'can_create_direct' | 'can_receive_patients' | 'kind' | 'capacity'>,
  serviceCount: number,
  consultServiceCount = 0,
): string {
  if (isWard(d)) return d.capacity ? `Ward · ${d.capacity} beds` : 'Ward'
  const svc = `${serviceCount} ${serviceCount === 1 ? 'service' : 'services'}`
  const consultsOnly = consultServiceCount > 0 && consultServiceCount === serviceCount
  const parts: string[] = []
  if (d.can_receive_patients) parts.push('Clinic')
  if (d.can_receive_orders) {
    if (consultsOnly) parts.push('receives consults')
    else parts.push('fulfils orders', svc)
  } else if (d.can_create_direct) parts.push('walk-in entries', svc)
  else if (d.can_receive_patients) parts.push('queue on Today')
  if (parts.length === 0) return 'No capabilities'
  const s = parts.join(' · ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
