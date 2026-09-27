// Every write goes through write(set) (spec/openCare.md §3.9); patients through save_patient. After a write, the reads it may
// change are fetched again (the server also sends a content-free hint on the organization's and the record's channels).
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { savePatient, write, type SetIn } from '../db/rpc'
import type { Identity, VisitRow } from '../db/types'
import { hit } from '../db/views'
import { checkIn, move, newId, oneSet } from '../db/entries'
import { useDepartment } from './organization'
export { newId }

export const refresh = (qc: QueryClient) => { for (const k of ['record', 'visit_queue', 'request_queue', 'to_review', 'patients']) qc.invalidateQueries({ queryKey: [k] }) }

/** one Done: a set of entries, all or nothing */
export function useWrite() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (set: SetIn) => write(set), onSuccess: () => refresh(qc) })
}

/** the visit's moves, from any screen: check in, here or not here, urgent, call, back to waiting, send on, left, done; each changes the
 *  visit's latest version, so two people moving one visit at once are told (changed_since_opened) and look again */
export function useVisitActions() {
  const qc = useQueryClient(); const { dept } = useDepartment()
  const at = () => dept!.id
  const useMove = <A,>(fn: (a: A) => SetIn) => useMutation({ mutationFn: (a: A) => write(fn(a)), onSuccess: () => refresh(qc), onError: () => refresh(qc) })
  return {
    /** check a patient in to a department (the desk names it); returns the visit's id */
    open: useMutation({ mutationFn: async (a: { patient_id: string; department_id: string; priority?: string; reason?: string }) => {
      const e = checkIn(a.patient_id, at(), a.department_id, { priority: a.priority && a.priority !== 'routine' ? 'urgent' : undefined, reason: a.reason })
      await write(oneSet([e])); return { id: e.id }
    }, onSuccess: () => refresh(qc) }),
    present: useMove((a: { visit: VisitRow; is_present: boolean }) => oneSet([move(a.is_present ? 'here' : 'not_here', a.visit, at(), {})])),
    priority: useMove((a: { visit: VisitRow; priority: 'routine' | 'urgent' | 'stat' }) => oneSet([move('urgent', a.visit, at(), { urgent: a.priority !== 'routine' })])),
    call: useMove((a: { visit: VisitRow }) => oneSet([move('called', a.visit, at(), {})])),
    back: useMove((a: { visit: VisitRow; reason: 'not_here' | 'sent_out' | 'other' }) => oneSet([move('back_to_waiting', a.visit, at(), { reason: a.reason })])),
    left: useMove((a: { visit: VisitRow; reason?: string }) => oneSet([move('left', a.visit, at(), a.reason ? { reason: a.reason } : {})])),
    transfer: useMove((a: { visit: VisitRow; to: string }) => oneSet([move('transferred', a.visit, at(), { to_department_id: a.to })])),
    /** a check-in by mistake: crossed out, and the visit is gone from every list */
    cancel: useMove((a: { visit: VisitRow }) => oneSet([{ id: newId(), type: 'crossed_out', patient_id: a.visit.patient_id, department_id: at(), data: { reason: 'typo', text: 'checked in by mistake' }, replaces: a.visit.latest_entry }])),
    done: useMove((a: { visit: VisitRow; wait?: boolean }) => oneSet([move('done', a.visit, at(), a.wait === undefined ? {} : { wait: a.wait })])),
  }
}

/** register a patient (identity only; the record number comes from the server) */
export function useRegister() {
  const qc = useQueryClient(); const { dept, org } = useDepartment()
  return useMutation({
    mutationFn: async (a: { given_name: string; family_name: string; sex: string; born_on: string; phone_text?: string | null; national_id?: string | null; id?: string }) => {
      const born = a.born_on.trim()
      const r = await savePatient({ department_id: dept!.id, patient: { id: a.id ?? newId(), given: [a.given_name.trim()], family: a.family_name.trim(), gender: a.sex,
        birth_date: born.length === 4 ? `${born}-01-01` : born.length === 7 ? `${born}-01` : born || null, birth_precision: born.length === 4 ? 'year' : born.length === 7 ? 'month' : 'day',
        telecom: a.phone_text ? [{ system: 'phone', value: a.phone_text }] : [], identifiers: a.national_id ? [{ system: 'eg-national-id', value: a.national_id }] : [] } })
      return hit(r.patient as Identity, [], org)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patients'] }),
  })
}
