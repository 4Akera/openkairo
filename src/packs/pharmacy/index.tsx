// The pharmacy pack's client (spec 06): the Prepare step on the bench, the dispense form, and how a dispense reads in the record.
import { registerBenchSteps, registerRenderer, registerReplyForm } from '@core/renderers'
import type { RequestQueueRow } from '@core/db/types'
import { Input, cn } from '@core/ui'

interface Item { name: string; dose_number: string; dose_unit: string; quantity: string; substituted_from: string | null }
interface Dispense { items: Item[]; notDone: boolean; reason: string; text: string }
const PER_DAY: Record<string, number> = { OD: 1, BD: 2, TDS: 3, QDS: 4, q4h: 6, q6h: 4, q8h: 3, q12h: 2, once: 1, stat: 1 }

/** the prescription the request carries: what to give, and a quantity worked out from dose frequency × days when both are known */
function fromPrescription(r: RequestQueueRow): Dispense {
  const d = (r.details ?? {}) as { drug?: { name?: string }; dose_number?: number; dose_unit?: string; frequency?: string; duration_days?: number; quantity?: number }
  const perDay = d.frequency ? PER_DAY[d.frequency] : undefined
  const qty = d.quantity ?? (perDay && d.duration_days ? Math.ceil(perDay * d.duration_days) : undefined)
  return { items: [{ name: d.drug?.name ?? r.display_line, dose_number: d.dose_number != null ? String(d.dose_number) : '', dose_unit: d.dose_unit ?? '', quantity: qty != null ? String(qty) : '', substituted_from: null }], notDone: false, reason: '', text: '' }
}

function DispenseEditor({ request, value, onChange }: { request: RequestQueueRow; value: Dispense | undefined; onChange: (v: Dispense) => void }) {
  const v = value ?? fromPrescription(request)
  const d = (request.details ?? {}) as { route?: string; frequency?: string; duration_days?: number; instructions_text?: string }
  const setItem = (i: number, p: Partial<Item>) => onChange({ ...v, items: v.items.map((x, j) => j === i ? { ...x, ...p } : x) })
  return <div className="grid gap-2">
    <p className="text-xs text-neutral-500">Prescribed: <b className="text-neutral-800">{request.display_line}</b>{d.route && d.route !== 'oral' ? ` · ${d.route}` : ''}{d.duration_days ? ` · ${d.duration_days} days` : ''}{d.instructions_text ? ` · ${d.instructions_text}` : ''}</p>
    <label className="flex items-center gap-1.5 text-xs text-neutral-600"><input type="checkbox" checked={v.notDone} onChange={(e) => onChange({ ...v, notDone: e.target.checked })} />not dispensed</label>
    {v.notDone ? <Input data-v value={v.reason} onChange={(e) => onChange({ ...v, reason: e.target.value })} placeholder="Why not — out of stock, patient declined, interaction…" /> : <>
      {v.items.map((x, i) => <div key={i} className="grid grid-cols-[1fr_5rem_4rem_5rem_auto] items-center gap-1.5">
        <Input data-v value={x.name} onChange={(e) => setItem(i, { name: e.target.value })} placeholder="Drug given" className="h-8" />
        <Input data-v value={x.dose_number} onChange={(e) => setItem(i, { dose_number: e.target.value.replace(/[^\d.]/g, '') })} placeholder="Dose" className="h-8 text-right tnum" />
        <Input value={x.dose_unit} onChange={(e) => setItem(i, { dose_unit: e.target.value })} className="h-8" />
        <Input data-v value={x.quantity} onChange={(e) => setItem(i, { quantity: e.target.value.replace(/[^\d.]/g, '') })} placeholder="Qty" className={cn('h-8 text-right tnum', !x.quantity && 'border-amber-400')} />
        <button type="button" onClick={() => setItem(i, { substituted_from: x.substituted_from == null ? (fromPrescription(request).items[0]?.name ?? '') : null })} className={cn('text-[11px]', x.substituted_from != null ? 'font-medium text-amber-700' : 'text-neutral-400 hover:text-neutral-700')}>substitute</button>
        {x.substituted_from != null && <p className="col-span-5 text-[11px] text-amber-800">Given in place of <b>{x.substituted_from}</b> — change the drug name above to what was given.</p>}
      </div>)}
      <Input value={v.text} onChange={(e) => onChange({ ...v, text: e.target.value })} placeholder="Counselling or note (optional)" className="h-8" />
    </>}
  </div>
}

registerReplyForm<Dispense>('pharmacy_dispense', {
  action: 'write:pharmacy_dispense',
  automatic: true,                      // a prescription sends it; nobody orders dispensing by hand
  Editor: DispenseEditor,
  toWrite: (r, value) => {
    const v = value ?? fromPrescription(r)
    if (v.notDone) return v.reason.trim() ? { function: 'pharmacy_write_dispense', params: { not_done: true, not_done_reason_text: v.reason.trim(), items: [] } } : null
    const items = v.items.filter((x) => x.name.trim() && x.quantity).map((x) => ({ name: x.name.trim(), dose_number: x.dose_number ? Number(x.dose_number) : null, dose_unit: x.dose_unit || null, quantity: Number(x.quantity), substituted_from: x.substituted_from }))
    return items.length ? { function: 'pharmacy_write_dispense', params: { items, text: v.text.trim() || null } } : null
  },
})
registerBenchSteps('pharmacy', [{ step: 'prepared', label: 'Prepare', from: ['sent', 'held'] }])
registerRenderer('pharmacy_dispense', {
  Full: ({ data }) => { const items = (data.items as { name: string; dose_number?: number; dose_unit?: string; quantity?: number; substituted_from?: string }[] | undefined) ?? []
    return <div className="grid gap-1 text-sm">{data.not_done ? <p>Not dispensed — {String(data.not_done_reason_text ?? '')}</p> : items.map((i, k) => <p key={k}>{i.name} {i.dose_number ?? ''}{i.dose_unit ? ` ${i.dose_unit}` : ''} × {i.quantity}{i.substituted_from ? <span className="text-amber-700"> · in place of {i.substituted_from}</span> : null}</p>)}
      {typeof data.text === 'string' && data.text && <p className="text-neutral-600">{data.text}</p>}</div> },
})
export const key = 'pharmacy'
