// Where to in the record (spec/openCare.md §5.6): the decision's line ("Where to: admit to Medical Ward · police report 2214/2026"),
// then why, who signed and its note, one line each.
import type { BlockProps } from '@core/renderers'

export function Disposition({ item, data }: BlockProps) {
  const more = (['why', 'signed_by', 'note'] as const).map((k) => data[k]).filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  return <div className="grid gap-0.5">
    <p className="text-14 font-medium">{item.entry.line}</p>
    {more.map((x, i) => <p key={i} className="text-13 text-muted">{x}</p>)}
  </div>
}
