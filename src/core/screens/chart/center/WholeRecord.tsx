// The Whole record (chart-plan.md §2 #21): every entry the reader may read, newest first, a page at a time ("Earlier"), drawn as signed
// sets — by visit or by day, as the organization's record_view says. The kind filter narrows the read itself (the reader follows a
// pack type's base_type), so a year of notes pages as notes. A visit's head opens it in the center.
import { useMemo } from 'react'
import { Lock } from 'lucide-react'
import { useEntryPages } from '../../../hooks/chart'
import { useDepartment } from '../../../hooks/organization'
import { Button, Callout, Empty, Skeleton, longDate, shortDate } from '../../../ui'
import { useChart } from '../context'
import { byDate, bySet, byVisit } from '../model/encounter'
import { KIND_TYPES, countKinds, itemsOf } from '../model/items'
import { visitsOf } from '../model/record'
import { useItemCtx } from './itemCtx'
import { KindFilter } from './KindFilter'
import { ScopeBar } from './ScopeBar'
import { Sets } from './Timeline'

const HEAD = 'flex flex-wrap items-baseline gap-x-2 text-12 text-faint tnum'

export function WholeRecord() {
  const c = useChart(); const { org } = useDepartment(); const types = org?.types; const ctx = useItemCtx(); const s = c.r.server
  const view = org?.organization.record_view ?? 'visits'
  const q = useEntryPages({ patient_id: c.patientId, types: c.kind === 'all' ? null : KIND_TYPES[c.kind], limit: 100 }, c.kind === 'all' ? s.entries : undefined)
  const entries = useMemo(() => q.data?.pages.flatMap((p) => p.entries) ?? [], [q.data])
  const items = useMemo(() => itemsOf(entries, ctx), [entries, ctx])
  const sets = useMemo(() => bySet(items, [], types), [items, types])
  const lines = useMemo(() => new Map(visitsOf(s, { org, me: c.me, departmentId: c.departmentId }, c.encounter?.id).map((v) => [v.id, v])), [s, org, c.me, c.departmentId, c.encounter])
  // every kind is offered (the filter narrows the read); the counts are of what is read so far, shown only for All
  const counts = useMemo(() => c.kind === 'all' ? countKinds(items) : {}, [items, c.kind])
  return <>
    <ScopeBar title="Whole record" meta={view === 'visits' ? 'by visit, the newest first' : 'by day, the newest first'}>
      <KindFilter every counts={counts} /></ScopeBar>
    {q.isPending && !entries.length ? <Skeleton lines={4} /> : !sets.length ? <Empty size="sm">{c.kind === 'all' ? 'Nothing in the record yet' : 'None of these in the record'}</Empty>
      : view === 'visits' ? <div className="grid gap-4">{byVisit(sets, s.tables['base.orders']?.rows).map((g) => { const v = g.visit_id ? lines.get(g.visit_id) : null
        return <section key={g.visit_id ?? 'outside'} className="grid gap-2">
          <h3 className={HEAD}>{g.visit_id ? <>
            <button type="button" onClick={() => c.open(v?.current ? { scope: 'encounter' } : { scope: 'visit', id: g.visit_id! })} className="rounded-sm font-semibold text-fg hover:underline focus-ring">
              {v ? `${shortDate(v.start)} · ${v.kind === 'stay' ? 'Stay · ' : ''}${v.department}` : 'A visit'}</button>
            {v?.locked && <Lock aria-label="Private notes here are hidden from you" className="size-3 self-center" />}{v?.who && <span>{v.who}</span>}{v?.current && <span className="text-accent">this one</span>}
          </> : <span className="font-semibold text-fg">Outside a visit</span>}</h3>
          <Sets sets={g.sets} empty={null} />
        </section> })}</div>
      : <div className="grid gap-4">{byDate(sets).map((d) => <section key={d.day} className="grid gap-2">
          <h3 className={HEAD}><span className="font-semibold text-fg">{longDate(`${d.day}T12:00:00Z`)}</span></h3><Sets sets={d.sets} empty={null} /></section>)}</div>}
    {q.error && <Callout tone="danger">{q.error.message}</Callout>}
    {q.hasNextPage && <Button size="sm" variant="ghost" className="justify-self-start" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Earlier</Button>}
  </>
}
