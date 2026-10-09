// The lines at the round (spec/openCare.md §5.6, piece I2): each one still in, with its site and its day, the round's keep or remove,
// and "Removed now" for whoever takes it out (a version that ends it, its own set, after an inline "Yes, removed"). A line the last
// round decided to remove and still in says so in amber. "+ Line" puts one in: the kind, its site, when (now, or HH:MM today).
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { newId, oneSet } from '@core/db/entries'
import { write } from '@core/db/rpc'
import { refresh } from '@core/hooks/writes'
import { Button, Callout, Chip, Input, errorText } from '@core/ui'
import { LINES, atClock, decidedWords, lineEntry, removedEntry, type LineCode, type OpenLine, type Where } from './goals'

export interface LinesProps { lines: OpenLine[]; decided: { item: string; at: string }[]; decisions: Record<string, 'keep' | 'remove'>
  onDecide: (item: string, d: 'keep' | 'remove' | null) => void; where: Where; now: string }

export function Lines({ lines, decided, decisions, onDecide, where, now }: LinesProps) {
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState<string | null>(null); const [adding, setAdding] = useState(false)
  const [code, setCode] = useState<LineCode | null>(null); const [site, setSite] = useState(''); const [time, setTime] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  const at = time.trim() ? atClock(time, now) : now
  const send = async (set: Parameters<typeof write>[0], after: () => void) => {
    setBusy(true); setError(null)
    try { await write(set); refresh(qc); after() } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  return <div role="group" aria-label="Lines" className="grid gap-2">
    <span className="text-12 font-medium text-fg">Lines</span>
    {lines.length === 0 && <p className="text-12 text-faint">No line in.</p>}
    {lines.map((l) => { const d = decisions[l.item]; const was = decided.find((x) => x.item === l.item)
      return <div key={l.item} className="grid gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-0 flex-1 text-13 text-fg">{[l.words, l.site, `day ${l.day}`].filter(Boolean).join(' · ')}</span>
          <Chip on={d === 'keep'} onClick={() => onDecide(l.item, d === 'keep' ? null : 'keep')}>keep</Chip>
          <Chip on={d === 'remove'} onClick={() => onDecide(l.item, d === 'remove' ? null : 'remove')}>remove</Chip>
          <Button size="sm" variant="outline" onClick={() => setConfirm(confirm === l.item ? null : l.item)}>Removed now</Button>
        </div>
        {was && <span className="flex items-center gap-1 text-12 text-warn"><TriangleAlert aria-hidden className="size-3.5 shrink-0" />{decidedWords(was.at)}</span>}
        {confirm === l.item && <div className="flex flex-wrap items-center gap-2 text-12 text-muted">Taken out now?
          <Button size="sm" loading={busy} onClick={() => { const r = removedEntry(l, new Date().toISOString(), where, newId)
            void send(oneSet([r.entry], { seen: r.seen }), () => setConfirm(null)) }}>Yes, removed</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button></div>}
      </div> })}
    {adding ? <div className="grid gap-1.5 rounded-md border border-line p-2">
      <div className="flex flex-wrap gap-1.5">{(Object.keys(LINES) as LineCode[]).map((c) =>
        <Chip key={c} on={code === c} onClick={() => setCode(code === c ? null : c)}>{LINES[c]}</Chip>)}</div>
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Site" placeholder="Site: right internal jugular" value={site} onChange={(e) => setSite(e.target.value)} className="h-8 min-w-0 flex-1 text-13" />
        <Input aria-label="When" placeholder="now, or HH:MM" value={time} onChange={(e) => setTime(e.target.value)} className="h-8 w-28 text-13 tnum" />
        <Button size="sm" disabled={!code || !at} loading={busy} onClick={() => code && at && void send(oneSet([lineEntry(code, site, at, where, newId)]), () => {
          setAdding(false); setCode(null); setSite(''); setTime('') })}>Add the line</Button>
        <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
      </div>
      {time.trim() && !at && <span className="text-12 text-danger">A time today: 14:30</span>}
    </div> : <div><Button size="sm" variant="outline" onClick={() => setAdding(true)}>+ Line</Button></div>}
    {error && <Callout tone="danger">{error}</Callout>}
  </div>
}
