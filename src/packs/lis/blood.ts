// The Blood bank's words (spec/openCare.md §5.8, Q35, Q36; the pictures #haem-blood and the transfusion picture after it), the laboratory pack's: /blood orders a
// product from the Blood bank, offered wherever a department using the pack works for this one, carrying the pack's words on the order
// (its own order type: the product, what the red cells need, the units, why, the consent, the sample); /transfuse is the record at the bed of
// one unit (the pack's type extending the base's given: the unit number its lot, the volume its dose, the two who checked, the signs, a
// reaction, said in the given's note too). Pure (npm run test:lis).
import type { Ctx, Parsed, Result } from '@core/screens/visit/parse'
import { ordersFrom } from '@core/screens/visit/commands'

export const PRODUCTS = { rbc: 'Red cells', plt: 'Platelets', ffp: 'Plasma (FFP)', cryo: 'Cryoprecipitate' } as const
export type Product = keyof typeof PRODUCTS
const PRODUCT_WORD: Record<string, Product> = { rbc: 'rbc', prbc: 'rbc', red: 'rbc', blood: 'rbc', plt: 'plt', platelets: 'plt', ffp: 'ffp', plasma: 'ffp', cryo: 'cryo' }
export const NEEDS = ['leucodepleted', 'Rh and Kell matched', 'irradiated', 'washed'] as const
const NEED_WORD: Record<string, typeof NEEDS[number]> = { leuco: 'leucodepleted', leucodepleted: 'leucodepleted', ld: 'leucodepleted', kell: 'Rh and Kell matched', irradiated: 'irradiated', irr: 'irradiated', washed: 'washed' }
/** about how much a unit holds, for mL/kg on the card (the bag's own volume is written at the bed) */
export const ML: Record<Product, number> = { rbc: 290, plt: 250, ffp: 250, cryo: 15 }
export interface BloodWords { product: Product; needs: string[]; units: number; why?: string; consent: string; sample: string }

/** the line: the product, the number of units, what the red cells need, urgent or emergency, consent today/emergency, sample lab, "? why" */
export function parseBlood(rest: string, ctx: Pick<Ctx, 'services' | 'departments' | 'departmentId'>): Result {
  const at = rest.indexOf('?'); const why = at >= 0 ? rest.slice(at + 1).trim() : ''
  const w = (at >= 0 ? rest.slice(0, at) : rest).trim().toLowerCase().split(/\s+/).filter(Boolean); if (!w.length && !why) return null
  let product: Product | null = null; let units = 1; const needs: string[] = []; let priority = 'routine'; let consent = 'on file'; let sample = 'taken here'
  for (let i = 0; i < w.length; i++) {
    const x = w[i]
    if (PRODUCT_WORD[x]) { product = PRODUCT_WORD[x]; continue }
    if (/^\d+$/.test(x) && Number(x) >= 1 && Number(x) <= 20) { units = Number(x); continue }
    if (NEED_WORD[x]) { if (!needs.includes(NEED_WORD[x])) needs.push(NEED_WORD[x]); continue }
    if (x === 'urgent') { priority = 'urgent'; continue }
    if (x === 'emergency' || x === 'stat') { priority = 'stat'; consent = 'emergency, no time'; continue }
    if (x === 'consent') { const y = w[i + 1]; if (y === 'today') { consent = 'signed today'; i++ } else if (y === 'emergency') { consent = 'emergency, no time'; i++ } else if (y === 'file' || y === 'on') { i += y === 'on' ? 2 : 1 } continue }
    if (x === 'sample') { const y = w[i + 1]; if (y === 'lab') { sample = 'the lab collects'; i++ } else if (y === 'here') i++; continue }
    if (['cells', 'units', 'unit', 'u', 'x', '×', 'file', 'today', 'here', 'lab', 'and', 'rh', 'matched'].includes(x)) continue
    return { error: `Not a blood word: “${x}”. Try rbc 2 leuco kell urgent ? why` }
  }
  if (!product) return { error: 'Say the product: rbc, plt, ffp or cryo' }
  const from = ordersFrom('lis', ctx); const svc = ctx.services.find((s) => s.code === product && s.section_name === 'Blood bank' && from.has(s.department_id ?? ''))
  if (!svc) return { error: `No Blood bank offers ${PRODUCTS[product].toLowerCase()} to this department` }
  const words: BloodWords = { product, needs, units, ...(why ? { why } : {}), consent, sample }
  const dept = ctx.departments.find((d) => d.id === svc.department_id)?.name ?? 'Blood bank'
  return { ok: [{ function: 'order', kind: 'request', params: { service_id: svc.id, priority, ...(why ? { question_text: why } : {}), as: { type: 'lis.blood', words } },
    line: bloodLine(words, priority, dept) }] }
}
export const bloodLine = (w: BloodWords, priority: string, to: string) =>
  [`${PRODUCTS[w.product]}${w.needs.length ? `, ${w.needs.join(', ')}` : ''}`, `${w.units} ${w.units === 1 ? 'unit' : 'units'}`, w.why, priority !== 'routine' ? priority : null,
    `consent ${w.consent}`, w.sample].filter(Boolean).join(' · ') + ` → ${to}`

