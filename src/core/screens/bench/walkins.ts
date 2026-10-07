// A walk-in (spec/openCare.md §5.3): a patient with no order from inside openCare — a paper request, or who asks. Started on any bench
// or at the desk, it is an order like any other, one per service, for this bench: a bench orders only for itself, a desk only for a
// bench it checks in for (the writer refuses the rest: walk_in_elsewhere). Who asked (an outside doctor) rides on it when said.
// Pure, so it is tested (npm run test:screens).
import type { EntryIn } from '../../db/rpc'
import type { Department, OrderRow, Service } from '../../db/types'
import { newId } from '../../db/entries'

/** what a walk-in may ask for here: the bench's own services, by name */
export const walkInServices = <S extends Pick<Service, 'department_id' | 'name'>>(services: S[], benchId: string) =>
  services.filter((s) => s.department_id === benchId).sort((a, b) => a.name.localeCompare(b.name))

/** one order per service, written at `from` (the bench itself, or a desk) for the bench `to`; no visit; who asked when said */
export function walkInOrders(a: { patientId: string; from: string; to: string; services: Pick<Service, 'id' | 'code' | 'name' | 'coding'>[]; askedBy?: string }): EntryIn<'order'>[] {
  const asked = a.askedBy?.trim()
  return a.services.map((s) => ({ id: newId(), type: 'order', patient_id: a.patientId, department_id: a.from, visit_id: null,
    data: { service: { id: s.id, code: s.code, name: s.name, ...(s.coding ? { coding: s.coding } : {}) }, department_id: a.to, priority: 'routine', status: 'active',
      ...(asked ? { asked_by: asked } : {}) } }))
}

/** a walk-in: started at the bench itself or at a desk, not ordered from a clinic or a ward */
export const isWalkIn = (o: Pick<OrderRow, 'from_department_id' | 'to_department_id'>, departments: Pick<Department, 'id' | 'work'>[]) =>
  o.from_department_id === o.to_department_id || departments.find((d) => d.id === o.from_department_id)?.work === 'desk'

/** the Start button's words: Start · ECG, Start · 3 */
export const startWords = (names: string[]) => names.length === 0 ? 'Start' : names.length === 1 ? `Start · ${names[0]}` : `Start · ${names.length}`
