// The ICU chart (intensive.chart, spec/openCare.md §5.6): a tab beside the board, since a pack's view in the chart's center would be a
// new core door (noted for the owner). Across the top the ICU's patients; under them one line about the one chosen and "Open the chart";
// "Since 08:00" (the ICU day, the unit's setting) or "Last 24 h"; the grid, hours across; and the hour card, for whoever writes vitals.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { banner } from '@core/db/views'
import { useDepartment } from '@core/hooks/organization'
import { useStays } from '@core/hooks/reads'
import type { ScreenProps } from '@core/screens/registry'
import { ageSex } from '@core/screens/bench/shared'
import { startOf, stayDay } from '@core/screens/chart/model/encounter'
import { Button, Callout, Card, Chip, Empty, ScreenFrame, Spinner, errorText } from '@core/ui'
import { chartOf } from './chart'
import { Grid } from './Grid'
import { HourCard } from './HourCard'
import { hourNow } from './hour'
import { dayStart, hourOf, plusHours } from './hours'
import { StayPicker } from './StayPicker'
import { unitOf } from './unit'
import { bedName, inBedOrder, useChosenStay, useIcu } from './useIcu'

const pad = (n: number) => String(n).padStart(2, '0')
/** the clock, a tick a minute: the hour now moves on by itself */
function useMinute() {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => { const i = setInterval(() => setT(Date.now()), 60_000); return () => clearInterval(i) }, [])
  return new Date(t - (t % 60_000)).toISOString()
}

export function IcuChart({ dept }: ScreenProps) {
  const { org, can } = useDepartment(); const navigate = useNavigate(); const stays = useStays(dept.id)
  const rows = useMemo(() => inBedOrder(stays.data?.rows ?? [], org), [stays.data, org])
  const [stay, choose] = useChosenStay(rows)
  const icu = useIcu(dept, stay); const unit = useMemo(() => unitOf(org, dept.id), [org, dept.id]); const now = useMinute()
  const [range, setRange] = useState<'day' | '24h'>('day')
  const from = range === 'day' ? dayStart(now, unit.dayStarts) : plusHours(hourOf(now), -23)
  const users = useMemo(() => (org?.users ?? []).map((u) => ({ id: u.id, name: u.name })), [org])
  const model = useMemo(() => chartOf({ entries: icu.entries, from, now, dayStarts: unit.dayStarts, kg: icu.kg, users }), [icu.entries, from, now, unit.dayStarts, icu.kg, users])
  // what is in force through the end of the hour charted, so what was written at that hour counts
  const stateAt = useCallback((hour: string) => hourNow(icu.entries, icu.lists, plusHours(hour, 1), unit, icu.kg), [icu.entries, icu.lists, unit, icu.kg])
  const signedBy = (hour: string) => { const i = model.hours.indexOf(hour); const c = i < 0 ? null : model.groups.find((g) => g.key === 'signed')?.rows[0]?.cells[i]
    return c ? c.text.split(', ') : [] }
  if (stays.isLoading) return <ScreenFrame><Spinner /></ScreenFrame>
  if (!rows.length) return <ScreenFrame><Card><Empty>No one is in the ICU.</Empty></Card></ScreenFrame>
  const who = stay ? stays.data?.patients[stay.patient_id] : undefined; const b = who ? banner(who) : null
  const filters = <>
    <StayPicker rows={rows} stays={stays.data} org={org} chosen={stay} onChoose={choose} />
    <span className="flex gap-1.5"><Chip shape="pill" on={range === 'day'} onClick={() => setRange('day')}>Since {pad(unit.dayStarts)}:00</Chip>
      <Chip shape="pill" on={range === '24h'} onClick={() => setRange('24h')}>Last 24 h</Chip></span></>
  return <ScreenFrame filters={filters} action={stay && <Button size="sm" variant="outline" onClick={() => navigate(`/visit/${stay.item}`)}>Open the chart</Button>}>
    {stay && b && <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-13 text-muted">
      <span className="text-16 font-semibold text-fg">{[b.given_name, b.middle_name, b.family_name].filter(Boolean).join(' ')}</span>
      <span className="tnum">{ageSex(b)}</span><span className="tnum">#{b.record_number}</span>{icu.kg && <span className="tnum">{icu.kg} kg</span>}
      <span className="text-accent">{bedName(stay, org)}</span><span>day {stayDay(startOf(stay, stays.data))}</span></p>}
    {icu.error ? <Callout tone="danger">{errorText(icu.error)}</Callout> : icu.isLoading ? <Spinner /> : <>
      <Grid model={model} />
      <p className="text-12 text-faint">Faint: a setting carried on from the hour before, not typed again. In and out: the hour up to each column.</p>
      {stay && can('write:vitals') && <HourCard key={stay.item} hour={hourOf(now)} stateAt={stateAt} unit={unit} where={{ patientId: stay.patient_id, departmentId: dept.id, stay: stay.item }} signedBy={signedBy} />}
    </>}
  </ScreenFrame>
}
