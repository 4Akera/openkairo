// The top of the center (chart-plan.md §2 #11–13): the error line; the writer's warnings as a card — Sign anyway resends with them
// confirmed, Change it goes back to the drafts; a stay's discharge chooser (where to), whose drafts go with it. In the flow, never over
// the record.
import { useDraftsFor } from '../../hooks/drafts'
import { words } from '../../db/rpc'
import { Button, Callout } from '../../ui'
import { Choose } from '../ward/BedBoard'
import { DISPOSITION } from '../ward/words'
import { useChart } from './context'

export function Notices() {
  const c = useChart(); const a = c.actions; const drafts = useDraftsFor(c.patientId).length
  return <>
    {a.err && <Callout tone="danger" role="alert">{a.err}</Callout>}
    {a.warn && <Callout tone="warn" role="alert" title="Check before signing" actions={<>
      <Button size="sm" onClick={() => a.warn!.retry(a.warn!.findings.map((f) => f.code))} loading={a.busy}>Sign anyway</Button>
      <Button size="sm" variant="ghost" onClick={a.clearWarn}>Change it</Button></>}>
      <ul className="grid gap-0.5">{a.warn.findings.map((f, i) => <li key={i}><b className="font-medium">{words(f.code)}</b>{f.detail ? ` — ${f.detail}` : ''}</li>)}</ul>
    </Callout>}
    {a.discharging && c.role.admitted && <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-sunken px-3 py-2 ring-1 ring-inset ring-line">
      <span className="text-14 font-medium text-fg">Discharge{drafts ? ` — signs the ${drafts} written` : ''}</span>
      <Choose label="To" options={DISPOSITION} go="Discharge" busy={a.busy} onCancel={() => a.setDischarging(false)} onGo={a.discharge} />
    </div>}
  </>
}