// ── the record at the bed of one unit ──
export const CHECKS = ['Name and birth date: wristband = label', 'Record number = the label', 'Unit number on the bag = the label', 'The unit\'s group fits the patient\'s',
  'In date · the bag whole, no clots', 'Started within 30 minutes of issue'] as const
export const REACTIONS = ['hives, itch', 'fever, rigors', 'breathless', 'BP fell', 'back pain, dark urine'] as const
export const WHEN = ['before', '15 min', 'end', 'reaction'] as const
export interface Signs { when: typeof WHEN[number]; at?: string; temp?: number; sys?: number; dia?: number; pulse?: number; rr?: number; spo2?: number }
export interface BedRecord { unit: string; product?: Product; group?: string; second: string; checks: string[]; started?: string; ended?: string; signs: Signs[]
  reaction?: { what: string[]; severity?: string; doctor?: string; told?: string } }
const hhmm = (d: Date) => d.toTimeString().slice(0, 5)
/** the base's given with the record at the bed beside it: the unit its lot, the volume its dose, what happened in its note */
export function transfusionData(b: BedRecord, ml: number | null): Record<string, unknown> {
  const what = b.product ? PRODUCTS[b.product] : 'Red cells'
  const stopped = b.reaction && b.reaction.what.length > 0
  const note = [b.started && `${b.started}${b.ended ? ` to ${b.ended}` : ''}`, ml != null && `${stopped ? 'about ' : ''}${ml} mL`,
    stopped && `stopped: ${b.reaction!.what.join(', ')}${b.reaction!.severity ? `, ${b.reaction!.severity}` : ''}`, stopped && b.reaction!.doctor].filter(Boolean).join(' · ')
  const lis = Object.fromEntries(Object.entries({ ...b, signs: b.signs.length ? b.signs : undefined, reaction: stopped ? b.reaction : undefined }).filter(([, v]) => v !== undefined && v !== ''))
  return { status: 'completed', drug: { text: `${what}${b.group ? ` · ${b.group}` : ''}` }, lot: b.unit, route: 'iv', ...(ml != null ? { dose: { value: String(ml), unit: 'mL', ucum: 'mL' } } : {}),
    ...(note ? { note } : {}), lis }
}
/** /transfuse 26-118452 [rbc] [290] [with Marwa Gaber] [checked] — one unit at the bed: the writer checks it with a second person
 *  ("with" their name), "checked" says the six checks were said aloud; the card, where it draws, holds the checks, the signs and a reaction */
export function parseTransfuse(rest: string, now = new Date()): Result {
  const at = rest.search(/\bwith\b/i); const head = (at >= 0 ? rest.slice(0, at) : rest).trim().split(/\s+/).filter(Boolean)
  const tail = at >= 0 ? rest.slice(at + 4).trim() : ''; const checked = /\bchecked\b/i.test(rest)
  const second = tail.replace(/\bchecked\b/ig, '').trim()
  if (!head.length) return null
  const unit = head[0]; if (!/^[0-9A-Za-z][0-9A-Za-z-]{2,}$/.test(unit)) return { error: 'Type the unit number on the bag: /transfuse 26-118452 with Marwa Gaber checked' }
  let product: Product = 'rbc'; let ml: number | null = null
  for (const x of head.slice(1)) { if (PRODUCT_WORD[x.toLowerCase()]) product = PRODUCT_WORD[x.toLowerCase()]; else if (/^\d+$/.test(x)) ml = Number(x); else if (!/^checked$/i.test(x)) return { error: `Not a /transfuse word: “${x}”` } }
  const b: BedRecord = { unit, product, second, checks: checked ? [...CHECKS] : [], started: hhmm(now), signs: [] }
  return { ok: [transfusionDraft(b, ml ?? ML[product])] }
}
export const transfusionDraft = (b: BedRecord, ml: number | null): Parsed => ({ function: 'lis.transfusion', kind: 'given', params: transfusionData(b, ml), line: transfusionLine(b, ml) })
export const transfusionLine = (b: BedRecord, ml: number | null) => `${b.product ? PRODUCTS[b.product] : 'Blood'} · unit ${b.unit}${b.started ? ` · ${b.started}${b.ended ? ` to ${b.ended}` : ''}` : ''}${ml != null ? ` · ${ml} mL` : ''}`
  + (b.reaction?.what.length ? ` · stopped: ${b.reaction.what.join(', ')}${b.reaction.severity ? `, ${b.reaction.severity}` : ''}` : '')
/** the card's fields from the draft's data */
export const bedsideOf = (q: Record<string, unknown>): { b: BedRecord; ml: number | null } => ({ b: { unit: '', ...(q.lis as Partial<BedRecord> | undefined),
    second: (q.lis as Partial<BedRecord> | undefined)?.second ?? '', checks: (q.lis as Partial<BedRecord> | undefined)?.checks ?? [], signs: (q.lis as Partial<BedRecord> | undefined)?.signs ?? [] },
  ml: (q.dose as { value?: string } | undefined)?.value ? Number((q.dose as { value: string }).value) : null })
/** what is missing before it may be added: the second checker, every check */
export function bedsideMissing(b: BedRecord): string | null {
  if (b.second.trim().length < 2) return 'Two people check the unit beside the patient: name the second (with Marwa Gaber)'
  if (b.checks.length < CHECKS.length) return `Tick every check (${b.checks.length} of ${CHECKS.length})`
  return null
}
