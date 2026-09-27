// The chart's reads beside the record (chart-plan.md §3): a page of raw entries (the encounter by visit, the Whole record by kind), the
// facts (alerts, procedures, observations and what is crossed out: nothing derives them), the documents (notes and results with files),
// and the glance for a reader who may not read the record. Every one goes through read() and is logged by the server (spec §3.10);
// none asks for the derived tables (include: []), which the one record read already holds.
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { read } from '../db/rpc'
import type { DeceasedRow, Identity, PresenceRow, ServerEntry, ServerRecord, TableRead } from '../db/types'
import { useDepartment } from './organization'
import { purposeFor } from './reads'

type Before = { recorded_at: string; id: string }
/** which entries: by visit, by type (a pack's type follows its base_type), by department, before a point; newest first */
export interface EntryPageQuery { patient_id: string; visits?: string[] | null; types?: string[] | null; departments?: string[] | null; before?: Before | null; limit?: number }
export interface EntryPage { entries: ServerEntry[]; more: boolean; hidden: ServerRecord['hidden'] }
const page = (departmentId: string, q: EntryPageQuery) => read<ServerRecord>({ shape: 'record', patient_id: q.patient_id, department_id: departmentId, include: [],
  visits: q.visits ?? undefined, types: q.types ?? undefined, departments: q.departments ?? undefined, before: q.before ?? undefined, limit: q.limit ?? 100, ...purposeFor(q.patient_id) })

/** a page of raw entries, and whether there are more (the chart folds them into items itself) */
export function useEntryPage(q: EntryPageQuery | null) {
  const { dept, org } = useDepartment()
  return useQuery({
    queryKey: ['record', q?.patient_id, 'page', q, dept?.id], enabled: !!q && !!dept && !!org,
    queryFn: async (): Promise<EntryPage> => { const r = await page(dept!.id, q!); return { entries: r.entries, more: r.more, hidden: r.hidden } },
  })
}

/** alerts, procedures and observations with their cross-outs (the model keeps each item's latest and drops the crossed out); the
 *  cross-outs also mark items crossed in the encounter, whose page (by visit) never holds a cross-out written outside it */
export function useFacts(patientId: string | null) {
  const { dept, org } = useDepartment()
  return useQuery({
    queryKey: ['record', patientId, 'facts', dept?.id], enabled: !!patientId && !!dept && !!org,
    queryFn: async () => (await page(dept!.id, { patient_id: patientId!, types: ['alert', 'procedure', 'observation', 'crossed_out'], limit: 500 })).entries,
  })
}

/** notes and results that carry files, newest first, paged only when the Documents section is opened; a hidden note returns no data,
 *  so its files never list */
export function useDocuments(patientId: string | null, enabled: boolean) {
  const { dept, org } = useDepartment()
  return useInfiniteQuery({
    queryKey: ['record', patientId, 'documents', dept?.id], enabled: enabled && !!patientId && !!dept && !!org,
    initialPageParam: null as Before | null,
    queryFn: async ({ pageParam }) => {
      const r = await page(dept!.id, { patient_id: patientId!, types: ['note', 'result'], before: pageParam, limit: 200 })
      const last = r.entries[r.entries.length - 1]
      return { docs: r.entries.filter((e) => ((e.data?.attachments as unknown[] | undefined) ?? []).length > 0), next: r.more && last ? { recorded_at: last.recorded_at, id: last.id } : null }
    },
    getNextPageParam: (p) => p.next,
  })
}

/** who the patient is and where they have been, for a reader without read:record (the desk, a bench): identity, visits and stays,
 *  deceased — each table only where the reader holds its action in this department */
export interface Glance { patient: Identity; tables: { 'base.presence'?: TableRead<PresenceRow>; 'base.deceased'?: TableRead<DeceasedRow> } }
export function useGlance(patientId: string | null) {
  const { dept, org } = useDepartment()
  return useQuery({
    queryKey: ['record', patientId, 'glance', dept?.id], enabled: !!patientId && !!dept && !!org,
    queryFn: () => read<Glance>({ shape: 'patient', patient_id: patientId, department_id: dept!.id, include: ['base.presence', 'base.deceased'] }),
  })
}
