// The pharmacy pack's client (spec/openCare.md §5): dispensing is one click. A medication the doctor sent is an order to the pharmacy;
// its Dispensing screen, in place of the bench, shows what to give (the pack's own table, pharmacy.queue). Give all writes
// pharmacy.dispense — the pack's type that extends the base's step — straight from the medication. Not given takes a one-word reason.
// Its section in the chart (Pharmacy) lists what was dispensed; its banner word and its row mark say what waits to be collected.
import { registerRenderer, registerReplyForm } from '@core/renderers'
import { registerScreen } from '@core/screens/registry'
import { ANYONE, registerSection } from '@core/screens/chart/sections'
import type { RequestQueueRow } from '@core/db/types'
import { Chip, Field, Input, KV, Tag } from '@core/ui'
import { Dispensing } from './Dispensing'
import { registerBannerWords } from '@core/screens/chart/words'
import { registerRowMark } from '@core/screens/marks'
import { collectMark, collectWords, suppliedLine, suppliedOf, suppliedWord } from './dispensed'
import { Supplied } from './Section'

interface Dispense { given: boolean; reason: string }
const PER_DAY: Record<string, number> = { OD: 1, BD: 2, TDS: 3, QDS: 4, q4h: 6, q6h: 4, q8h: 3, q12h: 2, once: 1, stat: 1 }
const WHY_NOT = ['Out of stock', 'Patient declined', 'Interaction', 'Buys outside']

/** what was prescribed, as given: the drug, its dose, and a quantity from frequency × days when both are known */
function asGiven(r: RequestQueueRow) {
  const d = (r.details ?? {}) as { drug?: { name?: string }; dose?: string; frequency?: string; duration_days?: number; quantity?: string }
  if (!d.drug?.name) return null   // the pharmacy's list has not caught up with this prescription yet: nothing to give by name
  const perDay = d.frequency ? PER_DAY[d.frequency] : undefined
  const quantity = d.quantity ? Number(d.quantity) : perDay && d.duration_days ? Math.ceil(perDay * d.duration_days) : null
  const [dose, unit] = (d.dose ?? '').split(' ')
  return { drug: { text: d.drug.name }, ...(dose ? { dose: { value: dose, unit: unit || undefined } } : {}), quantity: { value: String(quantity ?? 1), unit: 'tablets', ucum: '{tbl}' } }
}

/** given, or not and why: the kit's chips (solid, one choice) and a field for a reason of its own (design-system.md §6.2) */
function GivenOrNot({ request, value, onChange }: { request: RequestQueueRow; value: Dispense | undefined; onChange: (v: Dispense) => void }) {
  const v = value ?? { given: true, reason: '' }
  return <div className="grid gap-2">
    <p className="text-14 font-medium text-fg">{request.display_line}</p>
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip on={v.given} onClick={() => onChange({ given: true, reason: '' })}>Given</Chip>
      <Chip on={!v.given} onClick={() => onChange({ given: false, reason: v.reason })}>Not given</Chip>
      {!v.given && WHY_NOT.map((w) => <Chip key={w} on={v.reason === w} onClick={() => onChange({ given: false, reason: w })}>{w}</Chip>)}
    </div>
    {!v.given && <Field label="Or say why" className="max-w-sm"><Input data-v dense value={v.reason} onChange={(e) => onChange({ given: false, reason: e.target.value })} /></Field>}
  </div>
}

registerReplyForm<Dispense>('pharmacy.dispense', {
  action: 'write:pharmacy.dispense',
  automatic: true,                      // a prescription the doctor sends; nobody orders dispensing by hand
  quick: 'Give all',
  Editor: GivenOrNot,
  toWrite: (r, value) => {
    const v = value ?? { given: true, reason: '' }
    if (!v.given) return v.reason.trim() ? { type: 'pharmacy.dispense', data: { status: 'cancelled', reason: v.reason.trim() } } : null
    const item = asGiven(r)
    return item ? { type: 'pharmacy.dispense', data: { status: 'completed', pharmacy: { items: [item] } } } : null
  },
})
// its one screen for the work sent to it, in place of the bench (declared pharmacy.dispensing, replaces base.bench)
registerScreen('pharmacy.dispensing', Dispensing)
// its section in the chart: for anyone, shown in a department that uses the pack and wherever the patient has dispenses
registerSection({ key: 'pharmacy.dispensed', title: 'Pharmacy', types: ['pharmacy.dispense'], fit: ANYONE, Body: Supplied,
  word: (x) => suppliedWord(suppliedOf(x.own)), summary: (x) => suppliedLine(suppliedOf(x.own, x.rec)) })
// its banner word, only where the department uses the pharmacy: a supply prepared and waiting, "1 to collect"
registerBannerWords({ key: 'pharmacy.collect', types: ['pharmacy.dispense'], words: (x) => collectWords(suppliedOf(x.own)) })
// its mark on the clinic queue where the department uses the pharmacy, for whoever reads its orders: a prescription prepared, "Rx to collect"
registerRowMark('pharmacy', collectMark)
type Given = { drug: { text: string }; dose?: { value: string; unit?: string }; quantity?: { value: string } }
const amount = (i: Given) => [`${i.dose?.value ?? ''}${i.dose?.unit ? ` ${i.dose.unit}` : ''}`.trim(), i.quantity && `× ${i.quantity.value}`].filter(Boolean).join(' ')
// the dispense in the record, with no colour of its own: a word for the state (Given ok, Not given warn), the lines as label and value
registerRenderer('pharmacy.dispense', {
  Full: ({ data }) => { const items = ((data.pharmacy as { items?: Given[] } | undefined)?.items) ?? []
    return <div className="grid gap-1.5 text-13">{data.status === 'cancelled' ? <p><Tag tone="warn">Not given</Tag> <span className="text-muted">{String(data.reason ?? '')}</span></p>
      : <><p><Tag tone="ok">Given</Tag></p><KV dense items={items.map((i) => [i.drug.text, amount(i)])} /></>}
      {typeof data.note === 'string' && data.note && <p className="text-muted">{data.note}</p>}</div> },
})
export const key = 'pharmacy'
