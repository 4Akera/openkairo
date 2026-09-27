// The banner's actions (chart-plan.md §2 #7–14, §5.2): a stay's Discharge and Sign; a clinic visit of mine in consult, Done (Sign N ·
// Done → next ⌘↵) and More, whose choices open in a strip under the banner, in the page's flow (owner decision D5: no menu over the
// record); otherwise "with Dr. X — theirs to finish", Sign N (written outside the visit) and Start visit.
import { ChevronDown } from 'lucide-react'
import { useDepartment } from '../../hooks/organization'
import { useDraftsFor } from '../../hooks/drafts'
import type { QueueRow } from '../../db/types'
import { Button, Kbd, cn } from '../../ui'
import { useChart } from './context'
import { barOf, doneChoices, doneLabel, doneNext, type Choice } from './model/visit'

export function Actions({ next, assignee }: { next: QueueRow | null; assignee: string | null }) {
  const c = useChart(); const { dept } = useDepartment(); const drafts = useDraftsFor(c.patientId).length; const a = c.actions
  if (!dept) return null
  const bar = barOf(c.role, c.encounter, drafts, dept, c.can, a.discharging)
  if (bar.kind === 'stay') return <>
    {bar.discharge && <Button variant="outline" onClick={() => a.setDischarging(true)} disabled={a.busy}>Discharge</Button>}
    <Button onClick={a.sign} loading={a.busy}>Sign{drafts ? ` ${drafts}` : ''}<Kbd className="ms-1">⌘↵</Kbd></Button>
  </>
  if (bar.kind === 'clinic') return <>
    <Button onClick={() => a.done(doneNext(dept))} loading={a.busy}>{doneLabel(drafts, dept, next)}<Kbd className="ms-1">⌘↵</Kbd></Button>
    <Button variant="outline" aria-expanded={a.more} aria-controls="done-choices" onClick={() => { a.setMore(!a.more); if (!a.more) window.scrollTo({ top: 0 }) }}>More<ChevronDown aria-hidden className={cn('transition-transform duration-base', a.more && 'rotate-180')} /></Button>
  </>
  return <>
    {bar.withOther && <span className="text-14 text-faint">With {assignee ?? 'another clinician'} — theirs to finish</span>}
    {bar.signN > 0 && <Button onClick={a.sign} loading={a.busy}>Sign {bar.signN}<Kbd className="ms-1">⌘↵</Kbd></Button>}
    {bar.start && <Button variant="outline" onClick={a.startVisit}>Start visit</Button>}
  </>
}

/** Done's other choices, under the banner in the flow: goes home or waits (department.patients_wait), → next or back to the queue
 *  (department.after_done), Not here (before seen), Return to waiting */
export function DoneChoices({ next }: { next: QueueRow | null }) {
  const c = useChart(); const { dept } = useDepartment(); const drafts = useDraftsFor(c.patientId).length; const a = c.actions
  if (!dept || !c.encounter || !a.more || !c.role.consult) return null
  const go = (k: Choice['key']) => k === 'home' ? a.done(doneNext(dept), false) : k === 'wait' ? a.done(doneNext(dept), true) : k === 'next' ? a.done(true)
    : k === 'queue' ? a.done(false) : k === 'not_here' ? a.notHere() : a.backToWaiting()
  return <div id="done-choices" role="group" aria-label="Done's other choices" className="border-b border-line bg-sunken"
    onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); a.setMore(false) } }}>
    <ul className="mx-auto flex max-w-chart flex-wrap items-start gap-x-4 gap-y-2 px-4 py-2.5">
      {doneChoices(dept, c.encounter, next, drafts).map((x) => <li key={x.key} className="grid max-w-64 gap-0.5">
        <Button size="sm" variant={x.key === 'not_here' ? 'danger-ghost' : 'outline'} className="justify-self-start" disabled={a.busy} onClick={() => go(x.key)}>{x.label}</Button>
        {x.hint && <span className="text-11 text-faint">{x.hint}</span>}</li>)}
      <li className="ms-auto"><Button size="sm" variant="ghost" onClick={() => a.setMore(false)}>Close <Kbd>esc</Kbd></Button></li>
    </ul>
  </div>
}
