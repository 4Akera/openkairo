// The hour card (spec/openCare.md §5.6): under the grid, the nurse types one column (the hour now, or one of the two before) and signs
// it once (⌘/Ctrl+↵): one set through the writer, each change a version of its item with the version it was typed against. A problem
// greys the sign; a value outside its usual range turns it into "Sign anyway" (one click, never a stop). A refusal shows above the
// button and the draft stays. Where the department's cardiac rows are on (piece I3), the card holds them after the vitals, and under the
// heparin's row the unit's table suggests the next rate from the latest aPTT ("Use 1 100" fills the dose; nothing is written until the
// nurse signs).
import { useMemo, useState, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { newId, oneSet } from '@core/db/entries'
import { write } from '@core/db/rpc'
import { refresh } from '@core/hooks/writes'
import { Button, Callout, Card, Chip, Kbd, errorText } from '@core/ui'
import { hourLabel, plusHours } from './hours'
import { adviceFits, heparinAdvice, heparinSince, isHeparin, grouped, type HeparinTable } from './heparin'
import { emptyDraft, entriesOf, isEmpty, noticesOf, problemsOf, rangeNotices, type HourDraft, type HourNow } from './hour'
import { HourCardiac } from './HourCardiac'
import { AirwayRow, FluidRow, InfusionRows, VitalsRow, type Say } from './HourParts'
import type { UnitSetting } from './unit'

export interface HourCardProps { hour: string; stateAt: (hour: string) => HourNow; unit: UnitSetting; where: { patientId: string; departmentId: string; stay: string }
  signedBy: (hour: string) => string[]
  /** where the cardiac rows are on: the unit's heparin table and the latest aPTT */
  heparin?: { table: HeparinTable; aptt: { value: number; at: string } | null } | null }

export function HourCard({ hour, stateAt, unit, where, signedBy, heparin }: HourCardProps) {
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
  // the heparin's latest version (whichever column is typed) and the table's advice: none once its rate changed after the aPTT (a rate
  // signed after it in its hour's column counts), and only in a column that holds or follows the aPTT, and not under a row stopped
  const latest = useMemo(() => unit.cardiac && heparin ? stateAt(hour).running.find((r) => isHeparin(r.row)) : undefined, [unit.cardiac, heparin, stateAt, hour])
  const hep = latest && now.running.some((r) => r.item === latest.item) && adviceFits(d.hour, heparin?.aptt ?? null) ? latest : undefined
  const advice = hep && heparin ? heparinAdvice(heparin.aptt, { dose: Number(hep.data.dose?.value), since: heparinSince(hep, heparin.aptt) }, heparin.table) : null
  const under = (item: string) => advice && hep?.item === item && !d.doses[item]?.stop && <p className={`flex flex-wrap items-center gap-1.5 text-12 ${advice.change !== 0 || advice.hold ? 'text-warn' : 'text-muted'}`}>
    {(advice.change !== 0 || !!advice.hold) && <TriangleAlert aria-hidden className="size-3.5 shrink-0" />}<span className="tnum">{advice.text}</span>
    {advice.change !== 0 && <Chip on={d.doses[item]?.dose === String(advice.dose)} onClick={() => set((x) => ({ ...x, doses: { ...x.doses, [item]: { ...x.doses[item], dose: String(advice.dose), rate: undefined } } }))}>Use {grouped(advice.dose)}</Chip>}</p>
  return <Card role="group" aria-label="The hour" className="grid gap-3 p-4" onKeyDown={onKey}>
    <div className="flex flex-wrap items-center gap-2"><span className="text-13 font-medium text-fg">The hour</span>
      {[0, -1, -2].map((n) => { const h = plusHours(hour, n)
        return <Chip key={h} shape="pill" on={d.hour === h} onClick={() => set((x) => ({ ...x, hour: h }))}>{hourLabel(h)}:00{n === 0 ? ' · now' : ''}</Chip> })}</div>
    <VitalsRow {...p} />{unit.cardiac && <HourCardiac {...p} />}<AirwayRow {...p} /><InfusionRows {...p} under={under} /><FluidRow {...p} />
    {notices.length > 0 && <ul aria-label="Notes" className="grid gap-0.5">{notices.map((n) =>
      <li key={n.text} className={`flex items-start gap-1 text-12 ${n.tone === 'warn' ? 'text-warn' : 'text-muted'}`}>
        {n.tone === 'warn' && <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />}<span>{n.text}</span></li>)}</ul>}
    {error && <Callout tone="danger">{error}</Callout>}
    <div className="flex items-center gap-2"><Button onClick={() => void sign()} disabled={blocked} loading={busy}>
      {ranges.length ? 'Sign anyway' : `Sign ${hourLabel(d.hour)}:00`}<Kbd className="ms-1">⌘↵</Kbd></Button>
      {problems.length > 0 && <span className="text-12 text-danger">{problems.length === 1 ? 'One thing' : `${problems.length} things`} to put right first</span>}</div>
  </Card>
}
