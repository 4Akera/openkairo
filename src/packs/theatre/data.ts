// The theatre list's reads (spec/openCare.md §5.8): the operations sent to the Theatre (the base's orders), theatre's words on them,
// where each stands with its room and time, the checklist's parts, and what refers to each operation (the pre-op's ASA and verdict, the
// anaesthetic record's times, the consent scanned): read by shape from the record, never by another pack's name.
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { read } from '@core/db/rpc'
import type { ServerEntry, TableRead } from '@core/db/types'

export interface CaseRow { item: string; patient_id: string; from_department_id: string | null; service_code: string | null; name: string | null; side: string | null; technique: string | null
  stay: string | null; surgeon: string | null; usual_min: number | null; risks: number; priority: string; status: string; ordered_at: string }
export interface SlotRow { item: string; op: string; patient_id: string; step: string | null; status: string | null; room: string | null; starts: string | null; position: number | null; at: string }
export interface CheckRow { item: string; op: string; patient_id: string; part: 'sign_in' | 'time_out' | 'sign_out'; at: string; missed: number }

export function useTable<R extends { item: string }>(table: string, deptId: string, where: Record<string, unknown>, enabled = true) {
  return useQuery({ queryKey: [table, deptId, JSON.stringify(where)], enabled, staleTime: 10_000, refetchInterval: 20_000, placeholderData: keepPreviousData,
    queryFn: async () => (await read<TableRead<R>>({ shape: 'table', table, department_id: deptId, where, entries: false })).rows })
}
/** what refers to each operation, as the reader may see it (each item read once, its read logged) */
export function useAbout(deptId: string, ops: string[]) {
  const qs = useQueries({ queries: ops.map((op) => ({ queryKey: ['theatre.about', deptId, op], staleTime: 20_000, refetchInterval: 30_000,
    queryFn: async () => (await read<{ entries: ServerEntry[] | null }>({ shape: 'item', department_id: deptId, item: op })).entries ?? [] })) })
  return new Map(ops.map((op, i) => [op, qs[i]?.data ?? []]))
}
export interface About { asa: string | null; fit: string | null; times: Record<string, string> | null; anaesthetist: string | null; consent: boolean; checks: Map<string, ServerEntry> }
/** the facts the list shows from what refers to an operation: the pre-op's ASA and verdict, the record's times and who gave it, a
 *  consent scanned, the parts signed */
export function aboutOf(entries: ServerEntry[], op: string): About {
  const latest = (pred: (e: ServerEntry) => boolean) => entries.filter((e) => !e.hidden && e.item !== op && pred(e)).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]
  const pre = latest((e) => typeof e.data?.asa === 'string')
  const rec = latest((e) => !!e.data && typeof e.data.times === 'object' && e.data.times !== null)
  const consent = entries.some((e) => !e.hidden && e.type === 'note' && /consent/i.test(String(e.data?.kind ?? '') + String(e.data?.heading ?? '')))
  const checks = new Map<string, ServerEntry>()
  for (const e of entries.filter((x) => !x.hidden && typeof x.data?.part === 'string' && Array.isArray(x.data?.items)).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))) checks.set(String(e.data!.part), e)
  return { asa: pre ? String(pre.data!.asa) + (pre.data!.emergency ? ' E' : '') : null, fit: pre ? String(pre.data!.verdict ?? '') || null : null,
    times: rec ? rec.data!.times as Record<string, string> : null, anaesthetist: rec ? String(rec.data!.anaesthetist ?? '') || null : null, consent, checks }
}
