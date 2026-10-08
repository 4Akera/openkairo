// The day unit's rows under the board (spec/openCare.md §5.7, the picture #onc-unit; core change C5): today's cycles not in a chair yet
// — the regimen and cycle, a dose reduced, here since — each with the base's Admit here as its Start (into a free chair). A cycle
// whose patient already had a chair here today (in one now, or gone home) is not listed again; a delayed cycle waits for its day. The
// cycles read here are kept for the chairs' tile line too.
import { useQuery } from '@tanstack/react-query'
import { useDepartment } from '@core/hooks/organization'
import { read } from '@core/db/rpc'
import { banner } from '@core/db/views'
import type { Department, PresenceRow, TableRead } from '@core/db/types'
import type { BoardRow, BoardRows } from '@core/screens/ward/rows'
import { regimensOf } from './model'
import { clinicDay, keepCycles, keepRegimens, notInAChair, type CycleRow } from './unit'

function useCycleRows(dept: Department): { rows: BoardRow[]; isLoading?: boolean; error?: unknown } {
  const { org } = useDepartment()
  const day = clinicDay(org?.organization.time_zone || undefined)
  const q = useQuery({ queryKey: ['oncology.cycles', 'rows', dept.id, day], staleTime: 15_000, refetchInterval: 30_000,
    queryFn: async () => {
      const cycles = await read<TableRead<CycleRow>>({ shape: 'table', table: 'oncology.cycles', department_id: dept.id, where: { to_department_id: dept.id, due: day } })
      keepCycles(dept.id, cycles.rows); if (org) keepRegimens(regimensOf(org))   // the chairs' tile line reads the same
      const stays = await read<TableRead<PresenceRow>>({ shape: 'table', table: 'base.presence', department_id: dept.id, where: { department_id: dept.id, kind: 'stay', day }, entries: false })
      return { cycles, stays: stays.rows }
    } })
  if (!q.data) return { rows: [], isLoading: q.isLoading, error: q.error }
  const regs = regimensOf(org).regimens
  const rows = notInAChair(q.data.cycles.rows, q.data.stays).map((c): BoardRow => {
    const who = q.data!.cycles.patients[c.patient_id]; const p = who ? banner(who) : null
    const weekly = regs.find((r) => r.key === c.regimen)?.every_days === 7
    const name = `${(c.name ?? c.regimen).replace(/ weekly$/i, '')} ${weekly ? 'W' : 'C'}${c.cycle}${weekly ? '' : ` D${c.day}`}`
    return { key: c.item, patientId: c.patient_id, number: p?.record_number ?? null, name: p ? `${p.given_name} ${p.family_name}` : 'Patient', sexAge: p ? `${p.age} ${p.sex[0]?.toUpperCase() ?? ''}` : '',
      words: [name, ...(c.percent != null && c.percent < 100 ? [{ text: `${c.percent} % dose`, tone: 'info' as const }] : [])], since: c.ordered_at, reason: name }
  })
  return { rows }
}
export const cycleRows: BoardRows = { title: "Today's cycles not in a chair yet · from the cycles signed for today", view: 'Not in a chair yet', useRows: useCycleRows }
