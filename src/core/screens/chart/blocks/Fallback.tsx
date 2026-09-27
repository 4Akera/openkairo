// Any type without a block of its own (chart-plan.md §1.3): its text, then its fields as label and value, the labels in plain words
// (never the raw key: labels.ts, else the key with _ → space and the _text, _on, _id endings gone). Built on FallbackFull, which stays in
// renderers for Request.tsx. A pack's Full renderer with no Block is drawn here too, inside the chart's shell.
import type { BlockProps } from '../../../renderers'
import { rendererFor } from '../../../renderers'
import { card } from '../../../db/views'
import { KV } from '../../../ui'
import { fieldLabel, valueWords } from '../model/labels'
import { useBlockEnv } from './env'

const SKIP = new Set(['text', 'author_name', 'department_name', 'written_with_id'])
export function Fallback({ item, data, compact }: BlockProps) {
  const text = typeof data.text === 'string' ? data.text : null
  const rest = Object.entries(data).filter(([k]) => !SKIP.has(k)).map(([k, v]) => [fieldLabel(k), valueWords(v)] as [string, string]).filter(([, v]) => v)
  if (!text && !rest.length) return <p className="text-13 text-muted">{item.entry.line}</p>
  return <div className="grid gap-2">
    {text && <p className="whitespace-pre-wrap text-14 leading-relaxed text-fg">{text}</p>}
    {rest.length > 0 && <KV dense labelWidth={compact ? '6rem' : '8rem'} items={rest} />}
  </div>
}

/** a pack's Full renderer for its own type, drawn in the chart's shell (the pharmacy's dispense) */
export function PackFull({ item, data, compact }: BlockProps) {
  const env = useBlockEnv(); const F = rendererFor(item.type)?.Full
  return F ? <F card={card(item.entry, env.org)} data={data} /> : <Fallback item={item} data={data} compact={compact} />
}
