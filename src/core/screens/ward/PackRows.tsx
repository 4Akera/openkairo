// A pack's rows under the board (rows.ts, core change C5): who, the pack's words, the minutes, then Start — the base's Admit here into a
// free place chosen inline — and at most two buttons of the pack's own. Drawn by the board for each pack the department uses.
import { useEffect, useState } from 'react'
import type { Department, Place } from '../../db/types'
import { Button, Card, ListRow, Select, Spinner, errorText } from '../../ui'
import { PackLine } from './Tile'
import { minutesSince, rowButtons, rowsNotIn, type BoardRow, type BoardRowsDef } from './rows'

export function PackRows({ def, dept, inHere, free, may, busy, can, onStart, onCount }: { def: BoardRowsDef; dept: Department; inHere: Set<string>; free: Place[]; may: boolean
  busy: boolean; can: (action: string) => boolean; onStart: (row: BoardRow, placeId: string, done: () => void) => void; onCount: (pack: string, n: number) => void }) {
  const read = def.useRows(dept)
  const rows = rowsNotIn(read.rows, inHere)
  useEffect(() => { onCount(def.pack, rows.length) }, [def.pack, rows.length, onCount])
  const [open, setOpen] = useState<string | null>(null); const [place, setPlace] = useState('')
  const [failed, setFailed] = useState<string | null>(null)
  const ctx = { dept, can }
  if (read.isLoading) return <Spinner />
  if (read.error) return <p className="text-13 text-danger">{def.title}: {errorText(read.error)}</p>
  if (!rows.length) return null
  return <section className="grid gap-2" aria-label={def.title}>
    <p className="text-12 font-medium text-faint">{def.title}</p>
    <Card className="p-0"><ul>{rows.map((r) => { const here = open === r.key; const chosen = free.some((p) => p.id === place) ? place : free[0]?.id ?? ''
      return <ListRow key={r.key} number={r.number ?? ''} name={r.name} age={r.sexAge ?? ''} status={<PackLine line={[{ pack: def.pack, words: (typeof r.words === 'string' ? [r.words] : r.words).map((w) => typeof w === 'string' ? { text: w } : w) }]} />}
        minutes={minutesSince(r.since)} hover={false}
        actions={<span className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" disabled={!may || !free.length} title={!may ? 'Not for your role' : !free.length ? 'No free place' : undefined} onClick={() => { setOpen(here ? null : r.key); setFailed(null) }}>Start</Button>
          {rowButtons(def, r, ctx).map((b) => <Button key={b.label} size="sm" variant="ghost" onClick={() => { setFailed(null); void Promise.resolve().then(() => b.onClick(r, ctx)).catch((e) => setFailed(`${b.label}: ${errorText(e)}`)) }}>{b.label}</Button>)}
        </span>}
        below={here || failed ? <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2 text-14">
          {here && <><span className="text-12 text-faint">Into</span>
            <Select aria-label="Which place" value={chosen} onChange={(e) => setPlace(e.target.value)} className="h-8 w-40">{free.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Button size="sm" disabled={!chosen || busy} onClick={() => onStart(r, chosen, () => setOpen(null))}>Start</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Cancel</Button></>}
          {failed && <span className="text-13 text-danger">{failed}</span>}
        </div> : undefined} /> })}</ul></Card>
  </section>
}
