// The hour card (spec/openCare.md §5.6): under the grid, the nurse types one column (the hour now, or one of the two before) and signs
// it once (⌘/Ctrl+↵): one set through the writer, each change a version of its item with the version it was typed against. A problem
// greys the sign; a value outside its usual range turns it into "Sign anyway" (one click, never a stop). A refusal shows above the
// button and the draft stays.
import { useMemo, useState, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { newId, oneSet } from '@core/db/entries'
import { write } from '@core/db/rpc'
import { refresh } from '@core/hooks/writes'
import { Button, Callout, Card, Chip, Kbd, errorText } from '@core/ui'
import { hourLabel, plusHours } from './hours'
import { emptyDraft, entriesOf, isEmpty, noticesOf, problemsOf, rangeNotices, type HourDraft, type HourNow } from './hour'
import { AirwayRow, FluidRow, InfusionRows, VitalsRow, type Say } from './HourParts'
import type { UnitSetting } from './unit'

export interface HourCardProps { hour: string; stateAt: (hour: string) => HourNow; unit: UnitSetting; where: { patientId: string; departmentId: string; stay: string }
  signedBy: (hour: string) => string[] }

export function HourCard({ hour, stateAt, unit, where, signedBy }: HourCardProps) {
  const qc = useQueryClient()
  const [d, setD] = useState<HourDraft>(() => emptyDraft(hour)); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  // one draft a patient (the screen keys the card by the stay); when the hour turns, a draft keeps the hour it was typed for
  const set = (f: (x: HourDraft) => HourDraft) => { setD(f); setError(null) }
  // what was in force at the hour charted: a change refers to it, and one older than the item's latest version is refused
  const now = useMemo(() => stateAt(d.hour), [stateAt, d.hour])
  const problems = useMemo(() => problemsOf(d, now, unit), [d, now, unit]); const ranges = useMemo(() => rangeNotices(d), [d])
  const notices = noticesOf(d, now, unit, signedBy(d.hour))
  const say: Say = {}
  for (const p of problems) say[p.field] = { ...say[p.field], problem: say[p.field]?.problem ?? p.text }
  for (const r of ranges) say[r.field] = { ...say[r.field], notice: say[r.field]?.notice ?? r.text }
  const blocked = problems.length > 0 || isEmpty(d) || busy
  const sign = async () => {
    if (blocked) return
    setBusy(true); setError(null)
    try {
      const { entries, seen } = entriesOf(d, now, unit, where, newId)
      if (!entries.length) { setError('Nothing to write: type a value, or change a dose'); return }
      await write(oneSet(entries, { seen })); refresh(qc); setD(emptyDraft(hour))
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void sign() } }
  const p = { d, set, now, unit, say }
  return <Card role="group" aria-label="The hour" className="grid gap-3 p-4" onKeyDown={onKey}>
    <div className="flex flex-wrap items-center gap-2"><span className="text-13 font-medium text-fg">The hour</span>
      {[0, -1, -2].map((n) => { const h = plusHours(hour, n)
        return <Chip key={h} shape="pill" on={d.hour === h} onClick={() => set((x) => ({ ...x, hour: h }))}>{hourLabel(h)}:00{n === 0 ? ' · now' : ''}</Chip> })}</div>
    <VitalsRow {...p} /><AirwayRow {...p} /><InfusionRows {...p} /><FluidRow {...p} />
    {notices.length > 0 && <ul aria-label="Notes" className="grid gap-0.5">{notices.map((n) =>
      <li key={n.text} className={`flex items-start gap-1 text-12 ${n.tone === 'warn' ? 'text-warn' : 'text-muted'}`}>
        {n.tone === 'warn' && <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />}<span>{n.text}</span></li>)}</ul>}
    {error && <Callout tone="danger">{error}</Callout>}
    <div className="flex items-center gap-2"><Button onClick={() => void sign()} disabled={blocked} loading={busy}>
      {ranges.length ? 'Sign anyway' : `Sign ${hourLabel(d.hour)}:00`}<Kbd className="ms-1">⌘↵</Kbd></Button>
      {problems.length > 0 && <span className="text-12 text-danger">{problems.length === 1 ? 'One thing' : `${problems.length} things`} to put right first</span>}</div>
  </Card>
}
