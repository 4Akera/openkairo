// The machine readings (spec/openCare.md §5.6, D2b): a grid by time — the patient's BP and pulse, the machine's blood flow, arterial,
// venous and transmembrane pressures, the fluid taken off and the heparin rate; a BP under 90 systolic in red (↓), under 100 in amber —
// then, while the session is on, the reading card: one row of fields in the grid's order with the last reading's numbers as their
// placeholders (a blank machine field keeps the last value), ⌘↵ signs. Every 30 minutes is the rhythm, not a rule: the card is always
// there. A low BP, a fall since the start, a high venous or a low arterial pressure is a notice; the nurse decides.
import { Fragment, useState } from 'react'
import { useDepartment } from '@core/hooks/organization'
import type { Department, PresenceRow, ServerEntry } from '@core/db/types'
import { Button, Card, Input, Kbd, cn } from '@core/ui'
import { CAPS, CardHead, Notices, SignState } from './parts'
import { MISSING_WORDS, READING_ROWS, gridOf, inputProblems, placeholders, readingData, readingEntry, readingMissing, readingNotices, type Inputs, type Reading } from './reading'
import { onSign } from './session'
import { useSign } from './useSession'

export function Readings({ dept, stay, readings, first, on }: { dept: Pick<Department, 'id'>; stay: PresenceRow; readings: ServerEntry[]; first: { sys: number } | null; on: boolean }) {
  const { can } = useDepartment()
  const grid = gridOf(readings)
  const th = 'sticky start-0 z-raised bg-surface px-2 py-1 text-start text-12 font-normal text-muted'
  return <div className="grid content-start gap-3">
    <Card className="grid gap-2 p-3">
      <CardHead>Readings · every 30 minutes</CardHead>
      {!grid.columns.length ? <p className="text-13 text-faint">No reading yet.</p>
        : <div className="overflow-x-auto"><table className="border-collapse text-13">
          <thead><tr><th scope="col" className={th}><span className="sr-only">Reading</span></th>
            {grid.columns.map((c) => <th key={c.id} scope="col" className="px-2 py-1 text-end font-mono text-12 font-normal text-faint">{c.hm}</th>)}</tr></thead>
          <tbody>{grid.rows.map(({ row, cells }, i) => <Fragment key={row.key}>
            {(i === 0 || grid.rows[i - 1].row.group !== row.group) && <tr className="bg-sunken"><th scope="rowgroup" colSpan={grid.columns.length + 1}
              className={cn(CAPS, 'sticky start-0 px-2 py-0.5 text-start')}>{row.group}</th></tr>}
            <tr className="border-t border-line"><th scope="row" className={th}>{row.label} <span className="text-faint">{row.unit}</span></th>
              {cells.map((c, j) => <td key={grid.columns[j].id} className={cn('px-2 py-1 text-end tnum', c.flag === 'low' ? 'font-semibold text-danger' : c.flag === 'warn' ? 'text-warn' : 'text-fg')}>
                {c.text}{c.flag && <span aria-hidden> ↓</span>}{c.flag && <span className="sr-only">{c.flag === 'low' ? ' low' : ' under 100'}</span>}</td>)}</tr>
          </Fragment>)}</tbody></table></div>}
    </Card>
    {on && can('write:haemodialysis.reading') && <ReadingCard dept={dept} stay={stay} last={(readings[readings.length - 1]?.data ?? null) as Partial<Reading> | null} first={first} />}
  </div>
}

function ReadingCard({ dept, stay, last, first }: { dept: Pick<Department, 'id'>; stay: PresenceRow; last: Partial<Reading> | null; first: { sys: number } | null }) {
  const [x, setX] = useState<Inputs>({})
  const s = useSign()
  const ph = placeholders(last)
  const data = readingData(x, last)
  const problems = inputProblems(x)
  const typedAny = Object.values(x).some((v) => v?.trim())
  const ready = !!data && !problems.length && !s.busy
  const sign = () => { if (ready && data) void s.sign([readingEntry(data, stay, dept.id)], () => setX({})) }
  return <Card className="grid gap-2 p-3" onKeyDown={onSign(sign)}>
    <CardHead>A reading now</CardHead>
    <div className="flex flex-wrap items-end gap-1.5">{READING_ROWS.map((r) => <label key={r.key} className="grid gap-0.5">
      <span className="text-12 text-muted">{r.label} <span className="text-faint">{r.unit}</span></span>
      <Input dense value={x[r.key] ?? ''} placeholder={r.group === 'Machine' ? ph[r.key] : r.key === 'bp' ? '128/76' : ''} aria-label={`${r.label}, ${r.unit}`}
        inputMode={r.key === 'bp' || r.key === 'arterial' ? 'text' : 'decimal'} onChange={(e) => setX((y) => ({ ...y, [r.key]: e.target.value }))} className={cn('text-end tnum', r.key === 'bp' ? 'w-20' : 'w-16')} /></label>)}</div>
    <p className="text-12 text-faint">A blank machine field keeps the last reading's number. Taken off in litres; the arterial pressure negative, as the machine shows it.</p>
    {problems.length > 0 && <p className="text-12 text-danger">{problems.join(' · ')}</p>}
    {typedAny && !data && !problems.length && <p className="text-12 text-faint">{MISSING_WORDS[readingMissing(x, last) ?? 'vitals']}</p>}
    <Notices items={readingNotices(data, first, last)} />
    <SignState err={s.err} warn={s.warn} />
    <div><Button size="sm" onClick={sign} disabled={!ready} loading={s.busy}>Sign the reading<Kbd className="ms-1 max-sm:hidden">⌘↵</Kbd></Button></div>
  </Card>
}
