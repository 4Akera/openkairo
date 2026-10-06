// An alert (chart-plan.md §1.3, design-system.md §4.5): active, a line in danger (a fall risk in warn) with its period; inactive or
// past its end, struck and quiet. Never names HIV.
import type { EntryData } from '../../../db/shapes.generated'
import type { BlockProps } from '../../../renderers'
import { TONE, cn, longDate } from '../../../ui'
import { ALERT_STATUS } from '../model/labels'
import { alertWord, namesHiv } from '../model/facts'

/** past its end: an alert with a period that is over reads as inactive (as alertsOf does in the model) */
const over = (end: string | undefined) => !!end && Date.parse(end) < Date.now()

export function Alert({ data }: BlockProps) {
  const d = data as Partial<EntryData['alert']>; const p = d.period
  const active = d.status === 'active' && !over(p?.end)
  const t = TONE[/\bfall/i.test(d.concept?.text ?? '') ? 'warn' : 'danger']
  // words or a note naming HIV are never drawn (the server refuses them; this is the second guard)
  const text = alertWord(d.concept?.text ?? '', null); const note = namesHiv(d.note) ? null : d.note
  const period = [p?.start && `from ${longDate(p.start)}`, p?.end && `until ${longDate(p.end)}`].filter(Boolean).join(' ')
  return <div className="grid gap-1">
    {active ? <p className={cn('flex flex-wrap items-baseline gap-x-2 rounded-lg px-3 py-1.5 text-14 font-medium ring-1 ring-inset', t.soft, t.text, t.line)}>
      {text}{period && <span className="text-12 font-normal">{period}</span>}</p>
      : <p className="text-14 text-faint"><span className="line-through">{text}</span> · {ALERT_STATUS.inactive}{period && ` · ${period}`}</p>}
    {note && <p className="text-13 text-muted">{note}</p>}
  </div>
}
