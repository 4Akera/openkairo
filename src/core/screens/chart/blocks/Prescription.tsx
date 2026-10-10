// A set's medicines as one prescription (chart-plan.md §1.3, design-system.md §4.5): the ℞ mark; per drug its name and strength,
// the sig in plain words (1 tablet by mouth, twice a day, 30 days · 30 tablets), what it is for, a change as "500 mg BD → 1 g BD"
// (the version before), a stop with its reason; where it was sent on, from the order about it in the same set, in the words of the pack
// that answers it (visit/send.ts: Sent, given at 12:40, not given), and, while its order is open and a pack holds it waiting, that
// pack's word in its tone (spec §5.4: "Waiting for payment" for a department's own lines; owner, 2026-10-08: the word only). A reported
// medicine says so and carries no ℞. In the chart, a prescription written in a visit prints on A5 for the patient to take away
// (§3.13 Printing, owner 2026-10-08): Print prescription, and P for this visit's newest; the sheet says what the block says, with the
// directions in Arabic and no price.
import { useContext } from 'react'
import type { EntryData } from '../../../db/shapes.generated'
import { PrintButton, usePrint } from '../../../print'
import { purposeFor } from '../../../hooks/reads'
import { ChartContext, type Chart } from '../context'
import { newestRxSet, prescriptionOf, sigOf, type RxSheet } from '../model/prescription'
import { stepOf } from '../../../db/views'
import { Tag, hm } from '../../../ui'
import type { ChartItem } from '../model/items'
import { MED_STATUS, stepWord } from '../model/labels'
import { changeText, doseText, medLine } from '../model/record'
import { sendWordsOf } from '../../visit/send'
import { ItemFrame } from './Item'
import { itemName, useBlockEnv, type GroupProps } from './env'

const med = (i: ChartItem) => i.entry.data as EntryData['medication'] | undefined
const ENDED = new Set(['stopped', 'completed'])

export function Prescription({ items }: GroupProps) {
  const meds = items.filter((i) => i.family === 'medication'); const orders = items.filter((i) => i.family === 'order')
  // the order about a medicine, sending it on: through base.orders once signed, through its own link while a draft
  const orderFor = (m: ChartItem) => orders.find((o) => o.order?.row?.about_item === m.item || (o.entry.relation === 'about' && (o.entry.refers_to === m.entry.id || o.entry.refers_to === m.item)))
  const loose = orders.filter((o) => !meds.some((m) => orderFor(m) === o))
  const prescribed = meds.some((m) => med(m)?.basis !== 'reported')
  const env = useBlockEnv(); const chart = useContext(ChartContext)
  const rx = chart && !env.sample && !env.compact ? prescriptionOf(meds, { org: env.org, patient: { full_name: chart.r.identity.full_name, age: chart.r.patient.age, born_on: chart.r.patient.born_on,
    sex: chart.r.patient.sex, number: chart.r.patient.record_number } }) : null
  return <div className="flex gap-3">
    {prescribed && <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-16 font-semibold text-accent">℞</span>}
    <div className="grid min-w-0 flex-1 gap-1">
      {meds.map((m) => <ItemFrame key={m.id} item={m} tags={<SentOn med={m} order={orderFor(m)} />}><MedLine item={m} /></ItemFrame>)}
      {loose.map((o) => <ItemFrame key={o.id} item={o}><p className="text-13 text-muted">{o.entry.line}</p></ItemFrame>)}
      {rx && chart && <PrintRx rx={rx} chart={chart} />}
    </div>
  </div>
}

/** Print prescription (A5), and P where it is this visit's newest; the print of the patient's prescription is logged like a read, under
 *  the purpose the chart's own reads carry (break the glass with its reason, while the record is opened that way) */
function PrintRx({ rx, chart: c }: { rx: RxSheet; chart: Chart }) {
  const print = usePrint(); const env = useBlockEnv()
  const newest = newestRxSet(c.r.server.entries, c.encounter?.id, env.org?.types) === rx.set
  return <PrintButton className="justify-self-start" size="sm" variant="ghost" label="Print prescription" keyed={newest}
    print={() => print({ key: 'base.prescription', data: rx, thing: rx.set, patientId: c.patientId, departmentId: c.departmentId, ...purposeFor(c.patientId) })} />
}

function MedLine({ item }: { item: ChartItem }) {
  const env = useBlockEnv(); const d = med(item)
  if (!d?.drug) return <p className="text-13 text-muted">{item.entry.line}</p>
  const l = medLine(d); const ended = ENDED.has(d.status)
  const was = [...item.versions].reverse().map((v) => v.data as EntryData['medication'] | undefined).find((x) => x?.drug)
  const change = was && !ended ? changeText(medLine(was), l) : null
  const repeat = !!was && !ended && !change && doseText(medLine(was)) === doseText(l)
  const sig = sigOf(l)
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

/** the medicine's state at the end of its line: stopped, or where it was sent has got to, in that pack's words */
function SentOn({ med: m, order }: { med: ChartItem; order: ChartItem | undefined }) {
  const env = useBlockEnv(); const d = med(m)
  if (d && ENDED.has(d.status)) return <Tag tone="danger">{MED_STATUS[d.status]}{d.status_reason ? `: ${d.status_reason}` : ''}</Tag>
  if (!order) return null
  const row = order.order?.row
  const w = sendWordsOf(env.org, row?.service_id ?? (order.entry.data as EntryData['order'] | undefined)?.service?.id)
  // the answer (a step of the pack's own type): given, or not and why
  const last = [...(order.order?.steps ?? []), ...(order.order?.answers ?? [])].filter((e) => !e.hidden && (e.data?.status === 'completed' || e.data?.status === 'cancelled')).at(-1)
  if (last?.data?.status === 'cancelled') return <Tag tone="warn">{w.notDone}{last.data.reason ? `: ${String(last.data.reason)}` : ''}</Tag>
  if (last || row?.status === 'completed') return <Tag tone="ok">{w.done} {hm(last?.occurred_at ?? row?.answered_at ?? row!.last_at)}</Tag>
  if (!row) return <Tag tone="info">{order.draft ? w.draft : w.sent}</Tag>
  if (['revoked', 'rejected', 'cancelled', 'failed'].includes(row.status)) return <Tag tone="warn">{w.stopped}</Tag>
  const step = stepOf(row); const wait = env.waitOf?.(row.item, row.status) ?? null
  return <><Tag tone="info">{step === 'sent' ? w.sent : w.at(stepWord(step).toLowerCase())}</Tag>{wait && <Tag tone={wait.tone ?? 'warn'}>{wait.word}</Tag>}</>
}
