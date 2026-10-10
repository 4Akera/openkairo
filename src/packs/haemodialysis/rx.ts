// The standing dialysis prescription's form (spec/openCare.md §5.6, D2b): the pack's own type haemodialysis.prescription, one a patient,
// written and changed by the dialysis doctor. The form's fields and their usual ranges (outside them a notice, never a stop: the shape's
// own bounds are the hard ones), the data with its units (blood and dialysate flow in mL/min, the bath in mmol/L as plain numbers, a
// heparin bolus in units and a rate in units/h with no UCUM code, the dry weight in kg), the card's lines, and the entry: the first is
// new, each change continues it. Pure: npm run test:haemodialysis.
import { newId } from '@core/db/entries'
import type { EntryIn } from '@core/db/rpc'
import type { EntryData } from '@core/db/shapes.generated'

export type Rx = EntryData['haemodialysis.prescription']
export type AccessKind = 'fistula' | 'graft' | 'catheter'
export const ACCESS: [AccessKind, string][] = [['fistula', 'AV fistula'], ['graft', 'AV graft'], ['catheter', 'catheter']]
export const accessWords = (k: unknown) => ACCESS.find(([x]) => x === k)?.[1] ?? null
/** what Before checks of the access: a fistula's or a graft's thrill and bruit, a catheter's dressing */
export const checkWords = (k: AccessKind | undefined) => k === 'catheter' ? 'dressing clean' : 'thrill and bruit'

export interface RxForm {
  hours: number | null; blood_flow: number | null; dialysate_flow: number | null; dialyser: string
  k: number | null; ca: number | null; hco3: number | null
  none: boolean; bolus: number | null; rate: number | null
  dry: number | null; access: AccessKind | null; site: string; note: string
}
type NumKey = 'hours' | 'blood_flow' | 'dialysate_flow' | 'k' | 'ca' | 'hco3' | 'bolus' | 'rate' | 'dry'
export interface RxField { key: NumKey; label: string; unit: string; min: number; max: number; step?: number }
/** the form's numbers and their usual ranges (Claude's choice, awaiting the owner) */
export const RX_FIELDS: RxField[] = [
  { key: 'hours', label: 'Time', unit: 'h', min: 2, max: 5.5, step: 0.25 },
  { key: 'blood_flow', label: 'Blood flow', unit: 'mL/min', min: 200, max: 450 },
  { key: 'dialysate_flow', label: 'Dialysate', unit: 'mL/min', min: 300, max: 800 },
  { key: 'k', label: 'K', unit: 'mmol/L', min: 1, max: 4 },
  { key: 'ca', label: 'Ca', unit: 'mmol/L', min: 1, max: 1.75 },
  { key: 'hco3', label: 'HCO₃', unit: 'mmol/L', min: 28, max: 38 },
  { key: 'bolus', label: 'Heparin bolus', unit: 'units', min: 0, max: 5000 },
  { key: 'rate', label: 'Heparin rate', unit: 'units/h', min: 0, max: 2000 },
  { key: 'dry', label: 'Dry weight', unit: 'kg', min: 25, max: 200 },
]
export const blankRx = (): RxForm => ({ hours: null, blood_flow: null, dialysate_flow: null, dialyser: '', k: null, ca: null, hco3: null, none: false, bolus: null, rate: null,
  dry: null, access: null, site: '', note: '' })

const q = (n: number | null, unit: string, ucum?: string) => n == null ? undefined : { value: String(n), unit, ...(ucum ? { ucum } : {}) }
const num = (x: unknown): number | null => { const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x) : NaN; return Number.isFinite(n) ? n : null }
const qn = (x: unknown) => x && typeof x === 'object' ? num((x as { value?: unknown }).value) : null
/** a dry weight with its tenth ("72.0"), or as typed when finer */
const dryText = (n: number) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-9 ? n.toFixed(1) : String(n)

/** what is missing for a prescription: the hours, the dry weight, and the heparin dose unless None is chosen (so "no heparin" is always
 *  said, never left out) */
export const rxMissing = (f: RxForm): string[] => [...(f.hours == null ? ['the hours'] : []), ...(f.dry == null ? ['the dry weight'] : []),
  ...(!f.none && f.bolus == null && f.rate == null ? ['the heparin dose (or None)'] : [])]
