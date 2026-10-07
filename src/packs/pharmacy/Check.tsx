// The pharmacist's check of one medicine (spec/openCare.md §5.3; the picture "Pharmacy · the check"): what was written, the amount to
// give (changeable: less is given in part and the rest owed), the directions in Arabic, the prescriber's warnings (an allergy, a
// duplicate: it is not given until the pharmacist says why, or asks the doctor), another brand with the same active ingredient, or not
// given and why. Ask the doctor (spec §5.3) sends a question about the order to whoever prescribed it (the chart and their To review);
// their answer shows here, and "give it anyway" from them is the reason. toDispense turns it into the pack's dispense, the same for Give
// all (nothing changed) and Give (as checked).
import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { useWrite } from '@core/hooks/writes'
import { useDepartment } from '@core/hooks/organization'
import { newId, oneSet } from '@core/db/entries'
import type { RequestQueueRow } from '@core/db/types'
import type { EntryBody } from '@core/db/rpc'
import { Button, Callout, Chip, Input, Tag, cn, errorText, hm } from '@core/ui'
import { amountToGive, arabicDirections, parseDose } from './directions'
import { sameMedicine } from './substitutes'
import { inBoxes, pickProduct, productsFor } from './shelf'
import { keepStock } from './settings'
import { useStock } from './Stock'

export interface Dispense { given: boolean; reason: string; drug?: string; quantity?: string; anyway?: string; to?: string
  product_id?: string; batch?: string }   // with stock kept: the product and the batch it is given from (first to expire)
export interface Warning { code: string; detail?: string; confirmed?: boolean }
/** the pharmacy's question to the doctor about this order, and their answer (action: give_anyway or changed) */
export interface Asked { text: string; at: string; answer?: string; action?: string; answered_by?: string; answered_at?: string }
/** what a request to the pharmacy carries (answers.ts QUEUE_DETAILS, from the pack's own table) */
export interface Details { drug?: { name?: string }; dose?: string; frequency?: string; duration_days?: number; quantity?: string; instructions?: string
  warnings?: Warning[]; owed?: string; status?: string; question?: Asked }
export const detailsOf = (r: Pick<RequestQueueRow, 'details'>) => (r.details ?? {}) as Details
const WHY_NOT = ['Out of stock', 'Patient declined', 'Buys outside']
const WARNING: Record<string, (d?: string) => string> = { allergy_clash: (d) => `Allergy${d ? `: ${d}` : ''}`, allergy_caution: (d) => `Allergy, related${d ? `: ${d}` : ''}`,
  duplicate_medication: () => 'Already takes this medicine', duplicate_class: () => 'Already takes one of the same kind' }
export const warningWord = (w: Warning) => (WARNING[w.code] ?? (() => w.code.replace(/_/g, ' ')))(w.detail)

/** what to give in full: the rest still owed, else what was written (its quantity, or dose × times a day × days), else one */
export function fullAmount(d: Details): { value: number; unit: string } {
  const owed = d.status === 'owed' ? parseDose(d.owed) : null
  if (owed) return { value: owed.value, unit: owed.unit || 'tablets' }
  if (d.quantity && Number(d.quantity) > 0) return { value: Number(d.quantity), unit: 'tablets' }
  return amountToGive({ dose: d.dose, frequency: d.frequency, days: d.duration_days }) ?? { value: 1, unit: 'tablets' }
}
const written = (d: Details) => [d.dose, d.frequency, d.duration_days ? `${d.duration_days} days` : null, d.instructions].filter(Boolean).join(' · ')
export const directionsOf = (d: Details) => arabicDirections({ dose: d.dose, frequency: d.frequency, days: d.duration_days, instructions: d.instructions })

