// The pharmacy pack's client (spec/openCare.md §5): dispensing is one click. A medication the doctor sent is an order to the pharmacy;
// its bench shows what to give (the pack's own table, pharmacy.queue). Give all writes pharmacy.dispense — the pack's type that
// extends the base's step — straight from the medication. Not given takes a one-word reason.
import { registerBenchWords, registerRenderer, registerReplyForm } from '@core/renderers'
import type { RequestQueueRow } from '@core/db/types'
import { Input, cn } from '@core/ui'

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

function GivenOrNot({ request, value, onChange }: { request: RequestQueueRow; value: Dispense | undefined; onChange: (v: Dispense) => void }) {
  const v = value ?? { given: true, reason: '' }
  const chip = (on: boolean) => cn('rounded-md px-2.5 py-1 text-xs ring-1 ring-inset', on ? 'bg-teal-800 text-white ring-teal-800' : 'bg-white text-neutral-600 ring-neutral-200 hover:ring-neutral-400')
  return <div className="grid gap-2">
    <p className="text-sm"><b className="font-medium text-neutral-900">{request.display_line}</b></p>
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className={chip(v.given)} onClick={() => onChange({ given: true, reason: '' })}>Given</button>
      <button type="button" className={chip(!v.given)} onClick={() => onChange({ given: false, reason: v.reason })}>Not given</button>
      {!v.given && WHY_NOT.map((w) => <button type="button" key={w} className={chip(v.reason === w)} onClick={() => onChange({ given: false, reason: w })}>{w}</button>)}
    </div>
    {!v.given && <Input data-v value={v.reason} onChange={(e) => onChange({ given: false, reason: e.target.value })} placeholder="Or say why" className="h-8 max-w-sm" />}
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
registerBenchWords('pharmacy', { todo: 'To give', done: 'Given today' })
registerRenderer('pharmacy.dispense', {
  Full: ({ data }) => { const items = ((data.pharmacy as { items?: { drug: { text: string }; dose?: { value: string; unit?: string }; quantity?: { value: string } }[] } | undefined)?.items) ?? []
    return <div className="grid gap-1 text-sm">{data.status === 'cancelled' ? <p>Not given — {String(data.reason ?? '')}</p> : items.map((i, k) => <p key={k}>Given: {i.drug.text} {i.dose?.value ?? ''}{i.dose?.unit ? ` ${i.dose.unit}` : ''}{i.quantity ? ` × ${i.quantity.value}` : ''}</p>)}
      {typeof data.note === 'string' && data.note && <p className="text-neutral-600">{data.note}</p>}</div> },
})
export const key = 'pharmacy'
