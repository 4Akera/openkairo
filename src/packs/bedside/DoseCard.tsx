// A dose's card under its row on the Drug round (spec/openCare.md §5.6, piece 3). Give: the dose as prescribed (to change), the route
// as prescribed, the site for an injection, a note, the last dose given beside it, then Given ↵. A medicine with no dose written (the
// sliding-scale insulin) asks for the amount given: a record needs it, and that is the data, never a clinical stop. Not given: the six
// reasons, keys 1–6, one click writes it.
import { useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import type { Quantity } from '@core/db/shapes.generated'
import { userName } from '@core/db/views'
import { useDepartment } from '@core/hooks/organization'
import { Button, Chip, Field, Input, Kbd, NumberInput, hm } from '@core/ui'
import { REASONS, REASON_KEYS, shortName, type Reason } from './doses'
import { lastGiven, type RoundRow } from './round'

const ROUTES: Record<string, string> = { intravenous: 'iv', subcutaneous: 'sc', intramuscular: 'im' }
const SITES: Record<string, string[]> = { sc: ['Abdomen', 'Thigh', 'Arm'], im: ['Deltoid', 'Thigh', 'Buttock'], iv: ['Left arm', 'Right arm', 'Hand'] }
const routeOf = (r?: string) => { const x = (r ?? '').toLowerCase(); return ROUTES[x] ?? x }
// a typed unit as UCUM, only when it is one we know; else the dose keeps its words alone (never a made-up code)
const UCUM: Record<string, string> = { u: 'U', unit: 'U', units: 'U', iu: '[iU]', mg: 'mg', g: 'g', mcg: 'ug', ug: 'ug', ml: 'mL', l: 'L', mmol: 'mmol' }
const ucumOf = (u: string) => UCUM[u.toLowerCase()]

/** the last dose given, as on the row: amber with the clock while it is within half the interval (never colour alone) */
export function LastDose({ row, now }: { row: RoundRow; now: number }) {
  const { org } = useDepartment(); const l = lastGiven(row.med, now)
  if (!l) return null
  const who = l.by ? shortName(userName(org, l.by)) : ''
  return <span className={`inline-flex items-center gap-1 text-12 tnum ${l.near ? 'text-warn' : 'text-muted'}`}>
    {l.near && <Clock aria-hidden className="size-3.5" />}last given {hm(l.at)}{who ? ` · ${who}` : ''}</span>
}

export function DoseCard({ row, now, busy, mode, onGive, onNot, onClose }: { row: RoundRow; now: number; busy: boolean; mode: 'give' | 'not'
  onGive: (c: { dose?: Quantity; site?: string; note?: string }) => void; onNot: (r: Reason) => void; onClose: () => void }) {
  const m = row.med; const route = routeOf(m.route)
  const [value, setValue] = useState<number | null>(m.dose?.value ? Number(m.dose.value) : null)
  const [unit, setUnit] = useState(m.dose?.unit ?? '')
  const [site, setSite] = useState<string | null>(null); const [note, setNote] = useState(''); const [ask, setAsk] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const dose: Quantity | undefined = value != null && unit.trim() ? { ...(m.dose ?? {}), value: String(value), unit: unit.trim(), ...(m.dose?.unit === unit.trim() || !ucumOf(unit.trim()) ? {} : { ucum: ucumOf(unit.trim()) }) } : undefined
  const words = dose ? `${dose.value} ${dose.unit}` : 'the dose'
  const given = () => {
    if (!dose) { setAsk(true); box.current?.querySelector<HTMLInputElement>('input')?.focus(); return }
    onGive({ dose, ...(site ? { site: site.toLowerCase() } : {}), ...(note.trim() ? { note } : {}) })
  }
  const time = row.due ? hm(row.due) : null
  if (mode === 'not') return <div className="grid gap-2 border-t border-line bg-sunken px-4 py-3" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
    <div role="group" aria-label="Why not given" className="flex flex-wrap items-center gap-1.5">
      {REASON_KEYS.map((r, i) => <Chip key={r} disabled={busy} onClick={() => onNot(r)}>{REASONS[r]}<Kbd className="ms-1">{i + 1}</Kbd></Chip>)}
      <Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div>
    <p className="text-12 text-faint">Writes the base's given as not given, with the reason; the record and the sheet show it.</p>
  </div>
  return <form className="grid gap-3 border-t border-line bg-sunken px-4 py-3" onSubmit={(e) => { e.preventDefault(); given() }}
    onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
    <div className="flex flex-wrap items-end gap-3">
      <div ref={box}><Field label="Dose" error={ask && !dose ? 'The dose given: its amount and unit' : undefined}>
        <span className="flex items-center gap-1.5"><NumberInput label="Dose given" value={value} onValue={setValue} className="w-24" />
          {m.dose?.unit ? <span className="text-13 text-muted">{m.dose.unit}</span> : <Input aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit" className="w-20" />}</span>
      </Field></div>
      <Field label="Route"><span className="text-13 text-fg">{m.route ?? '—'}</span></Field>
      {SITES[route] && <Field label="Site"><span role="group" aria-label="Site" className="flex flex-wrap gap-1.5">
        {SITES[route].map((s) => <Chip key={s} on={site === s} onClick={() => setSite(site === s ? null : s)}>{s}</Chip>)}</span></Field>}
      <Field label="Note" className="min-w-48 flex-1"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note on this dose" /></Field>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" type="submit" loading={busy}>Given · {words}<Kbd className="ms-1">↵</Kbd></Button>
      <Button size="sm" variant="ghost" type="button" onClick={onClose}>Close</Button>
      <LastDose row={row} now={now} />
    </div>
    <p className="text-12 text-faint">Writes the base's given as Ward nursing's dose{time ? ` for the ${time} time` : ''}: the dose, route and site.</p>
  </form>
}
