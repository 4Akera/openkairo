// Every screen renders every type (spec 05): a card per entry from display_line, values and text; packs may register richer ones.
import type { ComponentType } from 'react'
import type { Card, Value } from '../db/types'
import { flagClass } from '../ui'
export interface Renderer { Card?: ComponentType<{ card: Card }>; Full?: ComponentType<{ card: Card; data: Record<string, unknown> }> }
const registry = new Map<string, Renderer>()
export const registerRenderer = (type: string, r: Renderer) => registry.set(type, r)
export const rendererFor = (type: string) => registry.get(type)

const arrow = (f: string | null | undefined) => f === 'low' ? ' ↓' : f === 'high' ? ' ↑' : f === 'critical' ? ' ‼' : f === 'abnormal' ? ' *' : ''
export function ValuesTable({ values }: { values: Value[] }) {
  return <table className="font-mono text-[12px]"><tbody>{values.map((v, i) => <tr key={i} className={flagClass(v.flag)}>
    <td className="pr-3 text-neutral-600">{v.name}</td><td className="pr-1 text-right">{v.value_number ?? v.value_text ?? ''}{arrow(v.flag)}</td><td className="pr-3 text-neutral-400">{v.unit ?? ''}</td>
    <td className="text-neutral-400">{v.reference_low != null || v.reference_high != null ? `${v.reference_low ?? ''}–${v.reference_high ?? ''}` : ''}</td></tr>)}</tbody></table>
}
export function FallbackFull({ data }: { card: Card; data: Record<string, unknown> }) {
  const values = (data.values as Value[] | undefined) ?? []
  const text = data.text as string | undefined
  const rest = Object.fromEntries(Object.entries(data).filter(([k]) => !['values', 'text', 'author_name', 'department_name', 'service', 'to_department_name'].includes(k)))
  return <div className="grid gap-2">
    {text && <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>}
    {values.length > 0 && <ValuesTable values={values} />}
    {Object.keys(rest).length > 0 && <pre className="overflow-x-auto rounded bg-neutral-50 p-2 font-mono text-[11px] text-neutral-600">{JSON.stringify(rest, null, 1)}</pre>}
  </div>
}
export function CardLine({ card }: { card: Card }) {
  const R = rendererFor(card.type)?.Card
  if (R) return <R card={card} />
  const r = card.request
  return <div className="flex items-start gap-3 text-sm">
    <span className="w-14 shrink-0 font-mono text-[11px] text-neutral-400">{card.occurred_at.slice(11, 16)}</span>
    <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-wider text-neutral-500">{card.type.replace('_', ' ')}</span>
    <span className="min-w-0 flex-1">
      <span className={card.replaced_by_id ? 'text-neutral-400 line-through' : ''}>{card.display_line}</span>
      {r && <span className="ml-2 text-xs text-neutral-500">→ {r.to_department_name ?? 'outside'} · <span className={r.status === 'open' ? 'text-amber-700' : ''}>{r.step}</span></span>}
      {r?.reply_line && <span className={`mt-0.5 block text-xs ${flagClass(r.reply_flag)}`}>{r.reply_line}</span>}
      {!card.is_final && <span className="ml-2 text-[10px] uppercase text-neutral-400">preliminary</span>}
    </span>
    <span className="shrink-0 text-[11px] text-neutral-400">{card.author_name}</span>
  </div>
}
