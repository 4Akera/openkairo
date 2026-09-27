// Died (chart-plan.md §1.3): the date and time at the precision written, the cause with its ICD-10 code faint; no colour.
import type { EntryData } from '../../../db/shapes.generated'
import type { BlockProps } from '../../../renderers'
import { hm, longDate, ymd } from '../../../ui'
import { partialWords } from '../model/labels'

export function Died({ item, data }: BlockProps) {
  const d = data as Partial<EntryData['died']>; const e = item.entry
  const on = e.precision === 'year' || e.precision === 'month' ? partialWords({ value: ymd(e.occurred_at), precision: e.precision })
    : e.precision === 'day' ? longDate(e.occurred_at) : `${longDate(e.occurred_at)} ${hm(e.occurred_at)}`
  const code = d.cause?.codings?.find((c) => c.system === 'icd10')?.code
  return <div className="grid gap-0.5">
    <p className="text-14 text-fg tnum">Died {on}{d.cause && <> · {d.cause.text}{code && <span className="ms-1.5 font-mono text-11 text-faint">{code}</span>}</>}</p>
    {d.note && <p className="text-13 text-muted">{d.note}</p>}
  </div>
}
