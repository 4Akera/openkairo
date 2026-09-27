// History (chart-plan.md §3.2): operations and procedures (newest first), then observations by code — family history (10157-6),
// social history (smoking, alcohol, occupation, housing) and everything else — from the facts page (each item's latest version, the
// crossed out gone). Nothing in the composer writes these yet, so a patient without them shows one empty line; once any exists,
// every group is named, and an empty one says so (a doctor reads "none recorded", not a missing heading). A row opens its entry.
import { useMemo, type ReactNode } from 'react'
import { Empty, Section, Skeleton } from '../../../ui'
import { PROCEDURE_STATUS, partialWords } from '../model/labels'
import { historyOf, type FactRow } from '../model/record'
import { Fact, Sub } from './parts'
import type { Panel } from './RecordPanel'

export function History({ p }: { p: Panel }) {
  const types = p.ctx.org?.types
  const h = useMemo(() => historyOf(p.facts ?? [], types), [p.facts, types])
  const n = h.procedures.length + h.family.length + h.social.length + h.other.length
  return <Section id="chart.history" variant="compact" title="History" count={n || undefined}
    summary={[...h.procedures, ...h.social, ...h.family].slice(0, 3).map((x) => x.text).join(', ')}>
    {p.factsLoading ? <Skeleton lines={3} className="py-1.5" />
      : !n ? <Empty size="sm">No history recorded: operations, family and social history are listed here once written</Empty>
      : <>
        <Group title="Operations & procedures" first>{h.procedures.map((x) => <Row key={x.item} p={p} x={x} strong
          value={[x.when && partialWords({ value: x.when }), x.value, x.status && x.status !== 'completed' ? PROCEDURE_STATUS[x.status] ?? x.status : null].filter(Boolean).join(' · ')} />)}</Group>
        <Group title="Family history">{h.family.map((x) => <Row key={x.item} p={p} x={x} value={x.value} />)}</Group>
        <Group title="Social history">{h.social.map((x) => <Row key={x.item} p={p} x={x} value={x.value} />)}</Group>
        <Group title="Other observations">{h.other.map((x) => <Row key={x.item} p={p} x={x} value={[x.value, x.when && partialWords({ value: x.when })].filter(Boolean).join(' · ')} />)}</Group>
      </>}
  </Section>
}

function Group({ title, first, children }: { title: string; first?: boolean; children: ReactNode[] }) {
  return <>
    <Sub className={first ? 'mt-0' : undefined}>{title}</Sub>
    {children.length ? <ul className="divide-y divide-line">{children}</ul> : <Empty size="sm">None recorded</Empty>}
  </>
}

/** a fact: its words (the code's text; a procedure's name is the fact itself, strong), then its value and its note */
function Row({ p, x, value, strong }: { p: Panel; x: FactRow; value: string | null; strong?: boolean }) {
  return <li className="py-1.5 text-13">
    <p className="flex flex-wrap items-baseline gap-x-2"><Fact onOpen={() => p.open(x.entry.id)} className={strong ? 'font-medium text-fg' : 'text-muted'}>{x.text}</Fact>{value && <span className="text-fg tnum">{value}</span>}</p>
    {x.note && <p className="text-12 text-faint">{x.note}</p>}
  </li>
}
