// The center's timelines (chart-plan.md §1.1, §3.2): a visit's or a stay's signed sets, newest first — this encounter, or an older one
// opened from the record (read-only) — read by visit, with the answers to its orders (the bench writes them with no visit) and the
// set heads' presence moves; a stay by day, with Since yesterday on top; a clinic patient back with results, Since Done. The entries
// outside any visit (the record's first page, as Record.tsx's Between visits), and one entry opened from a link or the record.
import { ClipboardList } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useEntryPages, useItem } from '../../../hooks/chart'
import { useDepartment } from '../../../hooks/organization'
import { Button, Callout, Empty, Skeleton } from '../../../ui'
import { SetCard } from '../blocks'
import { useChart } from '../context'
import { byDay, bySet, encounterItems, filterSets, inWindow, movesOf, outsideOf, sinceDigest, startOf, type SetGroup, type Window } from '../model/encounter'
import { countKinds, itemsOf } from '../model/items'
import { visitsOf } from '../model/record'
import { DayGroups } from './DayGroups'
import { useItemCtx } from './itemCtx'
import { KindFilter } from './KindFilter'
import { ScopeBar } from './ScopeBar'
import { SinceDigest } from './SinceDigest'

/** signed sets, one card each; empty, a quiet line */
export function Sets({ sets, empty }: { sets: SetGroup[]; empty: ReactNode }) {
  return sets.length ? <div className="grid gap-3">{sets.map((s) => <SetCard key={s.set_id} set={s} />)}</div> : <Empty size="sm">{empty}</Empty>
}
const Earlier = ({ q }: { q: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) =>
  q.hasNextPage ? <Button size="sm" variant="ghost" className="justify-self-start" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Earlier</Button> : null

/** the open encounter before anything is signed: a quiet card that points at the line below */
function FreshVisit({ stay }: { stay: boolean }) {
  return <div className="grid justify-items-center gap-1.5 rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
    <span className="mb-1 grid size-10 place-items-center rounded-full bg-sunken text-faint"><ClipboardList aria-hidden className="size-5" /></span>
    <p className="text-14 font-medium text-fg">{stay ? 'This stay is just beginning' : 'A clean page'}</p>
    <p className="max-w-xs text-13 text-muted">Notes, orders and results you sign will gather here. Start on the line below, or type <kbd className="rounded-sm border border-line-strong bg-sunken px-1 font-mono text-12">/</kbd> to see what you can add.</p>
  </div>
}

/** a visit or a stay: this encounter (current), or an older one */
export function VisitTimeline({ id, current }: { id: string; current?: boolean }) {
  const c = useChart(); const { org } = useDepartment(); const s = c.r.server; const types = org?.types
  const line = useMemo(() => visitsOf(s, { org, me: c.me, departmentId: c.departmentId }, c.encounter?.id).find((v) => v.id === id) ?? null, [s, org, c.me, c.departmentId, c.encounter, id])
  const row = line?.row; const stay = row?.kind === 'stay'
  // what came since: a stay while admitted, since yesterday; a clinic patient done and back (or waiting) for results, since Done
  const win: Window | null = !current || !row ? null : stay ? (row.state === 'admitted' ? { since: 'yesterday' } : null)
    : row.done_at && !['done', 'left'].includes(row.state) ? { since: 'done', at: row.done_at } : null
  const ctx = useItemCtx(win?.since === 'done' ? win.at : undefined)
  const first = useMemo(() => s.entries.filter((e) => e.visit_id === id), [s.entries, id])
  const q = useEntryPages({ patient_id: c.patientId, visits: [id], limit: 200 }, first)
  const entries = useMemo(() => q.data?.pages.flatMap((p) => p.entries) ?? [], [q.data])
  const moves = useMemo(() => movesOf(s, id), [s, id])
  const items = useMemo(() => { const all = encounterItems(entries, s, id, ctx)
    return win?.since === 'yesterday' ? all.map((i) => inWindow(i.entry, win) ? { ...i, isNew: true } : i) : all }, [entries, s, id, ctx, win?.since]) // eslint-disable-line react-hooks/exhaustive-deps
  const sets = useMemo(() => filterSets(bySet(items, moves, types), c.kind), [items, moves, types, c.kind])
  const digest = useMemo(() => win ? sinceDigest(items, moves, win, types) : null, [items, moves, win?.since, types]) // eslint-disable-line react-hooks/exhaustive-deps
  const title = current ? (stay ? 'This stay' : 'This visit') : stay ? 'A stay' : 'A visit'
  return <>
    <ScopeBar title={title} line={line} meta={!line ? 'not in this record' : null}><KindFilter counts={countKinds(items)} /></ScopeBar>
    {digest && win && <SinceDigest digest={digest} since={win.since} />}
    {q.isPending && !entries.length ? <Skeleton lines={3} />
      : stay && row ? <DayGroups days={byDay(sets, startOf(row, s.tables['base.presence']), row.ended_at ?? undefined)} filtered={c.kind !== 'all'} />
      : !sets.length && c.kind === 'all' && current ? <FreshVisit stay={stay} />
      : <Sets sets={sets} empty={c.kind !== 'all' ? 'None of these in this visit' : 'Nothing signed in this visit'} />}
    {q.error && <Callout tone="danger">{q.error.message}</Callout>}
    <Earlier q={q} />
  </>
}

/** the entries outside any visit: signed on someone else's patient, the bench's answers to orders from no visit, outside records */
export function OutsideList() {
  const c = useChart(); const { org } = useDepartment(); const s = c.r.server; const types = org?.types; const ctx = useItemCtx()
  const items = useMemo(() => itemsOf(outsideOf(s.entries, s, types), ctx), [s, types, ctx])
  const sets = useMemo(() => filterSets(bySet(items, [], types), c.kind), [items, types, c.kind])
  return <>
    <ScopeBar title="Outside a visit" meta="signed with no visit open, among the record's latest entries"><KindFilter counts={countKinds(items)} /></ScopeBar>
    <Sets sets={sets} empty="Nothing outside a visit among the latest entries" />
    <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => c.open({ scope: 'record' })}>Earlier → Whole record</Button>
  </>
}

/** one entry, opened from a link (?at=entry:, the old ?entry=) or the record: its item as a set, its Details open */
export function EntryView({ id }: { id: string }) {
  const c = useChart(); const { org } = useDepartment(); const types = org?.types; const ctx = useItemCtx()
  const q = useItem(id, c.patientId)
  const sets = useMemo(() => { if (!q.data) return null; const first = q.data.find((e) => e.id === id)
    return bySet(itemsOf(q.data.filter((e) => e.item === first?.item), { ...ctx, pool: [...(ctx.pool ?? []), ...q.data] }), [], types) }, [q.data, id, ctx, types])
  return <>
    <ScopeBar title="An entry" meta="its Details open under it" />
    {q.error ? <Callout tone="danger">{q.error.message}</Callout> : !sets ? <Skeleton lines={3} /> : <Sets sets={sets} empty="This entry is not in the record you may read" />}
  </>
}