/** the dispense as checked (none: nothing to give yet — a warning not answered, no medicine named, not given with no reason) */
export function toDispense(r: Pick<RequestQueueRow, 'details'>, value: Dispense | undefined): EntryBody | null {
  const d = detailsOf(r); const v = value ?? { given: true, reason: '' }
  if (!v.given) return v.reason.trim() ? { type: 'pharmacy.dispense' as const, data: { status: 'cancelled' as const, reason: v.reason.trim() } } : null
  if (!d.drug?.name) return null   // the pharmacy's list has not caught up with this prescription yet: nothing to give by name
  const doctorSaid = d.question?.action === 'give_anyway' ? `${d.question.answered_by ?? 'The doctor'}: ${d.question.answer ?? 'give it anyway'}` : null
  if ((d.warnings ?? []).length && !v.anyway?.trim() && !doctorSaid) return null
  const full = fullAmount(d); const now = v.quantity === undefined ? full.value : Number(v.quantity)
  if (!(now > 0) || now > full.value) return null
  const owe = full.value - now
  const dose = parseDose(d.dose); const drug = v.drug?.trim() || d.drug.name
  const item = { drug: { text: drug }, ...(dose ? { dose: { value: String(dose.value), ...(dose.unit ? { unit: dose.unit } : {}) } } : {}), quantity: { value: String(now), unit: full.unit },
    ...(drug !== d.drug.name ? { instead_of: d.drug.name } : {}), ...(directionsOf(d) ? { directions: directionsOf(d) } : {}),
    ...(v.product_id ? { product: v.product_id } : {}), ...(v.batch ? { batch: v.batch } : {}) }
  const why = v.anyway?.trim() || ((d.warnings ?? []).length ? doctorSaid : null)
  return { type: 'pharmacy.dispense' as const, data: { status: owe > 0 ? 'in-progress' as const : 'completed' as const, ...(why ? { note: `Given over a warning: ${why}` } : {}),
    pharmacy: { items: [item], ...(owe > 0 ? { owed: { value: String(owe), unit: full.unit } } : {}), ...(v.to?.trim() ? { received_by: v.to.trim() } : {}) } } }
}

