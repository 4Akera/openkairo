// Billing's reads and writes, each through the pack's one door (public.pack_op, spec §5.3) — whose reads that return patients the core
// logs per patient — and the patients' names through the reader (their identities come with billing's own table, which sends no
// record entries). Every list reads again on the clinic's content-free hint.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { packOp, read } from '@core/db/rpc'
import { banner } from '@core/db/views'
import { useLive } from '@core/hooks/live'
import type { Identity, PatientBanner } from '@core/db/types'
import type { Lines, Owed, Payment } from './money'

export const KEY = 'billing'
/** the clinic's hint: any payment, any line sent, reads every billing list again */
export function useBillingLive(orgId: string | null | undefined) {
  useLive(orgId ? `organization:${orgId}` : null, [[KEY]])
}
/** who owes at this desk, a page at a time (after: the last row), the search's patients when there is one */
export function useOwed(departmentId: string, patients: string[] | null, pages: number) {
  return useQuery({ queryKey: [KEY, 'owed', departmentId, patients, pages], placeholderData: (p) => p, refetchInterval: 30_000,
    queryFn: async () => {
      let after: { at: string; patient_id: string } | null = null; let out: Owed | null = null
      for (let i = 0; i < pages; i++) {
        const o: Owed = await packOp<Owed>('billing.owed', departmentId, { limit: 40, ...(patients ? { patients } : {}), ...(after ? { after } : {}) })
        out = out ? { ...o, rows: [...out.rows, ...o.rows] } : o
        if (!o.more || !o.rows.length) break
        const last = o.rows[o.rows.length - 1]; after = { at: last.last_at, patient_id: last.patient_id }
      }
      return out!
    } })
}
/** a patient's payable lines at this desk (the payment card) */
export const useLines = (departmentId: string, patientId: string | null) =>
  useQuery({ queryKey: [KEY, 'lines', departmentId, patientId], enabled: !!patientId, queryFn: () => packOp<Lines>('billing.lines', departmentId, { patient_id: patientId }) })
/** receipts: the day's at this desk, or one by number, or a patient's */
export const usePaid = (departmentId: string, q: { receipt?: string; patients?: string[]; payment_id?: string } = {}, enabled = true) =>
  useQuery({ queryKey: [KEY, 'paid', departmentId, q], enabled, placeholderData: (p) => p,
    queryFn: () => packOp<{ payments: Payment[]; day: string }>('billing.paid', departmentId, q) })

/** names for these patients: billing's own table brings their identities in one read (no record entries); one read each for the rest */
export function usePatients(departmentId: string, ids: string[]) {
  const sorted = [...new Set(ids)].sort()
  return useQuery({ queryKey: [KEY, 'patients', departmentId, sorted], enabled: sorted.length > 0, staleTime: 60_000, placeholderData: (p) => p,
    queryFn: async (): Promise<Record<string, PatientBanner>> => {
      const t = await read<{ patients: Record<string, Identity> }>({ shape: 'table', table: 'billing.charges', department_id: departmentId, entries: false, limit: 2000,
        where: { patient_id: sorted }, purpose: 'PATADMIN' })
      const out: Record<string, PatientBanner> = Object.fromEntries(Object.entries(t.patients).map(([k, v]) => [k, banner(v)]))
      for (const id of sorted.filter((x) => !out[x])) {
        try { const p = await read<{ patient: Identity }>({ shape: 'patient', patient_id: id, department_id: departmentId }); out[id] = banner(p.patient); if (p.patient.id !== id) out[p.patient.id] = out[id] }
        catch { /* gone (erased): no name */ }
      }
      return out
    } })
}
/** the patients a search names, by name, phone or record number (the reader's search; logged there) */
export async function findPatients(departmentId: string, q: string): Promise<{ ids: string[]; names: Record<string, PatientBanner> }> {
  const r = await read<{ patients: Identity[] }>({ shape: 'patients', q, department_id: departmentId })
  return { ids: r.patients.map((p) => p.id), names: Object.fromEntries(r.patients.map((p) => [p.id, banner(p)])) }
}
/** after a payment, a refund or a closing: every billing list looks again */
export function useBillingDone() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: [KEY] })
}
