// The banner's actions (chart-plan.md §2 #7–14, §5.2): a stay's Discharge and Sign; a clinic visit of mine in consult, Done (Sign N ·
// Done → next ⌘↵: signs and closes the visit now) and, while this visit has orders out, Wait for results · n (⌘⇧↵: the visit stays
// open until they are answered) — owner, 2026-10-07: no More; the back arrow sends the patient back to the waiting room, and Done's
// next step is the department's setting; otherwise "with Dr. X — theirs to finish", Sign N (written outside the visit) and Start visit.
import { useMemo } from 'react'
import { useDepartment } from '../../hooks/organization'
import { useDraftsFor } from '../../hooks/drafts'
import { draftEntries } from '../../db/entries'
import type { QueueRow } from '../../db/types'
import { Button, Kbd } from '../../ui'
import { useChart } from './context'
import { barOf, doneLabel, doneNext, ordersOut } from './model/visit'

export function Actions({ next, assignee }: { next: QueueRow | null; assignee: string | null }) {
  const c = useChart(); const { dept, org } = useDepartment(); const ds = useDraftsFor(c.patientId); const drafts = ds.length; const a = c.actions
  const v = c.encounter
  // orders out in this visit, with those the drafts will sign (a medicine sent on is one too)
  const out = useMemo(() => !v || !dept ? 0 : ordersOut(c.r.server.tables['base.orders']?.rows ?? [], v.id,
    ds.flatMap((d) => draftEntries(d, { patientId: c.patientId, departmentId: dept.id, visitId: v.id, record: c.r, org })).filter((e) => e.type === 'order').length),
  [v, dept, org, ds, c.r, c.patientId])
  if (!dept) return null
  const bar = barOf(c.role, c.encounter, drafts, dept, c.can, a.discharging)
  if (bar.kind === 'stay') return <>
    {bar.discharge && <Button variant="outline" onClick={() => a.setDischarging(true)} disabled={a.busy}>Discharge</Button>}
    <Button onClick={a.sign} loading={a.busy}>Sign{drafts ? ` ${drafts}` : ''}<Kbd className="ms-1 max-sm:hidden">⌘↵</Kbd></Button>
  </>
  if (bar.kind === 'clinic') return <>
    {out > 0 && <Button variant="outline" onClick={() => a.done(doneNext(dept), true)} disabled={a.busy} aria-keyshortcuts="Meta+Shift+Enter"
      title={`Done, and the visit stays open until ${out === 1 ? 'the order is' : `the ${out} orders are`} answered: the patient waits for the results`}>
      Wait for results<span className="text-muted tnum">· {out}</span></Button>}
    <Button onClick={() => a.done(doneNext(dept), false)} loading={a.busy} title="Signs what is written and closes the visit now; results that come later go to your review list">
      {doneLabel(drafts, dept, next)}<Kbd className="ms-1 max-sm:hidden">⌘↵</Kbd></Button>
  </>
  return <>
    {bar.withOther && <span className="text-14 text-faint">With {assignee ?? 'another clinician'} — theirs to finish</span>}
    {bar.signN > 0 && <Button onClick={a.sign} loading={a.busy}>Sign {bar.signN}<Kbd className="ms-1 max-sm:hidden">⌘↵</Kbd></Button>}
    {bar.start && <Button variant="outline" onClick={a.startVisit}>Start visit</Button>}
  </>
}
