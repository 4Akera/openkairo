// An alert (chart-plan.md §1.3, design-system.md §4.5): active, a line in danger (a fall risk in warn) with its period; inactive or
// past its end, struck and quiet.
import type { EntryData } from '../../../db/shapes.generated'
import type { BlockProps } from '../../../renderers'
import { TONE, cn, longDate } from '../../../ui'
import { ALERT_STATUS } from '../model/labels'

/** past its end: an alert with a period that is over reads as inactive (as alertsOf does in the model) */
const over = (end: string | undefined) => !!end && Date.parse(end) < Date.now()

export function Alert({ data }: BlockProps) {
  const d = data as Partial<EntryData['alert']>; const p = d.period
  const active = d.status === 'active' && !over(p?.end)
  const t = TONE[/\bfall/i.test(d.concept?.text ?? '') ? 'warn' : 'danger']
  const period = [p?.start && `from ${longDate(p.start)}`, p?.end && `until ${longDate(p.end)}`].filter(Boolean).join(' ')
  return <div className="grid gap-1">
    {active ? <p className={cn('flex flex-wrap items-baseline gap-x-2 rounded-lg px-3 py-1.5 text-14 font-medium ring-1 ring-inset', t.soft, t.text, t.line)}>
      {d.concept?.text}{period && <span className="text-12 font-normal">{period}</span>}</p>
      : <p className="text-14 text-faint"><span className="line-through">{d.concept?.text}</span> · {ALERT_STATUS.inactive}{period && ` · ${period}`}</p>}
    {d.note && <p className="text-13 text-muted">{d.note}</p>}
  </div>
}
