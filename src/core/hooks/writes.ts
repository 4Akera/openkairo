import { useMutation, useQueryClient } from '@tanstack/react-query'
import { v7 as uuid } from 'uuid'
import { rpc } from '../db/rpc'
import type { VisitRow, VisitStatus } from '../db/types'
export const newId = () => uuid()
export interface SetItem { function: string; params: Record<string, unknown> }

export function useWriteSet(departmentId: string | null, patientId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (items: SetItem[]) => rpc('write_set', { department_id: departmentId, items }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['record', patientId] }); qc.invalidateQueries({ queryKey: ['visit_queue'] }); qc.invalidateQueries({ queryKey: ['request_queue'] }) },
  })
}
export function useVisitActions() {
  const qc = useQueryClient()
  const inv = () => { qc.invalidateQueries({ queryKey: ['visit_queue'] }); qc.invalidateQueries({ queryKey: ['private_visits'] }); qc.invalidateQueries({ queryKey: ['patients'] }); qc.invalidateQueries({ queryKey: ['record'] }) }
  return {
    open: useMutation({ mutationFn: (a: { patient_id: string; department_id: string; priority?: string; request_id?: string }) => rpc<VisitRow>('open_visit', { id: newId(), ...a }), onSuccess: inv }),
    present: useMutation({ mutationFn: (a: { visit_id: string; is_present: boolean }) => rpc<VisitRow>('mark_present', a), onSuccess: inv }),
    private: useMutation({ mutationFn: (a: { visit_id: string; is_private: boolean; reason?: string }) => rpc<VisitRow>('mark_visit_private', a), onSuccess: inv }),
    move: useMutation({ mutationFn: (a: { visit_id: string; from_status: VisitStatus; status: VisitStatus; reason?: string; wait?: boolean }) => rpc<VisitRow>('mark_visit', a), onSuccess: inv }),
  }
}
export function useRequestActions() {
  const qc = useQueryClient()
  const inv = () => { qc.invalidateQueries({ queryKey: ['request_queue'] }); qc.invalidateQueries({ queryKey: ['visit_queue'] }); qc.invalidateQueries({ queryKey: ['record'] }); qc.invalidateQueries({ queryKey: ['to_review'] }) }
  return {
    step: useMutation({ mutationFn: (a: { request_id: string; from_step: string; step: string; reason?: string }) => rpc('mark_step', a), onSuccess: inv }),
    reviewed: useMutation({ mutationFn: (ids: string[]) => rpc<number>('mark_reviewed', { request_ids: ids }), onSuccess: inv }),
    result: useMutation({ mutationFn: (a: Record<string, unknown>) => rpc('write_result', { id: newId(), ...a }), onSuccess: inv }),
    note: useMutation({ mutationFn: (a: Record<string, unknown>) => rpc('write_note', { id: newId(), ...a }), onSuccess: inv }),
  }
}
export function useRegister(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (a: Record<string, unknown>) => rpc('register_patient', { id: newId(), organization_id: organizationId, ...a }), onSuccess: () => qc.invalidateQueries({ queryKey: ['patients'] }) })
}
