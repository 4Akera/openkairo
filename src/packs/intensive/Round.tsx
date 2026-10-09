// The morning round (intensive.round, spec/openCare.md §5.6, piece I2): a tab beside the board and the ICU chart (the picture draws it in
// the patient's chart, which needs a pack view in the chart's center: a core door, noted for the owner). Across the top the ICU's
// patients; on the left SOFA from the record's worst of 24 hours, on the right the daily goals and the lines; "Sign the round" (⌘/Ctrl+↵)
// writes the SOFA and the goals as one set. One round card, one Sign (Q8 as drawn, awaiting the owner).
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { newId, oneSet } from '@core/db/entries'
import { write } from '@core/db/rpc'
import type { Department, PresenceRow } from '@core/db/types'
import { useDepartment } from '@core/hooks/organization'
import { useStays } from '@core/hooks/reads'
import { refresh } from '@core/hooks/writes'
import type { ScreenProps } from '@core/screens/registry'
import { draft, scoreMissing, tableOf, type ScoreParams } from '@core/screens/visit/score'
import { Button, Callout, Card, Empty, Kbd, ScreenFrame, Spinner, errorText } from '@core/ui'
import { emptyGoals, goalsMissing, lastGoals, openLines, removalDecided, roundEntries, type GoalsDraft } from './goals'
import { GoalsCard } from './GoalsCard'
import { hourNow } from './hour'
import { plusHours } from './hours'
import { itemsOf, latestOf } from './items'
import { SofaCard } from './SofaCard'
import { SOFA, sofaFrom, sofaHistory, suggested } from './sofa'
import { StayPicker } from './StayPicker'
import { unitOf } from './unit'
import { inBedOrder, useChosenStay, useIcu, type IcuReads } from './useIcu'
import { useRound, type RoundReads } from './useRound'

/** the clock, a tick a minute */
function useMinute() {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => { const i = setInterval(() => setT(Date.now()), 60_000); return () => clearInterval(i) }, [])
  return new Date(t - (t % 60_000)).toISOString()
}

export function Round({ dept }: ScreenProps) {
  const { org } = useDepartment(); const navigate = useNavigate(); const stays = useStays(dept.id)
  const rows = useMemo(() => inBedOrder(stays.data?.rows ?? [], org), [stays.data, org])
  const [stay, choose] = useChosenStay(rows)
  const now = useMinute(); const icu = useIcu(dept, stay); const round = useRound(dept, stay, now)
  if (stays.isLoading) return <ScreenFrame><Spinner /></ScreenFrame>
  if (!rows.length) return <ScreenFrame><Card><Empty>No one is in the ICU.</Empty></Card></ScreenFrame>
  const filters = <StayPicker rows={rows} stays={stays.data} org={org} chosen={stay} onChoose={choose} />
  const error = icu.error ?? round.error
  return <ScreenFrame filters={filters} action={stay && <Button size="sm" variant="outline" onClick={() => navigate(`/visit/${stay.item}`)}>Open the chart</Button>}>
    {error ? <Callout tone="danger">{errorText(error)}</Callout> : !stay || icu.isLoading || round.isLoading ? <Spinner />
      : <RoundBody key={stay.item} dept={dept} stay={stay} icu={icu} round={round} now={now} />}
  </ScreenFrame>
}

function RoundBody({ dept, stay, icu, round, now }: { dept: Department; stay: PresenceRow; icu: IcuReads; round: RoundReads; now: string }) {
  const { org, can } = useDepartment(); const qc = useQueryClient()
  const unit = useMemo(() => unitOf(org, dept.id), [org, dept.id])
  const table = tableOf(org?.scores, SOFA, '1996')
  const where = { patientId: stay.patient_id, departmentId: dept.id, stay: stay.item }
  // what the record says, the worst of the last 24 hours
  const evidence = useMemo(() => {
    const items = itemsOf(icu.entries); const state = hourNow(icu.entries, icu.lists, now, unit, icu.kg)
    const o2 = items.map(latestOf).filter((e) => e.type === 'vitals' && e.visit_id === stay.item && e.data?.oxygen)
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0]?.data?.oxygen as { on?: string; flow?: { value?: string } } | undefined
    const fio2 = Number(state.vent?.data.fio2?.value)
    return sofaFrom({ values: round.values, infusions: items.filter((i) => i.type === 'intensive.infusion'), unit,
      gcs: itemsOf(round.scores).map(latestOf).filter((e) => e.type === 'score' && e.data?.score === 'gcs'), airway: !!state.airway,
      fio2: Number.isFinite(fio2) && fio2 > 0 ? fio2 : null, oxygen: o2?.on === 'air' ? 'Air' : o2?.on === 'oxygen' ? (o2.flow?.value ? `O₂ ${o2.flow.value} L/min` : 'O₂') : null,
      since: plusHours(now, -24), now })
  }, [icu.entries, icu.lists, icu.kg, round.values, round.scores, unit, now, stay.item])
  const ventilated = useMemo(() => !!hourNow(icu.entries, icu.lists, now, unit, icu.kg).airway, [icu.entries, icu.lists, icu.kg, now, unit])
  const history = useMemo(() => sofaHistory(round.scores, now, unit.dayStarts), [round.scores, now, unit.dayStarts])
  const lines = useMemo(() => openLines(icu.entries, now), [icu.entries, now])
  const decided = useMemo(() => removalDecided(lines, lastGoals(round.scores)), [lines, round.scores])
  const fresh = (): ScoreParams | null => table ? draft(table, suggested(evidence)).params as unknown as ScoreParams : null
  const [params, setParams] = useState<ScoreParams | null>(fresh)
  const [goals, setGoals] = useState<GoalsDraft>(emptyGoals)
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  if (!table || !params) return <Callout tone="warn">SOFA (1996) is not declared in this clinic.</Callout>
  const why = scoreMissing(params, table) ?? goalsMissing(goals)
  const may = can('write:score') && can('write:intensive.goals')
  const sign = async () => {
    if (why || busy || !may) return
    setBusy(true); setError(null)
    try { await write(oneSet(roundEntries(params, goals, where, newId))); refresh(qc); setParams(fresh()); setGoals(emptyGoals()) }
    catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void sign() } }
  return <div role="group" aria-label="The round" className="grid gap-3" onKeyDown={onKey}>
    <div className="grid gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <SofaCard dept={dept} params={params} set={(patch) => { setParams((p) => p && ({ ...p, ...patch })); setError(null) }} evidence={evidence} history={history} />
      <GoalsCard d={goals} set={(f) => { setGoals(f); setError(null) }} ventilated={ventilated}
        lines={can('write:procedure') ? { lines, decided, where, now } : null} />
    </div>
    {error && <Callout tone="danger">{error}</Callout>}
    {may && <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => void sign()} disabled={!!why || busy} loading={busy}>Sign the round<Kbd className="ms-1">⌘↵</Kbd></Button>
      {why && <span className="text-12 text-faint">{why}</span>}</div>}
  </div>
}
