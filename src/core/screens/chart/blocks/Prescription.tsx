// A set's medicines as one prescription (chart-plan.md §1.3, design-system.md §4.5): the ℞ mark; per drug its name and strength,
// the sig in plain words (1 tablet by mouth, twice a day, 30 days · 30 tablets), what it is for, a change as "500 mg BD → 1 g BD"
// (the version before), a stop with its reason; the pharmacy's state from the dispense order in the same set (Sent, Dispensed 12:40,
// Not given). A reported medicine says so and carries no ℞.
import type { EntryData } from '../../../db/shapes.generated'
import { stepOf } from '../../../db/views'
import { Tag, hm } from '../../../ui'
import type { ChartItem } from '../model/items'
import { MED_STATUS, stepWord } from '../model/labels'
import { changeText, doseText, medLine } from '../model/record'
import { ItemFrame } from './Item'
import { itemName, useBlockEnv, type GroupProps } from './env'

const med = (i: ChartItem) => i.entry.data as EntryData['medication'] | undefined
const ENDED = new Set(['stopped', 'completed'])

export function Prescription({ items }: GroupProps) {
  const meds = items.filter((i) => i.family === 'medication'); const orders = items.filter((i) => i.family === 'order')
  // the dispense order about a medicine: through base.orders once signed, through its own link while a draft
  const orderFor = (m: ChartItem) => orders.find((o) => o.order?.row?.about_item === m.item || (o.entry.relation === 'about' && (o.entry.refers_to === m.entry.id || o.entry.refers_to === m.item)))
  const loose = orders.filter((o) => !meds.some((m) => orderFor(m) === o))
  const prescribed = meds.some((m) => med(m)?.basis !== 'reported')
  return <div className="flex gap-3">
    {prescribed && <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-16 font-semibold text-accent">℞</span>}
    <div className="grid min-w-0 flex-1 gap-1">
      {meds.map((m) => <ItemFrame key={m.id} item={m} tags={<Pharmacy med={m} order={orderFor(m)} />}><MedLine item={m} /></ItemFrame>)}
      {loose.map((o) => <ItemFrame key={o.id} item={o}><p className="text-13 text-muted">{o.entry.line}</p></ItemFrame>)}
    </div>
  </div>
}

function MedLine({ item }: { item: ChartItem }) {
  const env = useBlockEnv(); const d = med(item)
  if (!d?.drug) return <p className="text-13 text-muted">{item.entry.line}</p>
  const l = medLine(d); const ended = ENDED.has(d.status)
  const was = [...item.versions].reverse().map((v) => v.data as EntryData['medication'] | undefined).find((x) => x?.drug)
  const change = was && !ended ? changeText(medLine(was), l) : null
  const repeat = !!was && !ended && !change && doseText(medLine(was)) === doseText(l)
  const sig = [[l.dose, l.route_words, l.frequency_words, l.prn].filter(Boolean).join(', '), l.days ? `${l.days} days` : null].filter(Boolean).join(', ')
  const reasons = (d.reasons ?? []).map((r) => r.display ?? itemName(env, r.id)).filter(Boolean)
  return <div>
    <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span className="text-14 font-semibold text-fg">{l.drug}{l.strength && ` ${l.strength}`}</span>
      {d.basis === 'reported' && <Tag>Takes (reported)</Tag>}{d.status === 'on-hold' && <Tag tone="warn">{MED_STATUS['on-hold']}</Tag>}{repeat && <Tag>Repeat</Tag>}
    </p>
    {!ended && (change || sig) && <p className="text-13 text-muted tnum">{change ?? sig}{l.quantity && ` · ${l.quantity}`}</p>}
    {reasons.length > 0 && <p className="text-13 text-muted">for <span className="font-medium text-accent">{reasons.join(', ')}</span></p>}
    {l.instructions && <p className="text-12 text-faint">{l.instructions}</p>}
  </div>
}

/** the medicine's state at the end of its line: stopped, or where the pharmacy has got to */
function Pharmacy({ med: m, order }: { med: ChartItem; order: ChartItem | undefined }) {
  const d = med(m)
  if (d && ENDED.has(d.status)) return <Tag tone="danger">{MED_STATUS[d.status]}{d.status_reason ? `: ${d.status_reason}` : ''}</Tag>
  if (!order) return null
  const row = order.order?.row
  // the pharmacy's answer (a step of its own type): given, or not and why
  const last = [...(order.order?.steps ?? []), ...(order.order?.answers ?? [])].filter((e) => !e.hidden && (e.data?.status === 'completed' || e.data?.status === 'cancelled')).at(-1)
  if (last?.data?.status === 'cancelled') return <Tag tone="warn">Not given{last.data.reason ? `: ${String(last.data.reason)}` : ''}</Tag>
  if (last || row?.status === 'completed') return <Tag tone="ok">Dispensed {hm(last?.recorded_at ?? row?.answered_at ?? row!.last_at)}</Tag>
  if (!row) return <Tag tone="info">{order.draft ? 'To the pharmacy' : 'Sent to the pharmacy'}</Tag>
  if (['revoked', 'rejected', 'cancelled', 'failed'].includes(row.status)) return <Tag tone="warn">Not dispensed</Tag>
  const step = stepOf(row)
  return <Tag tone="info">{step === 'sent' ? 'Sent to the pharmacy' : `Pharmacy: ${stepWord(step).toLowerCase()}`}</Tag>
}
