// What the chart has read for surgery, kept for /opnote (spec/openCare.md §5.7): the composer hands a command only its context, so the
// pack keeps what its section was handed when the chart drew it — the patient's orders that are operations, the clinic's services and
// the surgeons' templates. Pure.
import type { OrderLike, ServiceLike, Template } from './model'

let services: ServiceLike[] = []; let templates: Template[] = []
const byPatient = new Map<string, OrderLike[]>()
export function saw(patientId: string | null | undefined, orders: OrderLike[], svc: ServiceLike[] | undefined, tpl: Template[]) {
  if (svc) services = svc
  templates = tpl
  if (patientId) byPatient.set(patientId, orders)
}
export const seen = (patientId: string | null | undefined) => ({ orders: (patientId && byPatient.get(patientId)) || [], services, templates })
