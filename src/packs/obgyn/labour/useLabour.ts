// The Labour tab's reads (spec/openCare.md §5.6): the pack's own op obgyn.board for this ward (who is in labour: each admitted stay's
// exams, the baby's latest heart rate, the pregnancy standing), the ward's stays and their patients, and the chosen stay's labour
// examinations, babies' hearts and mother's signs — each through the core's doors, for treatment (or the patient's break-the-glass
// purpose), so the server logs every read. Every key starts with 'record', so a write's refresh reads them again; the clinic's hints
// and her record's (useLive, as the tile's read and the chart do) read them again while the tab stays open. For the birth card (L2c):
// her standing pregnancy (the chart's facts, so the birth's Done can end it) and the ward's free cots.
import { useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { packOp, read } from '@core/db/rpc'
import type { Department, ServerRecord } from '@core/db/types'
import { useLive } from '@core/hooks/live'
import { useFacts } from '@core/hooks/chart'
import { useDepartment } from '@core/hooks/organization'
import { purposeFor, useStays } from '@core/hooks/reads'
import { pregnancyOf } from '@core/screens/chart/model/facts'
import { ownOf } from '@core/screens/chart/sections'
import { ymd } from '@core/ui/time'
import { freeCots } from './birth'
import { EXAM } from './codes'
import type { LabourBoard } from './board'
import { labourStays } from './grid'

const KINDS = [EXAM, 'observation', 'vitals']

/** the ward's women in labour and the chosen one's entries: the stay asked for when she is in labour here, else the first */
export function useLabour(dept: Department, stayItem: string | null) {
  const { org, can } = useDepartment()
  const may = can('read:record')
  const BOARD = ['record', 'obgyn.board', dept.id]
  // the clinic's hints (and the window's focus) read the board again; a stay admitted, moved or ended changes its key
  useLive(org && may ? `organization:${org.organization.id}` : null, [BOARD])
  const stays = useStays(dept.id)
  const key = (stays.data?.rows ?? []).map((r) => `${r.item}@${r.version}`).sort().join(',')
  const board = useQuery({ queryKey: [...BOARD, key], enabled: !!org && may && !!stays.data,
    queryFn: () => packOp<LabourBoard>('obgyn.board', dept.id, {}, 'TREAT'), placeholderData: keepPreviousData })
  const list = useMemo(() => labourStays(board.data, stays.data?.rows ?? [], org?.places ?? []), [board.data, stays.data, org?.places])
  const selected = list.find((r) => r.item === stayItem) ?? list[0] ?? null
  const patientId = selected?.patient_id ?? null; const item = selected?.item ?? null
  // a write on her record (an exam, the baby's heart, her signs) reads the grid, the partograph and the women again
  useLive(patientId ? `record:${patientId}` : null, [['record', patientId], BOARD])
  const record = useQuery({ queryKey: ['record', patientId, 'labour', item], enabled: !!org && may && !!patientId && !!item,
    queryFn: () => read<ServerRecord>({ shape: 'record', patient_id: patientId, department_id: dept.id, visits: [item], types: [...KINDS, 'crossed_out'],
      include: [], limit: 300, ...purposeFor(patientId!) }) })
  const entries = useMemo(() => ownOf(record.data?.entries, KINDS, org?.types).shown, [record.data, org?.types])
  const facts = useFacts(may ? patientId : null)
  const pregnancy = useMemo(() => org ? pregnancyOf(facts.data, org.types, ymd(new Date().toISOString())) : null, [facts.data, org])
  const cots = useMemo(() => freeCots(org?.places ?? [], stays.data?.rows ?? [], dept.id), [org?.places, stays.data, dept.id])
  return { board: board.data, stays: stays.data, list, selected, entries, pregnancy, factsReady: facts.isSuccess, factsError: facts.error, cots, isLoading: board.isLoading || stays.isLoading,
    entriesLoading: record.isLoading && !!item, error: board.error ?? stays.error, entriesError: record.error }
}
