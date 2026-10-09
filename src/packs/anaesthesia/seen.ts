// What the chart has read for anaesthesia, kept for /preop (spec/openCare.md §5.7): the composer hands a command only its context, so
// the pack keeps the patient's operations its section was handed (orders whose service is moved through "operating", by their shape).
// Pure.
export interface OpSeen { item: string; name: string; status: string; ordered_at: string }
const byPatient = new Map<string, OpSeen[]>()
export const sawOps = (patientId: string | null | undefined, ops: OpSeen[]) => { if (patientId) byPatient.set(patientId, ops) }
export const seenOps = (patientId: string | null | undefined): OpSeen[] => (patientId && byPatient.get(patientId)) || []