export function Check({ request, value, onChange }: { request: RequestQueueRow; value: Dispense | undefined; onChange: (v: Dispense) => void }) {
  const d = detailsOf(request); const v = value ?? { given: true, reason: '' }
  const [open, setOpen] = useState<'brand' | 'part' | 'not' | null>(v.given ? null : 'not')
  const full = fullAmount(d); const now = v.quantity === undefined ? full.value : Number(v.quantity)
  const warnings = d.warnings ?? []; const asked = d.question; const doctorSays = asked?.action === 'give_anyway'
  const held = warnings.length > 0 && !v.anyway?.trim() && !doctorSays
  const w = useWrite(); const [asking, setAsking] = useState<string | null>(null)
  const ask = (text: string) => w.mutate(oneSet([{ id: newId(), type: 'question', patient_id: request.patient.id, department_id: request.order.to_department_id ?? '', visit_id: null,
    refers_to: request.order.latest_entry, relation: 'about', data: { text } }]), { onSuccess: () => setAsking(null) })
  const suggestion = warnings.length ? `${warnings.map(warningWord).join('; ')}. Change ${d.drug?.name ?? 'it'}?` : `About ${d.drug?.name ?? 'this prescription'}: `
  const same = d.drug?.name ? sameMedicine(d.drug.name) : null
  // with stock kept: the product given (the brand named, or the one chosen), what is on hand, the others with the same active ingredient
  const { org } = useDepartment(); const pharmacyId = request.order.to_department_id ?? ''; const keep = keepStock(org, pharmacyId)
  const stock = useStock(pharmacyId, null, keep); const match = keep ? productsFor(stock.data?.products ?? [], v.drug || d.drug?.name || '') : null
  const product = keep ? pickProduct(stock.data?.products ?? [], v.drug || d.drug?.name || '') : null; const short = !!product && product.on_hand < now
  const others = keep ? [...(match?.same ?? []).filter((p) => p.on_hand > 0).map((p) => ({ name: p.brand, words: `${p.brand} · ${inBoxes(p.on_hand, p.pack_size)}` })),
    ...(same?.others ?? []).filter((b) => !(match?.same ?? []).some((p) => p.brand === b)).map((b) => ({ name: b, words: b }))] : (same?.others ?? []).map((b) => ({ name: b, words: b }))
  const set = (x: Partial<Dispense>) => onChange({ ...v, ...x })
  const link = (k: 'brand' | 'part' | 'not', words: string) => <button type="button" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}
    className={cn('rounded-sm text-12 hover:underline focus-ring', open === k ? 'font-medium text-fg' : 'text-accent')}>{words}</button>
  return <div className={cn('grid gap-2 rounded-lg border bg-surface p-3', !v.given ? 'border-line' : held ? 'border-danger' : v.drug ? 'border-warn' : 'border-line')}>
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className={cn('text-14 font-semibold', v.given ? 'text-fg' : 'text-faint line-through')}>{v.drug || d.drug?.name || request.display_line}</span>
      {v.drug && <span className="text-12 text-warn">instead of {d.drug?.name}</span>}
      <span className="text-13 text-muted">{written(d)}</span>
      {v.given && <label className="ms-auto inline-flex items-center gap-1.5 text-13 text-fg">Give
        <Input dense inputMode="numeric" aria-label="How many to give now" value={v.quantity ?? String(full.value)} onChange={(e) => set({ quantity: e.target.value })} className="w-16 text-end tnum" />
        <span className="text-muted">{full.unit}</span></label>}
    </div>
    {v.given && directionsOf(d) && <p dir="rtl" lang="ar" className="text-14 text-muted">{directionsOf(d)}</p>}
    {v.given && keep && <p className="flex flex-wrap items-center gap-2 text-12 text-muted">{product
      ? <>{product.brand !== (v.drug || d.drug?.name) && <span>Gives <b className="font-medium text-fg">{product.brand}</b> ·</span>}
          In stock: <b className={cn('font-medium', short ? 'text-warn' : 'text-fg')}>{inBoxes(product.on_hand, product.pack_size)}</b>{now > 0 && <span>· giving {inBoxes(now, product.pack_size)}</span>}
          {short && <Tag tone={product.on_hand > 0 ? 'warn' : 'danger'}>{product.on_hand > 0 ? 'not enough' : 'out of stock'}</Tag>}</>
      : <><Tag tone="warn">not on this pharmacy's stock list</Tag>{(match?.same ?? []).some((p) => p.on_hand > 0) && <span>— another brand is (Another brand…)</span>}</>}</p>}
    {v.given && now < full.value && now > 0 && <p className="text-12 text-warn">Given in part: {full.value - now} {full.unit} owed — the patient comes back for the rest (Owed).</p>}
    {v.given && warnings.map((w) => <Callout key={w.code} tone={w.code === 'allergy_clash' ? 'danger' : 'warn'} title={warningWord(w)}>
      {w.confirmed ? 'The doctor was warned and signed anyway. ' : ''}Give it only with a reason, or not at all.</Callout>)}
    {asked && <Callout tone={asked.answer ? (asked.action === 'give_anyway' ? 'ok' : 'info') : 'info'} icon={MessageSquare}
      title={asked.answer ? `${asked.answered_by ?? 'The doctor'} answered${asked.answered_at ? ` at ${hm(asked.answered_at)}` : ''}` : `Asked the doctor at ${hm(asked.at)} — waiting`}>
      {asked.answer ?? asked.text}</Callout>}
    {v.given && warnings.length > 0 && !doctorSays && <div className="flex flex-wrap items-center gap-2">
      <Input dense value={v.anyway ?? ''} onChange={(e) => set({ anyway: e.target.value })} placeholder="Give anyway: why (tolerated it before…)" className="w-full max-w-md" />
      {!asked && asking === null && <Button size="sm" variant="outline" onClick={() => setAsking(suggestion)}><MessageSquare />Ask the doctor</Button>}</div>}
    {asking !== null && <div className="flex flex-wrap items-center gap-2">
      <Input dense autoFocus value={asking} onChange={(e) => setAsking(e.target.value)} className="w-full max-w-xl" aria-label="The question to the doctor" />
      <Button size="sm" onClick={() => ask(asking.trim())} disabled={!asking.trim()} loading={w.isPending}>Send</Button>
      <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>Cancel</Button>
      {w.error && <span className="text-12 text-danger">{errorText(w.error)}</span>}</div>}
    <div className="flex flex-wrap items-center gap-3">
      {others.length > 0 && link('brand', 'Another brand…')}{link('part', 'Give part…')}{link('not', v.given ? 'Not given…' : 'Not given')}
      {!asked && asking === null && warnings.length === 0 && <button type="button" onClick={() => setAsking(suggestion)} className="rounded-sm text-12 text-accent hover:underline focus-ring">Ask the doctor…</button>}
    </div>
    {open === 'brand' && others.length > 0 && <div className="flex flex-wrap items-center gap-1.5 text-13"><span className="text-muted">Same medicine{same ? ` (${same.generic})` : ''}:</span>
      {others.map((b) => <Chip key={b.name} on={v.drug === b.name} onClick={() => set({ drug: v.drug === b.name ? undefined : b.name, given: true })}>{b.words}</Chip>)}</div>}
    {open === 'part' && <div className="flex flex-wrap items-center gap-2 text-13"><span className="text-muted">Now</span>
      <Input dense inputMode="numeric" value={v.quantity ?? String(full.value)} onChange={(e) => set({ quantity: e.target.value, given: true })} className="w-16 text-end tnum" />
      <span className="text-muted">of {full.value} {full.unit}; the rest is owed.</span></div>}
    {open === 'not' && <div className="flex flex-wrap items-center gap-1.5">
      <Chip on={!v.given} onClick={() => set({ given: !v.given })}>Not given</Chip>
      {!v.given && WHY_NOT.map((w) => <Chip key={w} on={v.reason === w} onClick={() => set({ reason: w })}>{w}</Chip>)}
      {!v.given && <Input dense value={WHY_NOT.includes(v.reason) ? '' : v.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="Or say why" className="w-56" />}</div>}
  </div>
}
