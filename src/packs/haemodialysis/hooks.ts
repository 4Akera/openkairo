// Dialysis's reads (spec/openCare.md §5.6), each through the pack's one door (public.pack_op, which logs each patient it names) or the
// reader: who is due under the board (the clinics' C5 rows, read again each minute and on the clinic's hints), the board's words for the
// tiles (C7's read: once per board, for treatment, again when the stays change and on the clinic's hints, never on a timer; its clock
// moves each minute so the time left moves), the patients' names, one patient's isolation alerts, the Schedule tab's week, and the
// schedule's one write door (haemodialysis.plan: add or end a slot, move one session, undo a move).
import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { packOp, read } from '@core/db/rpc'
import { banner, mayIn } from '@core/db/views'
import { useLive } from '@core/hooks/live'
import { useDepartment } from '@core/hooks/organization'
import { purposeFor, useStays } from '@core/hooks/reads'
import type { Department, Identity, PatientBanner, ServerRecord } from '@core/db/types'
import type { BoardRowsRead } from '@core/screens/ward/rows'
import { staysKey, type Board } from './board'
import { boardRow, dueOf, isolationOf, orderRows } from './due'
import { chairsOf, unitOf } from './unit'
import { weekOfData } from './week'

export const KEY = 'haemodialysis'
const live = (orgId: string | undefined) => orgId ? `organization:${orgId}` : null

/** names for these patients: one read each, kept a minute; a patient gone (erased) is left out */
export function usePatients(departmentId: string, ids: string[]) {
  const sorted = [...new Set(ids)].sort()
  return useQuery({ queryKey: [KEY, 'patients', departmentId, sorted], enabled: sorted.length > 0, staleTime: 60_000, placeholderData: keepPreviousData,
    queryFn: async (): Promise<Record<string, PatientBanner>> => {
      const out: Record<string, PatientBanner> = {}
      await Promise.all(sorted.map(async (id) => {
        try { const p = await read<{ patient: Identity }>({ shape: 'patient', patient_id: id, department_id: departmentId }); out[id] = banner(p.patient) }
        catch { /* gone: no name */ }
      }))
      return out
    } })
}

/** a clock that moves on its own: the rows' words ("due 11:30" turns amber 30 minutes late) each half minute, the tiles' each minute */
function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), every); return () => clearInterval(t) }, [every])
  return now
}

// C5's buttons get no query client: Missed asks the rows to read again through this
let refetchDue: (() => unknown) | null = null
export const refreshDue = () => { void refetchDue?.() }

/** who is due now, as C5's rows (its useRows: called once per board where the unit uses the pack) */
export function useDue(dept: Department): BoardRowsRead {
  const { org } = useDepartment()
  const may = mayIn(org, 'read:queue', dept.id)
  useLive(may ? live(org?.organization.id) : null, [[KEY]])
  const q = useQuery({ queryKey: [KEY, 'due', dept.id], enabled: !!org && may, queryFn: () => packOp('haemodialysis.due', dept.id), refetchInterval: 60_000, retry: false })
  const { refetch } = q
  useEffect(() => { refetchDue = refetch; return () => { if (refetchDue === refetch) refetchDue = null } }, [refetch])
  const due = useMemo(() => dueOf(q.data), [q.data])
  const names = usePatients(dept.id, due?.patient_ids ?? [])
  const now = useNow()
  const rows = useMemo(() => {
    if (!due) return []
    const u = unitOf(org, dept.id); const chairs = chairsOf(org, dept.id)
    return orderRows(due.rows.map((r) => boardRow(r, names.data?.[r.patient_id], chairs.find((c) => c.id === r.place_id), u, now)), chairs)
  }, [due, names.data, org, dept.id, now])
  return { rows, isLoading: q.isLoading || (!!due?.patient_ids.length && names.isLoading), error: q.error }
}

/** the tiles' read (C7): each stay's session, blood pressure and isolation, read for treatment by whoever may read the record here, again
 *  when the stays change or on the clinic's hints; the answer carries a clock that moves each minute (no new read), so the board draws the
 *  time left ("on · 1:30 left", "over by 0:10") again each minute and otherwise only when an answer lands */
export function useBoard(dept: Pick<Department, 'id'>): Board | undefined {
  const { org } = useDepartment()
  const rows = useStays(dept.id).data?.rows
  const may = mayIn(org, 'read:record', dept.id)
  useLive(may ? live(org?.organization.id) : null, [[KEY]])
  const q = useQuery({ queryKey: [KEY, 'board', dept.id, staysKey(rows ?? [])], enabled: !!org && may && !!rows?.length,
    queryFn: () => packOp<Board>('haemodialysis.board', dept.id, {}, 'TREAT'), placeholderData: keepPreviousData, retry: false })
  const now = useNow(60_000)
  // a read that failed leaves the tiles without the pack's words
  return useMemo(() => q.isError || !q.data ? undefined : { ...q.data, now }, [q.data, q.isError, now])
}

/** one patient's isolation for the chairs, from their active isolation alerts (the Add card's warning), with whether it is still being
 *  read or could not be read (then the card says so: no warning is not the same as none) */
export function useIsolation(dept: Pick<Department, 'id'>, patientId: string | null) {
  const q = useQuery({ queryKey: [KEY, 'isolation', dept.id, patientId], enabled: !!patientId, staleTime: 60_000,
    queryFn: async () => isolationOf((await read<ServerRecord>({ shape: 'record', patient_id: patientId, department_id: dept.id, types: ['alert', 'crossed_out'], include: [], limit: 50,
      ...purposeFor(patientId!) })).entries) })
  return { iso: q.data ?? [], pending: !!patientId && q.isPending, failed: q.isError }
}

/** the Schedule tab's week from its Saturday: the slots, the moves, each patient's isolation (again on the clinic's hints). Another week
 *  is read afresh, never drawn from the last one's answer, so a column's date and its patients are always one week's */
export function useWeek(dept: Pick<Department, 'id'>, from: string) {
  const { org } = useDepartment()
  useLive(live(org?.organization.id), [[KEY]])
  const q = useQuery({ queryKey: [KEY, 'week', dept.id, from], enabled: !!org, retry: false,
    queryFn: () => packOp('haemodialysis.week', dept.id, { from }) })
  return { ...q, week: useMemo(() => weekOfData(q.data), [q.data]) }
}

/** the schedule's one door: add a slot, end one, move one session (or take it off a day), undo a move; then the week and who is due again */
export function usePlan(dept: Pick<Department, 'id'>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (args: Record<string, unknown>) => packOp<{ id: string }>('haemodialysis.plan', dept.id, args),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }) })
}
