// An observation (chart-plan.md §1.3): the code's words, then the value — a quantity, a concept, text, a date or yes/no — and its
// interpretation as a word (with the colour, never the colour alone).
import type { EntryData } from '../../../db/shapes.generated'
import type { BlockProps } from '../../../renderers'
import { interp } from '../../../db/views'
import { Tag, flagTone, interpWord, ymd } from '../../../ui'
import { partialWords } from '../model/labels'

export function Observation({ data }: BlockProps) {
  const d = data as Partial<EntryData['observation']>; const v = d.value ?? {}
  const value = v.quantity ? `${v.quantity.comparator ?? ''}${v.quantity.value}${v.quantity.unit ? ` ${v.quantity.unit}` : ''}` : v.concept?.text ?? v.text ?? partialWords(v.date, ymd)
    ?? (v.boolean === undefined ? '' : v.boolean ? 'Yes' : 'No')
  const word = d.interpretation ? interpWord(d.interpretation) || d.interpretation : null
  return <div className="grid gap-0.5 text-13">
    <p className="flex flex-wrap items-baseline gap-x-1.5"><span className="text-muted">{d.code?.text}</span><span aria-hidden className="text-faint">·</span>
      <span className="text-14 font-medium text-fg">{value}</span>{word && <Tag tone={flagTone(interp(d.interpretation))}>{word}</Tag>}</p>
    {d.method && <p className="text-12 text-faint">{d.method}</p>}
    {d.note && <p className="text-muted">{d.note}</p>}
  </div>
}
