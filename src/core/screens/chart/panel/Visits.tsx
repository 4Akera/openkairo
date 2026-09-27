// Visits & stays (chart-plan.md §2 #21, §3.2): every visit and stay, the newest first by when it began — the date, the department
// (locked where its private notes are hidden from the reader), who, where it stands, a stay's days and bed, what was new there (else
// the reason) and its orders. A click opens it in the center (this one: back to the encounter); the one the center shows carries the
// rail. "Outside a visit" lists the record's first page's entries with no visit (as Record.tsx's Between visits did); the whole
// record, every entry paged, opens from here too.
import { useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import { Badge, Button, Empty, Section, cn, shortDate } from '../../../ui'
import { sameAt, type At } from '../model/at'
import { outsideOf } from '../model/encounter'
import { visitsOf, type VisitLine } from '../model/record'
import { More } from './parts'
import type { Panel } from './RecordPanel'

const LIMIT = 8
const ROW = 'grid w-full grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 px-3.5 py-2 text-start text-13 transition-colors hover:bg-hover focus-ring'

export function Visits({ p }: { p: Panel }) {
  const types = p.ctx.org?.types; const [all, setAll] = useState(false)
  const visits = useMemo(() => visitsOf(p.rec, p.ctx, p.visitId), [p.rec, p.ctx, p.visitId])
  const outside = useMemo(() => outsideOf(p.r.server.entries, p.rec, types), [p.r.server.entries, p.rec, types])
  const at: At = p.at ?? { scope: 'encounter' }
  const shownAt = (v: VisitLine): At => v.current ? { scope: 'encounter' } : { scope: 'visit', id: v.id }
  const rows = all ? visits : visits.slice(0, LIMIT)
  return <Section id="chart.visits" variant="compact" title="Visits & stays" count={visits.length || undefined} flush
    summary={visits[0] ? `${shortDate(visits[0].start)} · ${visits[0].department}` : undefined}
    right={<Button size="xs" variant="ghost" onClick={() => p.onOpen({ scope: 'record' })}>Whole record</Button>}>
    {!visits.length && !outside.length ? <Empty size="sm" className="px-3.5 pb-2">No visits or stays yet</Empty> : <ul className="divide-y divide-line border-t border-line">
      {rows.map((v) => { const on = sameAt(at, shownAt(v)) || (at.scope === 'visit' && at.id === v.id)
        return <li key={v.id}><button type="button" aria-current={on || undefined} onClick={() => p.onOpen(shownAt(v))} className={cn(ROW, on && 'rail bg-hover')}>
          <span className="text-faint tnum">{shortDate(v.start)}</span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-1.5"><span className="font-medium text-fg">{v.department}</span>
              {v.locked && <Lock aria-label="Private notes here are hidden from you" className="size-3 text-faint" />}
              {v.current && <Badge tone="accent">{v.kind === 'stay' ? 'this stay' : 'this visit'}</Badge>}
              <span className="ms-auto text-12 text-faint">{v.kind === 'stay' ? `${v.open ? 'Admitted' : 'Stay'} · ${v.days} day${v.days === 1 ? '' : 's'}${v.bed ? ` · ${v.bed}` : ''}` : v.state_word}</span></span>
            <span className="block truncate text-12 text-faint">{[v.who, v.new_there.length ? v.new_there.join(', ') : v.reason, v.orders ? `${v.orders} order${v.orders === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}</span>
          </span>
        </button></li> })}
      {outside.length > 0 && <li><button type="button" aria-current={at.scope === 'outside' || undefined} onClick={() => p.onOpen({ scope: 'outside' })} className={cn(ROW, at.scope === 'outside' && 'rail bg-hover')}>
        <span className="text-faint">—</span>
        <span className="min-w-0"><span className="font-medium text-fg">Outside a visit</span><span className="block text-12 text-faint">{outside.length} {outside.length === 1 ? 'entry' : 'entries'} signed outside any visit</span></span>
      </button></li>}
    </ul>}
    {visits.length > LIMIT && <div className="px-3.5 pb-2"><More n={visits.length - LIMIT} onClick={() => setAll(!all)}>{all ? 'Fewer' : undefined}</More></div>}
  </Section>
}
