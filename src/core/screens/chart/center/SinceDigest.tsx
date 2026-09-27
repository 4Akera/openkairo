// What came since (chart-plan.md §1.1, §3.2): in a stay, since yesterday (by the clinical day); a clinic patient back with results,
// since Done. How many of each kind (a click filters the center to it), the critical and abnormal results by name (a click opens the
// entry), what was started (a problem, a medicine), and the stay's moves (a bed move). Quiet when nothing came.
import { useDepartment } from '../../../hooks/organization'
import { Card, Chip, TONE, cn, hm, shortDate } from '../../../ui'
import { useChart } from '../context'
import type { Digest } from '../model/encounter'
import { KINDS, baseOf, type ChartItem } from '../model/items'
import { KIND_WORD, MOVE_WORD, words } from '../model/labels'

const name = (i: ChartItem) => i.entry.line || KIND_WORD.results

export function SinceDigest({ digest, since }: { digest: Digest; since: 'yesterday' | 'done' }) {
  const c = useChart(); const { org } = useDepartment(); const d = digest
  const head = since === 'yesterday' ? `Since yesterday · ${shortDate(`${d.from}T12:00:00Z`)}` : `Since Done · ${hm(d.from)}`
  const moves = d.moves.map((m) => { const b = baseOf(m.type, org?.types); const bed = b === 'moved' ? org?.places.find((p) => p.id === m.data?.place_id)?.name : null
    return `${MOVE_WORD[b] ?? words(b)}${bed ? ` to ${bed}` : ''} ${hm(m.recorded_at)}` })
  const open = (i: ChartItem) => c.open({ scope: 'entry', id: i.entry.id })
  if (!d.items.length && !moves.length) return <p className="text-12 text-faint">{head} — nothing new</p>
  return <Card className="grid gap-2 px-4 py-3" aria-label={head}>
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="me-1 text-12 font-semibold text-fg">{head}</span>
      {KINDS.filter((k) => d.counts[k] > 0).map((k) => <Chip key={k} shape="pill" on={c.kind === k} onClick={() => c.setKind(c.kind === k ? 'all' : k)}>
        {KIND_WORD[k]}<span className="tnum">{d.counts[k]}</span></Chip>)}
    </div>
    {(d.critical.length > 0 || d.abnormal.length > 0) && <ul className="grid gap-0.5 text-13">
      {[...d.critical, ...d.abnormal].map((i) => { const crit = d.critical.includes(i)
        return <li key={i.id}><button type="button" onClick={() => open(i)} className={cn('rounded-sm text-start hover:underline focus-ring', crit ? 'font-semibold' : '', TONE[crit ? 'danger' : 'warn'].text)}>
          {crit ? '‼ ' : ''}{name(i)}</button></li> })}
    </ul>}
    {d.started.length > 0 && <p className="text-13 text-muted">Started: <span className="text-fg">{d.started.map(name).join(', ')}</span></p>}
    {moves.length > 0 && <p className="text-12 text-faint tnum">{moves.join(' · ')}</p>}
  </Card>
}
