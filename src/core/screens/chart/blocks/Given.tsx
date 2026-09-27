// A dose given (chart-plan.md §1.3): "Given paracetamol 1 g · by mouth · 14:05 · lot …"; not given says so, with why.
import type { EntryData } from '../../../db/shapes.generated'
import type { BlockProps } from '../../../renderers'
import { Tag } from '../../../ui'
import { ROUTE, valueWords } from '../model/labels'
import { itemName, useBlockEnv } from './env'

export function Given({ data }: BlockProps) {
  const env = useBlockEnv(); const d = data as EntryData['given']; const not = d.status === 'not-done'
  const drug = d.drug?.text ?? itemName(env, d.medication) ?? 'the medicine'
  const how = [valueWords(d.dose), d.route && (ROUTE[d.route] ?? d.route), d.site].filter(Boolean).join(' · ')
  return <div className="grid gap-0.5 text-13">
    <p className="flex flex-wrap items-baseline gap-x-1.5">
      {not && <Tag tone="warn">Not given</Tag>}<span className="text-14 font-medium text-fg">{not ? drug : `Given ${drug}`}</span>{how && <span className="text-muted">{how}</span>}
    </p>
    {not && d.reason && <p className="text-muted">Why: {d.reason}</p>}
    {(d.lot || d.expiry) && <p className="text-12 text-faint tnum">{[d.lot && `lot ${d.lot}`, d.expiry && `expires ${d.expiry}`].filter(Boolean).join(' · ')}</p>}
    {d.note && <p className="text-muted">{d.note}</p>}
  </div>
}