/** the form → the prescription's data (null while the hours or the dry weight is missing) */
export function rxData(f: RxForm): Rx | null {
  if (f.hours == null || f.dry == null) return null
  const bath = { ...(f.k != null ? { k: f.k } : {}), ...(f.ca != null ? { ca: f.ca } : {}), ...(f.hco3 != null ? { hco3: f.hco3 } : {}) }
  const heparin = f.none ? { none: true } : { ...(f.bolus != null ? { bolus: q(f.bolus, 'units', '[iU]') } : {}), ...(f.rate != null ? { rate: q(f.rate, 'units/h') } : {}) }
  const data: Rx = { hours: f.hours, dry_weight: { value: dryText(f.dry), unit: 'kg', ucum: 'kg' } }
  if (f.blood_flow != null) data.blood_flow = q(f.blood_flow, 'mL/min', 'mL/min')
  if (f.dialysate_flow != null) data.dialysate_flow = q(f.dialysate_flow, 'mL/min', 'mL/min')
  if (f.dialyser.trim()) data.dialyser = f.dialyser.trim().slice(0, 40)
  if (Object.keys(bath).length) data.bath = bath
  if (Object.keys(heparin).length) data.heparin = heparin
  if (f.access) data.access = { kind: f.access, ...(f.site.trim() ? { site: f.site.trim().slice(0, 60) } : {}) }
  if (f.note.trim()) data.note = f.note.trim().slice(0, 300)
  return data
}
/** the prescription's data → the form */
export function rxForm(d: Partial<Rx> | null | undefined): RxForm {
  if (!d) return blankRx()
  return { hours: num(d.hours), blood_flow: qn(d.blood_flow), dialysate_flow: qn(d.dialysate_flow), dialyser: d.dialyser ?? '',
    k: num(d.bath?.k), ca: num(d.bath?.ca), hco3: num(d.bath?.hco3), none: !!d.heparin?.none, bolus: qn(d.heparin?.bolus), rate: qn(d.heparin?.rate),
    dry: qn(d.dry_weight), access: d.access?.kind ?? null, site: d.access?.site ?? '', note: d.note ?? '' }
}
/** the numbers outside their usual range, in words (a notice, never a stop) */
export function rxNotices(f: RxForm): string[] {
  return RX_FIELDS.flatMap((x) => { const v = f[x.key]
    if (v == null || (f.none && (x.key === 'bolus' || x.key === 'rate'))) return []
    return v < x.min || v > x.max ? [`${x.label} ${v} ${x.unit}: usually ${x.min}–${x.max}`] : [] })
}

/** the card's lines, in the picture's order */
export function rxWords(d: Partial<Rx> | null | undefined): [string, string][] {
  if (!d) return []
  const out: [string, string][] = []
  const v = (x: unknown) => qn(x)
  if (d.hours != null) out.push(['Time', `${d.hours} h`])
  if (v(d.blood_flow) != null) out.push(['Blood flow', `${v(d.blood_flow)} mL/min`])
  if (v(d.dialysate_flow) != null) out.push(['Dialysate', `${v(d.dialysate_flow)} mL/min`])
  const bath = [d.bath?.k != null ? `K ${d.bath.k}` : '', d.bath?.ca != null ? `Ca ${d.bath.ca}` : '', d.bath?.hco3 != null ? `HCO₃ ${d.bath.hco3}` : ''].filter(Boolean)
  if (bath.length) out.push(['Bath', bath.join(' · ')])
  if (d.dialyser) out.push(['Dialyser', d.dialyser])
  if (d.heparin?.none) out.push(['Heparin', 'none'])
  else if (d.heparin) { const h = [v(d.heparin.bolus) != null ? `${v(d.heparin.bolus)} units` : '', v(d.heparin.rate) != null ? `${v(d.heparin.rate)} units/h` : ''].filter(Boolean)
    if (h.length) out.push(['Heparin', h.join(' then ')]) }
  if (d.dry_weight?.value) out.push(['Dry weight', `${d.dry_weight.value} kg`])
  if (d.access) out.push(['Access', [accessWords(d.access.kind), d.access.site].filter(Boolean).join(' · ')])
  if (d.note) out.push(['Note', d.note])
  return out
}

/** the prescription's entry: v1 with no visit, or the change of the current one */
export function rxEntry(f: RxForm, patientId: string, departmentId: string, current?: { entry_id: string } | null): EntryIn | null {
  const data = rxData(f); if (!data) return null
  return { id: newId(), type: 'haemodialysis.prescription', patient_id: patientId, department_id: departmentId, data,
    ...(current ? { refers_to: current.entry_id, relation: 'changes' as const } : {}) }
}
