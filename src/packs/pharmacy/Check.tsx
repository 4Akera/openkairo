// The pharmacist's check of one medicine (spec/openCare.md §5.3; the picture "Pharmacy · the check"): what was written, the amount to
// give (changeable: less is given in part and the rest owed), the directions in Arabic, the prescriber's warnings (an allergy, a
// duplicate: it is not given until the pharmacist says why, or asks the doctor), another brand with the same active ingredient, or not
// given and why. toDispense turns it into the pack's dispense, the same for Give all (nothing changed) and Give (as checked).
import { useState } from 'react'
import type { RequestQueueRow } from '@core/db/types'
import type { EntryBody } from '@core/db/rpc'
import { Callout, Chip, Input, cn } from '@core/ui'
import { amountToGive, arabicDirections, parseDose } from './directions'
import { sameMedicine } from './substitutes'

export interface Dispense { given: boolean; reason: string; drug?: string; quantity?: string; anyway?: string; to?: string }
export interface Warning { code: string; detail?: string; confirmed?: boolean }
/** what a request to the pharmacy carries (answers.ts QUEUE_DETAILS, from the pack's own table) */
export interface Details { drug?: { name?: string }; dose?: string; frequency?: string; duration_days?: number; quantity?: string; instructions?: string
  warnings?: Warning[]; owed?: string; status?: string }
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
  if ((d.warnings ?? []).length && !v.anyway?.trim()) return null
  const full = fullAmount(d); const now = v.quantity === undefined ? full.value : Number(v.quantity)
  if (!(now > 0) || now > full.value) return null
  const owe = full.value - now
  const dose = parseDose(d.dose); const drug = v.drug?.trim() || d.drug.name
  const item = { drug: { text: drug }, ...(dose ? { dose: { value: String(dose.value), ...(dose.unit ? { unit: dose.unit } : {}) } } : {}), quantity: { value: String(now), unit: full.unit },
    ...(drug !== d.drug.name ? { instead_of: d.drug.name } : {}), ...(directionsOf(d) ? { directions: directionsOf(d) } : {}) }
  return { type: 'pharmacy.dispense' as const, data: { status: owe > 0 ? 'in-progress' as const : 'completed' as const, ...(v.anyway?.trim() ? { note: `Given over a warning: ${v.anyway.trim()}` } : {}),
    pharmacy: { items: [item], ...(owe > 0 ? { owed: { value: String(owe), unit: full.unit } } : {}), ...(v.to?.trim() ? { received_by: v.to.trim() } : {}) } } }
}

export function Check({ request, value, onChange }: { request: RequestQueueRow; value: Dispense | undefined; onChange: (v: Dispense) => void }) {
  const d = detailsOf(request); const v = value ?? { given: true, reason: '' }
  const [open, setOpen] = useState<'brand' | 'part' | 'not' | null>(v.given ? null : 'not')
  const full = fullAmount(d); const now = v.quantity === undefined ? full.value : Number(v.quantity)
  const warnings = d.warnings ?? []; const held = warnings.length > 0 && !v.anyway?.trim()
  const same = d.drug?.name ? sameMedicine(d.drug.name) : null
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
    {v.given && now < full.value && now > 0 && <p className="text-12 text-warn">Given in part: {full.value - now} {full.unit} owed — the patient comes back for the rest (Owed).</p>}
    {v.given && warnings.map((w) => <Callout key={w.code} tone={w.code === 'allergy_clash' ? 'danger' : 'warn'} title={warningWord(w)}>
      {w.confirmed ? 'The doctor was warned and signed anyway. ' : ''}Give it only with a reason, or not at all.</Callout>)}
    {v.given && warnings.length > 0 && <div className="flex flex-wrap items-center gap-2">
      <Input dense value={v.anyway ?? ''} onChange={(e) => set({ anyway: e.target.value })} placeholder="Give anyway: why (tolerated it before, the doctor confirmed…)" className="w-full max-w-md" /></div>}
    <div className="flex flex-wrap items-center gap-3">
      {same && same.others.length > 0 && link('brand', 'Another brand…')}{link('part', 'Give part…')}{link('not', v.given ? 'Not given…' : 'Not given')}
    </div>
    {open === 'brand' && same && <div className="flex flex-wrap items-center gap-1.5 text-13"><span className="text-muted">Same medicine ({same.generic}):</span>
      {same.others.map((b) => <Chip key={b} on={v.drug === b} onClick={() => set({ drug: v.drug === b ? undefined : b, given: true })}>{b}</Chip>)}</div>}
    {open === 'part' && <div className="flex flex-wrap items-center gap-2 text-13"><span className="text-muted">Now</span>
      <Input dense inputMode="numeric" value={v.quantity ?? String(full.value)} onChange={(e) => set({ quantity: e.target.value, given: true })} className="w-16 text-end tnum" />
      <span className="text-muted">of {full.value} {full.unit}; the rest is owed.</span></div>}
    {open === 'not' && <div className="flex flex-wrap items-center gap-1.5">
      <Chip on={!v.given} onClick={() => set({ given: !v.given })}>Not given</Chip>
      {!v.given && WHY_NOT.map((w) => <Chip key={w} on={v.reason === w} onClick={() => set({ reason: w })}>{w}</Chip>)}
      {!v.given && <Input dense value={WHY_NOT.includes(v.reason) ? '' : v.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="Or say why" className="w-56" />}</div>}
  </div>
}
