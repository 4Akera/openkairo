// The round's own reads (spec/openCare.md §5.6, piece I2), each through the one door out and logged by the server: the patient's values
// of the last day and an hour (platelets, bilirubin, creatinine, MAP, the vitals' BP, the hourly urine) in one table read, and the
// stay's scores and goals with what was crossed out. The infusions, procedures and the ventilator come from the ICU chart's reads
// (useIcu). Every key starts with 'record', so a sign anywhere reads them again.
import { useQuery } from '@tanstack/react-query'
import { read } from '@core/db/rpc'
import type { Department, PresenceRow, ServerEntry, ServerRecord, TableRead, ValueRow } from '@core/db/types'
import { purposeFor } from '@core/hooks/reads'
import { hourOf, plusHours } from './hours'

export interface RoundReads { values: ValueRow[]; scores: ServerEntry[]; isLoading: boolean; error: unknown }

export function useRound(dept: Department, stay: PresenceRow | undefined, now: string): RoundReads {
  const pid = stay?.patient_id ?? null; const sid = stay?.item ?? null; const on = !!pid && !!sid
  // from the whole hour 25 hours back, so the key changes once an hour; the window itself is cut in sofaFrom
  const from = plusHours(hourOf(now), -25)
  const values = useQuery({
    queryKey: ['record', pid, dept.id, 'intensive', sid, 'round-values', from], enabled: on,
    // the hour's new key keeps this stay's rows while it reads, so the round being written is never swapped for a spinner (never another
    // stay's rows: the key names the stay)
    placeholderData: (prev, q) => q?.queryKey[4] === sid ? prev : undefined,
    queryFn: () => read<TableRead<ValueRow>>({ shape: 'table', table: 'base.values', department_id: dept.id, where: { patient_id: pid, at: { op: '>=', value: from } },
      entries: false }),
  })
  const scores = useQuery({
    queryKey: ['record', pid, dept.id, 'intensive', sid, 'round-scores'], enabled: on,
    queryFn: () => read<ServerRecord>({ shape: 'record', patient_id: pid, department_id: dept.id, visits: [sid], types: ['score', 'intensive.goals', 'crossed_out'],
      include: [], limit: 200, ...purposeFor(pid!) }),
  })
  return { values: values.data?.rows ?? [], scores: scores.data?.entries ?? [], isLoading: values.isLoading || scores.isLoading, error: values.error ?? scores.error }
}
