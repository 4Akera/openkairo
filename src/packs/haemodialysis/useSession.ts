// The Session tab's reads and its one write door (spec/openCare.md §5.6, D2b): the stay's entries (the session, the readings, the base's
// vitals, notes and givens, with the patient's lists), the patient's standing prescription (its latest version), and the patient's last
// weight before the stay began (the base's values). Each read is for treatment (or the patient's break-the-glass reason) and its key
// starts with the pack's, so a write reads them again, the board's words too. A write that comes back with warnings shows them, and Sign
// anyway sends it again with them confirmed.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { oneSet } from '@core/db/entries'
import { read, write, WriteWarned, type EntryIn } from '@core/db/rpc'
import type { Department, ServerEntry, ServerRecord, TableRead, ValueRow } from '@core/db/types'
import { purposeFor } from '@core/hooks/reads'
import { refresh } from '@core/hooks/writes'
import { errorText } from '@core/ui/time'
import { KEY } from './hooks'
import { lastWeight, latest, type RxData } from './session'

type Dept = Pick<Department, 'id'>
/** one stay's entries: the session, the readings, the base's vitals, notes and givens; the patient's lists beside them */
export function useStayRecord(dept: Dept, stay: { item: string; patient_id: string } | null) {
  return useQuery({ queryKey: [KEY, 'session', dept.id, stay?.item], enabled: !!stay, retry: false,
    queryFn: async (): Promise<ServerRecord> => {
      const [rec, crossed] = await Promise.all([read<ServerRecord>({ shape: 'record', patient_id: stay!.patient_id, department_id: dept.id, visits: [stay!.item],
        types: ['haemodialysis.session', 'haemodialysis.reading', 'vitals', 'note', 'given'], include: ['base.lists'], limit: 500, ...purposeFor(stay!.patient_id) }),
        crossedOut(dept, stay!.patient_id)])
      return { ...rec, entries: [...rec.entries, ...crossed] }
    } })
}
/** the patient's cross-outs (an entry crossed out is left out of the tab; a cross-out may carry no visit, so it is read without one) */
const crossedOut = async (dept: Dept, patientId: string) => (await read<ServerRecord>({ shape: 'record', patient_id: patientId, department_id: dept.id,
  types: ['crossed_out'], include: [], limit: 500, ...purposeFor(patientId) })).entries

export interface CurrentRx { item: string; entry_id: string; data: RxData; author_id?: string; recorded_at: string }
/** the patient's standing prescription: the latest version of the latest item not crossed out (none: null) */
export const currentRx = (entries: readonly ServerEntry[]): CurrentRx | null => {
  const e = latest(entries, 'haemodialysis.prescription').sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at))[0]
  return e ? { item: e.item, entry_id: e.id, data: e.data as unknown as RxData, author_id: e.author_id, recorded_at: e.recorded_at } : null
}
export function usePrescription(dept: Dept, patientId: string | null) {
  return useQuery({ queryKey: [KEY, 'rx', dept.id, patientId], enabled: !!patientId, retry: false,
    queryFn: async () => { const [rec, crossed] = await Promise.all([read<ServerRecord>({ shape: 'record', patient_id: patientId!, department_id: dept.id,
      types: ['haemodialysis.prescription'], include: [], limit: 20, ...purposeFor(patientId!) }), crossedOut(dept, patientId!)])
      return currentRx([...rec.entries, ...crossed]) } })
}

/** the last session's weight after: the patient's newest weight before the stay began (none: null) */
export function useLastWeight(dept: Dept, patientId: string | null, before: string | null) {
  return useQuery({ queryKey: [KEY, 'weight', dept.id, patientId, before], enabled: !!patientId && !!before, retry: false, staleTime: 60_000,
    queryFn: async () => lastWeight((await read<TableRead<ValueRow>>({ shape: 'table', table: 'base.values', department_id: dept.id,
      where: { patient_id: patientId, key: 'weight' }, entries: false })).rows, before!) })
}

/** one Done: the set written, the record and the pack's reads read again; a refusal's words, or warnings to sign anyway */
export function useSign() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null)
  const [warn, setWarn] = useState<{ text: string; again: () => void } | null>(null)
  async function sign(es: EntryIn[], after?: () => void, confirmed: string[] = []) {
    if (!es.length || busy) return
    setBusy(true); setErr(null); setWarn(null)
    try {
      await write(oneSet(es, confirmed.length ? { confirmed } : {}))
      refresh(qc); await qc.invalidateQueries({ queryKey: [KEY] }); after?.()
    } catch (e) {
      if (e instanceof WriteWarned) setWarn({ text: e.message, again: () => void sign(es, after, [...confirmed, ...e.outcome.findings.map((f) => f.code)]) })
      else setErr(errorText(e))
    } finally { setBusy(false) }
  }
  return { sign, busy, err, warn, clear: () => { setErr(null); setWarn(null) } }
}
