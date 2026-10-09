// The ICU chart's reads (spec/openCare.md §5.6), each through the one door out and logged by the server, for the stay chosen: the
// ventilator's settings and the infusions in this stay, with the record's lists (the prescriptions a start links to); the stay's
// vitals, observations and scores (the GCS); the patient's ventilation, wherever it began, and what was crossed out; the latest weight.
// Where the cardiac rows are on (piece I3), the stay's reperfusion record, and the patient's values since the chart's first hour (or the
// last 24 h, if earlier), for the Bloods and the heparin's aPTT. Every key starts with
// 'record', so a sign anywhere reads them again. The stays in bed order, and the one the link (?stay=) chose.
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { read } from '@core/db/rpc'
import type { Department, ListRowData, Organization, PresenceRow, ServerEntry, ServerRecord, TableRead, ValueRow } from '@core/db/types'
import { purposeFor } from '@core/hooks/reads'

export interface IcuReads { entries: ServerEntry[]; lists: TableRead<ListRowData> | undefined; kg: number | null; values: ValueRow[]; isLoading: boolean; error: unknown }

const NONE: ValueRow[] = []
/** cardiac: the chart's first hour, when the department's cardiac rows are on */
export function useIcu(dept: Department, stay: PresenceRow | undefined, cardiac: { from: string } | null = null): IcuReads {
  const pid = stay?.patient_id ?? null; const sid = stay?.item ?? null; const on = !!pid && !!sid
  const record = (part: string, more: Record<string, unknown>) => ({
    queryKey: ['record', pid, dept.id, 'intensive', sid, part], enabled: on,
    queryFn: () => read<ServerRecord>({ shape: 'record', patient_id: pid, department_id: dept.id, ...more, ...purposeFor(pid!) }),
  })
  const settings = useQuery(record('settings', { visits: [sid], types: ['intensive.vent', 'intensive.infusion', 'intensive.reperfusion'], include: ['base.lists'], limit: 500 }))
  // about three days of hourly charting; score brings the GCS (and other scores, which the chart leaves out)
  const measures = useQuery(record('measures', { visits: [sid], types: ['vitals', 'observation', 'score'], include: [], limit: 500 }))
  const facts = useQuery(record('facts', { types: ['procedure', 'crossed_out'], include: [], limit: 300 }))
  const weight = useQuery({
    queryKey: ['record', pid, dept.id, 'intensive', sid, 'weight'], enabled: on,
    queryFn: () => read<TableRead<ValueRow>>({ shape: 'table', table: 'base.values', department_id: dept.id, where: { patient_id: pid, key: 'weight' }, entries: false }),
  })
  const values = useQuery({
    queryKey: ['record', pid, dept.id, 'intensive', sid, 'values', cardiac?.from], enabled: on && !!cardiac,
    queryFn: () => read<TableRead<ValueRow>>({ shape: 'table', table: 'base.values', department_id: dept.id, where: { patient_id: pid, at: { op: '>=', value: cardiac!.from } }, entries: false }),
  })
  const entries = useMemo(() => { const seen = new Set<string>(); const out: ServerEntry[] = []
    for (const r of [settings.data, measures.data, facts.data]) for (const e of r?.entries ?? []) if (!seen.has(e.id)) { seen.add(e.id); out.push(e) }
    return out }, [settings.data, measures.data, facts.data])
  const latest = [...(weight.data?.rows ?? [])].sort((a, b) => b.at.localeCompare(a.at))[0]
  return { entries, lists: settings.data?.tables['base.lists'], kg: latest && latest.value > 0 ? Number(latest.value) : null, values: values.data?.rows ?? NONE,
    isLoading: settings.isLoading || measures.isLoading || facts.isLoading, error: settings.error ?? measures.error ?? facts.error ?? weight.error ?? values.error }
}

/** the stays in bed order, then those with no bed */
export function inBedOrder(rows: readonly PresenceRow[], org: Organization | undefined): PresenceRow[] {
  const pos = new Map((org?.places ?? []).map((p) => [p.id, p.position]))
  const at = (r: PresenceRow) => r.place_id && pos.has(r.place_id) ? pos.get(r.place_id)! : Number.MAX_SAFE_INTEGER
  return [...rows].sort((a, b) => at(a) - at(b) || a.checked_in_at.localeCompare(b.checked_in_at))
}
export const bedName = (r: PresenceRow, org: Organization | undefined) => org?.places.find((p) => p.id === r.place_id)?.name ?? 'No bed'
/** the chosen stay: the link's, else the first */
export function useChosenStay(rows: PresenceRow[]): [PresenceRow | undefined, (item: string) => void] {
  const [params, setParams] = useSearchParams()
  const chosen = rows.find((r) => r.item === params.get('stay')) ?? rows[0]
  const choose = (item: string) => setParams((p) => { const n = new URLSearchParams(p); n.set('stay', item); return n }, { replace: true })
  return [chosen, choose]
}
