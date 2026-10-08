// A part of the WHO checklist in the record (the chart's Whole record): what was said and who said it, the counts, the implants and the
// specimen; not the ids it is about (the entry's shell draws who signed it and when).
import { KV, Tag } from '@core/ui'
import { PARTS } from './model'

type Said = { text: string; done: boolean; who?: string; not?: string }
type Count = { what: string; before?: number; added?: number; after?: number }
type Implant = { what: string; lot?: string; left_in?: number; used?: number }
const counted = (c: Count) => c.after != null && c.after === (c.before ?? 0) + (c.added ?? 0)

export function CheckView({ data }: { data: Record<string, unknown> }) {
  const part = PARTS.find(([k]) => k === data.part)
  const items = (data.items ?? []) as Said[]; const counts = (data.counts ?? []) as Count[]; const implants = (data.implants ?? []) as Implant[]
  const missed = items.filter((i) => !i.done).length + counts.filter((c) => !counted(c)).length
  const by = (data.by ?? []) as string[]
  return <div className="grid gap-1.5 text-13">
    <p className="flex flex-wrap items-center gap-2"><b className="font-semibold text-fg">{part?.[1] ?? String(data.part ?? '')}</b><span className="text-muted">{part?.[2]}</span>
      {missed ? <Tag tone="warn">{missed} not done</Tag> : <Tag tone="ok">all said</Tag>}</p>
    <ul className="grid gap-0.5">{items.map((i, n) => <li key={n} className={i.done ? 'text-fg' : 'text-warn'}>{i.done ? '✓' : '✗'} {i.text}
      {i.who && <span className="text-muted"> · {i.who}</span>}{i.not && <span className="text-muted"> · {i.not}</span>}</li>)}</ul>
    {(counts.length > 0 || implants.length > 0 || typeof data.specimen === 'string' || by.length > 0) && <KV dense items={[
      ...counts.map((c): [string, React.ReactNode] => [c.what, <span key={c.what} className={counted(c) ? undefined : 'text-warn'}>{c.before ?? 0}{c.added ? ` + ${c.added}` : ''} → {c.after ?? '?'}{counted(c) ? ' · correct' : ' · not correct'}</span>]),
      ...implants.map((i): [string, React.ReactNode] => ['Implant', [i.what, i.lot && `lot ${i.lot}`, i.left_in != null && `${i.left_in} left in`].filter(Boolean).join(' · ')]),
      ...(typeof data.specimen === 'string' ? [['Specimen', data.specimen || 'none sent'] as [string, React.ReactNode]] : []),
      ...(by.length ? [['Said by', by.join(', ')] as [string, React.ReactNode]] : [])]} />}
    {typeof data.note === 'string' && data.note && <p className="text-muted">{data.note}</p>}
  </div>
}
