// What every part of the chart reads (chart-plan.md §1.2): the one record read and the facts, whose chart it is and where it is read,
// the encounter and the mode, who may do what, what the center shows (kept in the URL: ?at= ?kind= ?tab=), and the actions. One
// object instead of prop chains; ChartScreen provides it.
import { createContext, useContext } from 'react'
import type { RecordView, ServerEntry, VisitRow } from '../../db/types'
import type { At } from './model/at'
import type { Kind } from './model/items'
import type { Role } from './model/visit'
import type { ChartActions } from './useChartActions'

export type KindOrAll = Kind | 'all'
export interface Chart {
  r: RecordView                               // the one record read (r.server: every derived table with its source entries)
  facts: ServerEntry[] | undefined            // alerts, procedures, observations and their cross-outs (useFacts)
  patientId: string; departmentId: string     // the department the reads are made in (the chart's, never the entry's)
  encounter: VisitRow | null                  // this visit or stay (from the URL, else the open one here)
  mode: 'visit' | 'stay' | 'record'           // record: no encounter (a search, a link)
  role: Role; me: string
  can: (action: string) => boolean; writer: boolean   // writer: may write a note, vitals or an order here (the composer shows)
  at: At; open: (at: At) => void               // what the center shows
  kind: KindOrAll; setKind: (k: KindOrAll) => void; showKinds: (ks: KindOrAll[]) => void   // the kind filter's chips, for [ and ]
  tab: 'main' | 'aside'; setTab: (t: 'main' | 'aside') => void   // under 640 px (a phone): Encounter · Record
  actions: ChartActions
}
export const ChartContext = createContext<Chart | null>(null)
export function useChart(): Chart {
  const c = useContext(ChartContext)
  if (!c) throw new Error('useChart outside the chart')
  return c
}
