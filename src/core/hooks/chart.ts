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
export interface EntryPage { entries: ServerEntry[]; more: boolean; hidden: ServerRecord['hidden']; next: Before | null }
const page = (departmentId: string, q: EntryPageQuery) => read<ServerRecord>({ shape: 'record', patient_id: q.patient_id, department_id: departmentId, include: [],
  visits: q.visits ?? undefined, types: q.types ?? undefined, departments: q.departments ?? undefined, before: q.before ?? undefined, limit: q.limit ?? 100, ...purposeFor(q.patient_id) })

/** raw entries, a page at a time (the chart folds them into items itself): a visit's or a stay's, or the Whole record's by kind, newest
 *  first; "Earlier" fetches the next page. first: what the record's own page already holds, drawn while the read is under way */
export function useEntryPages(q: Omit<EntryPageQuery, 'before'> | null, first?: ServerEntry[]) {
  const { dept, org } = useDepartment()
  return useInfiniteQuery({
    queryKey: ['record', q?.patient_id, 'pages', q, dept?.id], enabled: !!q && !!dept && !!org,
    initialPageParam: null as Before | null,
    queryFn: async ({ pageParam }): Promise<EntryPage> => {
      const r = await page(dept!.id, { ...q!, before: pageParam }); const last = r.entries[r.entries.length - 1]
      return { entries: r.entries, hidden: r.hidden, more: r.more, next: r.more && last ? { recorded_at: last.recorded_at, id: last.id } : null }
    },
    getNextPageParam: (p) => p.next,
    placeholderData: first ? { pages: [{ entries: first, hidden: [], more: false, next: null }], pageParams: [null] } : undefined,
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

/** the pack sections' types with the cross-outs, in their own read, so a pack's volume never pushes the facts (the banner's alerts)
 *  off their page; the chart knows from it which packs' data the patient has (hidden ones come back as placeholders) */
export function usePackEntries(patientId: string | null, types: string[]) {
  const { dept, org } = useDepartment()
  return useQuery({
    queryKey: ['record', patientId, 'packs', dept?.id, types], enabled: !!patientId && !!dept && !!org && types.length > 0,
    queryFn: async () => (await page(dept!.id, { patient_id: patientId!, types: [...types, 'crossed_out'], limit: 500 })).entries,
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

/** one item as the item shape returns it: every version, and every entry that refers to one (steps, answers, reviews, privacy marks);
 *  a block's Details reads it once, when opened */
export function useItem(entryId: string | null, patientId: string | null) {
  const { dept, org } = useDepartment()
  return useQuery({
    queryKey: ['record', patientId, 'item', entryId, dept?.id], enabled: !!entryId && !!dept && !!org,
    queryFn: async () => (await read<{ entries: ServerEntry[] }>({ shape: 'item', item: entryId, department_id: dept!.id, ...(patientId ? purposeFor(patientId) : {}) })).entries,
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
