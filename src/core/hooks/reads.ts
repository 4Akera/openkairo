import { useQuery } from '@tanstack/react-query'
import { rpc } from '../db/rpc'
import type { PatientHit, RecordView, RequestQueue, VisitQueue, Card, Entry } from '../db/types'
import { useLive } from './live'

export function useVisitQueue(departmentId: string | null) {
  useLive(departmentId ? `queue:${departmentId}` : null, [['visit_queue', departmentId], ['request_queue', departmentId]])
  return useQuery({ queryKey: ['visit_queue', departmentId], queryFn: () => rpc<VisitQueue>('read_visit_queue', { department_id: departmentId }), enabled: !!departmentId, refetchInterval: 15_000 })
}
export function useRequestQueue(departmentId: string | null) {
  return useQuery({ queryKey: ['request_queue', departmentId], queryFn: () => rpc<RequestQueue>('read_queue', { department_id: departmentId }), enabled: !!departmentId, refetchInterval: 15_000 })
}
export function useToReview(departmentId: string | null = null, enabled = true) {
  return useQuery({ queryKey: ['to_review', departmentId], queryFn: () => rpc<Card[]>('read_to_review', departmentId ? { department_id: departmentId } : {}), refetchInterval: 30_000, enabled })
}
export function useRecord(patientId: string | null, departmentId: string | null) {
  useLive(patientId ? `record:${patientId}` : null, [['record', patientId]])
  return useQuery({ queryKey: ['record', patientId, departmentId], queryFn: () => rpc<RecordView>('read_record', { patient_id: patientId, department_id: departmentId }), enabled: !!patientId && !!departmentId })
}
export function usePatientSearch(organizationId: string | null, q: string) {
  const term = q.trim()
  return useQuery({ queryKey: ['patients', organizationId, term], queryFn: () => rpc<PatientHit[]>('read_patients', { organization_id: organizationId, query: term }), enabled: !!organizationId && term.length >= 2, placeholderData: (p) => p, staleTime: 10_000 })
}
export function useEntry(entryId: string | null) {
  return useQuery({ queryKey: ['entry', entryId], queryFn: () => rpc<Entry>('read_entry', { entry_id: entryId }), enabled: !!entryId })
}
export function useValues(patientId: string | null, codes: string[]) {
  return useQuery({ queryKey: ['values', patientId, codes], queryFn: () => rpc<Record<string, { at: string; value_number: number | null; flag: string | null }[] | null>>('read_values', { patient_id: patientId, codes }), enabled: !!patientId && codes.length > 0, staleTime: 60_000 })
}
