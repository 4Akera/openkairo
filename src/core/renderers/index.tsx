// Every screen renders every type (spec 05): a card per entry from display_line, values and text; packs may register richer ones.
import type { ComponentType } from 'react'
import type { Card, RequestQueueRow, Value } from '../db/types'
import type { EntryBody } from '../db/rpc'
import { useOrganization } from '../hooks/organization'
import { AnalyteTable, KV, Tag, flagClass, hm } from '../ui'
export interface Renderer { Card?: ComponentType<{ card: Card }>; Full?: ComponentType<{ card: Card; data: Record<string, unknown> }> }
const registry = new Map<string, Renderer>()
export const registerRenderer = (type: string, r: Renderer) => registry.set(type, r)
export const rendererFor = (type: string) => registry.get(type)

/** a pack's words for its bench: "To give" · "Given today" in place of "To collect" · "Done today" */
export interface BenchWords { todo?: string; done?: string }
const benchWords = new Map<string, BenchWords>()
export const registerBenchWords = (departmentType: string, words: BenchWords) => benchWords.set(departmentType, words)
export const benchWordsFor = (departmentType: string): BenchWords => benchWords.get(departmentType) ?? {}

/** A pack's answer form for the answer type of a service (spec/openCare.md §5): the bench shows it in place of the value grid and writes
 *  what toWrite returns in the same set as every other answer. The client fills the id, patient, department and the link to the order. */
export interface ReplyForm<V = unknown> {
  action: string                                                       // the action the writer needs, e.g. write:pharmacy.dispense
  Editor: ComponentType<{ request: RequestQueueRow; value: V | undefined; onChange: (v: V) => void }>
  toWrite: (request: RequestQueueRow, value: V | undefined) => EntryBody | null   // a type and its data, in that type's declared shape
  automatic?: boolean                                                  // its requests come from another write (dispensing, from a prescription): not ordered by hand
  quick?: string                                                       // a one-click release on the bench row ("Give all"): toWrite(request, undefined) for each
}
const replyForms = new Map<string, ReplyForm<never>>()
export const registerReplyForm = <V,>(replyType: string, form: ReplyForm<V>) => { replyForms.set(replyType, form as unknown as ReplyForm<never>) }
export const replyFormFor = (replyType: string | null | undefined): ReplyForm<unknown> | undefined => (replyType ? replyForms.get(replyType) as unknown as ReplyForm<unknown> : undefined)

/** a result's values: the kit's table, where a flag is never shown by colour alone (a glyph, and the word for screen readers) */
export const ValuesTable = ({ values }: { values: Value[] }) => <AnalyteTable dense rows={values.map((v) => ({ name: v.name, value: v.value_number ?? v.value_text ?? '', unit: v.unit,
  flag: v.flag, low: v.reference_low, high: v.reference_high }))} />
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
    {text && <p className="whitespace-pre-wrap text-14 leading-relaxed">{text}</p>}
    {values.length > 0 && <ValuesTable values={values} />}
    {Object.keys(rest).length > 0 && <KV items={Object.entries(rest).map(([k, v]) => [k.replace(/_text$|_on$|_id$/, '').replace(/_/g, ' '), show(v)])} />}
  </div>
}
// the type in the registry's plain words, on a neutral tag: a family is told by a word, colour is for state (build plan D4)
export function CardLine({ card }: { card: Card }) {
  const types = useOrganization().data?.types
  const R = rendererFor(card.type)?.Card
  if (R) return <R card={card} />
  const r = card.request
  const label = types?.find((t) => t.key === card.type)?.labels.en ?? card.type.replace(/_/g, ' ')
  return <div className="flex items-start gap-3 text-13">
    <span className="w-10 shrink-0 pt-px text-12 text-faint tnum">{hm(card.occurred_at)}</span>
    <Tag className="w-[5.5rem] justify-center">{label}</Tag>
    <span className="min-w-0 flex-1">
      <span className={card.replaced_by_id ? 'text-faint line-through' : 'text-fg'}>{card.display_line}</span>
      {!card.is_final && <span className="ms-2 text-11 font-medium uppercase text-warn">preliminary</span>}
      {r && <span className="ms-2 text-12 text-faint">→ {r.to_department_name ?? 'outside'} · <span className={r.status === 'open' ? 'font-medium text-warn' : r.status === 'cancelled' ? 'text-faint' : 'text-accent'}>{r.step}</span></span>}
      {r?.reply_line && <span className={`mt-0.5 block text-12 tnum ${r.reply_flag && r.reply_flag !== 'normal' ? flagClass(r.reply_flag) : 'text-muted'}`}>↳ {r.reply_line}</span>}
    </span>
    <span className="shrink-0 text-11 text-faint">{card.author_name}</span>
  </div>
}
