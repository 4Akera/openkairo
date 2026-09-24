// Every screen renders every type (spec 05): a card per entry from display_line, values and text; packs may register richer ones.
import { Fragment, type ComponentType } from 'react'
import type { Card, Value } from '../db/types'
import { flagClass } from '../ui'
export interface Renderer { Card?: ComponentType<{ card: Card }>; Full?: ComponentType<{ card: Card; data: Record<string, unknown> }> }
const registry = new Map<string, Renderer>()
export const registerRenderer = (type: string, r: Renderer) => registry.set(type, r)
export const rendererFor = (type: string) => registry.get(type)

/** Request steps belong to packs (spec 06, amendments 2026-09-23 · 4): a pack registers the step buttons its departments show on the bench.
 *  Core registers none — a request goes from new to released. A step never closes a request; only a reply or a cancel does. */
export interface BenchStep { step: string; label: string; from: string[] }
const benchSteps = new Map<string, BenchStep[]>()
export const registerBenchSteps = (departmentType: string, steps: BenchStep[]) => benchSteps.set(departmentType, steps)
export const benchStepsFor = (departmentType: string) => benchSteps.get(departmentType) ?? []

const arrow = (f: string | null | undefined) => f === 'low' ? ' ↓' : f === 'high' ? ' ↑' : f === 'critical' ? ' ‼' : f === 'abnormal' ? ' *' : ''
export function ValuesTable({ values }: { values: Value[] }) {
  return <table className="text-[12.5px]"><tbody>{values.map((v, i) => <tr key={i} className={flagClass(v.flag)}>
    <td className="pr-3 text-neutral-600">{v.name}</td><td className="pr-1 text-right">{v.value_number ?? v.value_text ?? ''}{arrow(v.flag)}</td><td className="pr-3 text-neutral-400">{v.unit ?? ''}</td>
    <td className="text-neutral-400">{v.reference_low != null || v.reference_high != null ? `${v.reference_low ?? ''}–${v.reference_high ?? ''}` : ''}</td></tr>)}</tbody></table>
}
const empty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)
/** any stored value as words: names of named things, lists joined, objects as "key value" */
function show(v: unknown): string {
  if (Array.isArray(v)) return v.map(show).join(', ')
  if (v && typeof v === 'object') { const o = v as Record<string, unknown>; return String(o.name ?? o.display ?? Object.entries(o).filter(([, x]) => !empty(x)).map(([k, x]) => `${k.replace(/_/g, ' ')} ${show(x)}`).join(' · ')) }
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  return String(v)
}
export function FallbackFull({ data }: { card: Card; data: Record<string, unknown> }) {
  const values = (data.values as Value[] | undefined) ?? []
  const text = data.text as string | undefined
  const rest = Object.fromEntries(Object.entries(data).filter(([k, v]) => !['values', 'text', 'author_name', 'department_name', 'service', 'to_department_name', 'responsible_name', 'written_with_id'].includes(k) && !empty(v)))
  return <div className="grid gap-2">
    {text && <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>}
    {values.length > 0 && <ValuesTable values={values} />}
    {Object.keys(rest).length > 0 && <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-[13px]">{Object.entries(rest).map(([k, v]) => <Fragment key={k}>
      <dt className="text-neutral-500">{k.replace(/_text$|_on$|_id$/, '').replace(/_/g, ' ')}</dt><dd className="text-neutral-800">{show(v)}</dd></Fragment>)}</dl>}
  </div>
}
const TYPE_TONE: Record<string, string> = { note: 'bg-neutral-100 text-neutral-700', vitals: 'bg-sky-50 text-sky-800', request: 'bg-amber-50 text-amber-800', result: 'bg-violet-50 text-violet-800',
  prescription: 'bg-teal-50 text-teal-800', problem: 'bg-teal-50 text-teal-800', allergy: 'bg-red-50 text-red-700', list_review: 'bg-neutral-50 text-neutral-500', entered_in_error: 'bg-neutral-50 text-neutral-500' }
export function CardLine({ card }: { card: Card }) {
  const R = rendererFor(card.type)?.Card
  if (R) return <R card={card} />
  const r = card.request
  return <div className="flex items-start gap-3 text-[13.5px]">
    <span className="w-10 shrink-0 pt-px text-xs text-neutral-400 tnum">{card.occurred_at.slice(11, 16)}</span>
    <span className={`w-[5.5rem] shrink-0 rounded-md px-1.5 py-px text-center text-[10.5px] font-medium ${TYPE_TONE[card.type] ?? 'bg-neutral-100 text-neutral-700'}`}>{card.type.replace(/_/g, ' ')}</span>
    <span className="min-w-0 flex-1">
      <span className={card.replaced_by_id ? 'text-neutral-400 line-through' : 'text-neutral-900'}>{card.display_line}</span>
      {!card.is_final && <span className="ml-2 text-[10.5px] font-medium uppercase text-amber-700">preliminary</span>}
      {r && <span className="ml-2 text-xs text-neutral-500">→ {r.to_department_name ?? 'outside'} · <span className={r.status === 'open' ? 'font-medium text-amber-700' : r.status === 'cancelled' ? 'text-neutral-400' : 'text-teal-700'}>{r.step}</span></span>}
      {r?.reply_line && <span className={`mt-0.5 block text-xs tnum ${r.reply_flag && r.reply_flag !== 'normal' ? flagClass(r.reply_flag) : 'text-neutral-600'}`}>↳ {r.reply_line}</span>}
    </span>
    <span className="shrink-0 text-[11px] text-neutral-400">{card.author_name}</span>
  </div>
}
