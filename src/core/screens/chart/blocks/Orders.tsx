// A set's orders as one requisition (chart-plan.md §1.3, design-system.md §4.5): per order the service, where it went, the priority,
// the question in quotes, its progress along the service's own steps (Sent → Collected → Received → Resulted, the reached ones
// filled), held, cancelled or failed with why, and each answer as one line under it (a result's values in short, flagged, or a
// reply's first line); an answer opens its entry.
import type { EntryData } from '../../../db/shapes.generated'
import type { ServerEntry, Service } from '../../../db/types'
import { dataOf, interp } from '../../../db/views'
import { Steps, TONE, Tag, cn, flagTone, interpMark, type Step } from '../../../ui'
import type { ChartItem } from '../model/items'
import { FINAL_STEP, ORDER_STATUS, stepWord } from '../model/labels'
import { ItemFrame } from './Item'
import { placeName, useBlockEnv, type BlockEnv, type GroupProps } from './env'

const STOPPED = new Set(['revoked', 'rejected', 'cancelled', 'failed'])
const PRIORITY = { urgent: ['danger', 'Urgent'], stat: ['danger', 'Stat'], asap: ['warn', 'As soon as possible'] } as const

export function Orders({ items }: GroupProps) {
  return <div className="grid gap-2">{items.map((i) => { const p = (i.entry.data as EntryData['order'] | undefined)?.priority
    const pr = p && p !== 'routine' ? PRIORITY[p] : null
    return <ItemFrame key={i.id} item={i} tags={pr && <Tag tone={pr[0]}>{pr[1]}</Tag>}><OrderLine item={i} /></ItemFrame> })}</div>
}

/** the service's steps, with the reached ones done and the one it stands at now current; the answer is the last step */
function stepsOf(item: ChartItem, svc: Service | undefined): Step[] {
  const o = item.order; const row = o?.row; const status = row?.status ?? (item.entry.data as EntryData['order'] | undefined)?.status ?? 'active'
  const at = new Map<string, string>()
  // each step at its clinical time (occurred_at), as base.orders times the order and its answer
  if (!item.draft) at.set('sent', row?.ordered_at ?? item.entry.occurred_at)
  for (const s of o?.steps ?? []) { const k = s.data?.step as string | undefined; if (k) at.set(k, s.occurred_at) }
  const answered = row?.answered_at ?? o?.answers[0]?.occurred_at ?? null
  const done = !!row?.final || status === 'completed'
  const keys = ['sent', ...(svc?.steps ?? o?.stepKeys ?? []), 'answer']
  if (answered) at.set('answer', answered)
  const last = Math.max(...keys.map((k, i) => at.has(k) ? i : -1))
  const steps: Step[] = keys.map((k, i) => ({ key: k, label: k === 'answer' ? (answered && !done ? 'Preliminary' : FINAL_STEP[svc?.reply_type ?? ''] ?? 'Done') : stepWord(k), at: at.get(k) ?? null,
    state: done || i < last ? 'done' : i === last && !STOPPED.has(status) ? 'current' : 'todo' }))
  return STOPPED.has(status) ? [...steps.filter((s) => s.state !== 'todo'), { key: 'stopped', label: ORDER_STATUS[status] ?? status, at: row?.last_at ?? null, state: 'failed' }] : steps
}

function OrderLine({ item }: { item: ChartItem }) {
  const env = useBlockEnv(); const d = item.entry.data as EntryData['order'] | undefined
  if (!d?.service) return <p className="text-13 text-muted">{item.entry.line}</p>
  const row = item.order?.row; const svc = env.org?.services.find((s) => s.id === (row?.service_id ?? d.service.id))
  const to = placeName(env, row?.to_department_id ?? d.department_id); const status = row?.status ?? d.status
  const why = [...(item.order?.steps ?? [])].reverse().find((s) => s.data?.reason)?.data?.reason as string | undefined
  return <div className="grid gap-1">
    <p className="flex flex-wrap items-baseline gap-x-1.5"><span className="text-14 font-medium text-fg">{d.service.name}</span>{to && <span className="text-13 text-muted">to {to}</span>}</p>
    {(d.question || d.reason) && <p className="text-13 text-muted">“{d.question ?? d.reason}”</p>}
    <Steps dense={env.compact} steps={stepsOf(item, svc)} />
    {status === 'on-hold' && <p className="text-13 text-warn">{ORDER_STATUS['on-hold']}{why ? `: ${why}` : ''}</p>}
    {STOPPED.has(status) && why && <p className="text-13 text-muted">Why: {why}</p>}
    {(item.order?.answers ?? []).map((a) => <Answer key={a.id} entry={a} env={env} />)}
  </div>
}

/** an answer in one line: a result's values in short with their flags (a glyph with the colour), a reply's first line */
function Answer({ entry, env }: { entry: ServerEntry; env: BlockEnv }) {
  const r = dataOf(entry, 'result', env.org?.types)
  const body = entry.hidden ? <span className="italic text-faint">{entry.line}</span> : r ? <>{(r.analytes ?? []).slice(0, 4).map((a, i) => { const f = interp(a.interpretation)
    const flagged = !!f && f !== 'normal'
    return <span key={a.key} className={cn(flagged && cn('font-medium', TONE[flagTone(f)].text))}>{i > 0 && <span className="text-faint"> · </span>}{a.name ?? a.concept?.text ?? a.key} {a.value?.value ?? a.text}
      {a.value?.unit && <span className="text-faint"> {a.value.unit}</span>}{interpMark(a.interpretation) && ` ${interpMark(a.interpretation)}`}</span> })}
    {(r.analytes ?? []).length > 4 && <span className="text-faint"> · {r.analytes!.length - 4} more</span>}
    {!(r.analytes ?? []).length && (r.conclusion?.split('\n')[0] ?? entry.line)}
    {r.status === 'preliminary' && <span className="text-warn"> · preliminary</span>}</> : String(entry.data?.text ?? entry.line).split('\n')[0]
  const line = <><span aria-hidden className="text-faint">↳ </span>{body}</>
  return env.onOpen ? <button type="button" onClick={() => env.onOpen!(entry.id)} className="block w-fit max-w-full rounded-sm text-start text-13 text-fg tnum hover:underline focus-ring">{line}</button>
    : <p className="text-13 text-fg tnum">{line}</p>
}
