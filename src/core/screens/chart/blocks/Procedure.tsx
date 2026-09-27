// A procedure (chart-plan.md §1.3): what was done, when (a partial date, as written), where on the body, the outcome; its status
// only when it is not done yet or did not happen.
import type { EntryData } from '../../../db/shapes.generated'
import type { BlockProps } from '../../../renderers'
import { Tag, ymd } from '../../../ui'
import { PROCEDURE_STATUS, partialWords } from '../model/labels'

export function Procedure({ data }: BlockProps) {
  const d = data as Partial<EntryData['procedure']>; const on = partialWords(d.performed, ymd)
  const where = [d.body_site?.text, d.outcome].filter(Boolean).join(' · ')
  return <div className="grid gap-0.5 text-13">
    <p className="flex flex-wrap items-baseline gap-x-1.5"><span className="text-14 font-medium text-fg">{d.concept?.text}</span>{on && <span className="text-muted tnum">{on}</span>}
      {d.status && d.status !== 'completed' && <Tag tone={d.status === 'not-done' || d.status === 'stopped' ? 'warn' : 'info'}>{PROCEDURE_STATUS[d.status] ?? d.status}</Tag>}</p>
    {where && <p className="text-muted">{where}</p>}
    {d.reason && <p className="text-muted">Why: {d.reason}</p>}
    {d.note && <p className="text-muted">{d.note}</p>}
  </div>
}
