// The family pack's reads and writes, each through its door (public.pack_op): a patient's file, files found by number, phone or address,
// a file started, joined or left. A file's members are patients the reader then reads as the chart does.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { packOp } from '@core/db/rpc'

export interface Member { patient_id: string; relation: string | null; joined_at: string }
export interface File { id: string; number: number; address: string | null; phone: string | null; members: Member[] }
export function useFileOf(patientId: string | null, deptId: string | null) {
  return useQuery({ queryKey: ['familycare.file', patientId, deptId], enabled: !!patientId && !!deptId, staleTime: 30_000,
    queryFn: async () => (await packOp<{ file: File | null }>('familycare.of_patient', deptId!, { patient_id: patientId })).file })
}
export function useFiles(q: string, deptId: string | null, patientIds: string[] = []) {
  return useQuery({ queryKey: ['familycare.files', q, deptId, patientIds.join(',')], enabled: !!deptId, staleTime: 15_000,
    queryFn: async () => (await packOp<{ files: File[] }>('familycare.find', deptId!, { q, patient_ids: patientIds })).files })
}
export const startFile = (deptId: string, a: { patient_id: string; address?: string; phone?: string; relation?: string }) => packOp<{ file: File }>('familycare.start', deptId, a)
export const joinFile = (deptId: string, a: { household_id: string; patient_id: string; relation?: string }) => packOp<{ file: File }>('familycare.join', deptId, a)
export function useFileWrites() {
  const qc = useQueryClient(); const done = () => { void qc.invalidateQueries({ queryKey: ['familycare.file'] }); void qc.invalidateQueries({ queryKey: ['familycare.files'] }) }
  return {
    join: useMutation({ mutationFn: (a: { dept: string; household_id: string; patient_id: string; relation?: string }) => joinFile(a.dept, a), onSuccess: done }),
    start: useMutation({ mutationFn: (a: { dept: string; patient_id: string; address?: string; phone?: string }) => startFile(a.dept, a), onSuccess: done }),
  }
}
export const RELATIONS = ['head', 'wife', 'husband', 'son', 'daughter', 'mother', 'father', 'other']
