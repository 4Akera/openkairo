// The hour card (spec/openCare.md §5.6): the nurse types one column and signs it once, as one set. What is in force (the ventilator's
// settings, each running infusion's dose) shows faint and a blank keeps it: only what changed is written, as a version that changes
// its item. A dose typed gives the pump's rate from the bag and the weight, and the dose written is the one that rate gives. Only what
// cannot be written stops the sign (a problem); a value outside its usual range is a notice and "Sign anyway", since an ICU nurse must
// be able to chart a real value in an arrest. A start is linked to the patient's prescription only when it is the same drug. Pure.
import type { EntryIn } from '@core/db/rpc'
import type { Concept, EntryData, Quantity } from '@core/db/shapes.generated'
import type { ListRowData, ServerEntry, TableRead } from '@core/db/types'
import type { Acvpu } from '@core/screens/visit/vitals'
import { AIRWAY, OBS, airwayOf, concept, type AirwayKind, type Mode, type ObsKey } from './codes'
import { hourLabel, plusHours } from './hours'
import { inForce, itemsOf, latestOf, type Item } from './items'
import { AMOUNT_UNITS, DOSE_UNITS, amountUnitOf, doseFor, fitProblem, isDoseUnit, rateFor, roundTo, type Bag, type DoseUnit } from './rates'
import { bagOf, infusionOf, type UnitInfusion, type UnitSetting } from './unit'

type Infusion = EntryData['intensive.infusion']; type Vent = EntryData['intensive.vent']
export interface Prescription { item: string; drug: Concept; atc: string | null }
/** an item as the card changes it: its data in force at the hour, and its latest version (by version), which a change refers to */
interface Head { item: string; entry: string; version: number; latestAt: string }
export interface HourNow {
  airway: (Head & { kind: AirwayKind; since: string; data: EntryData['procedure'] }) | null
  vent: (Head & { data: Vent }) | null
  running: (Head & { data: Infusion; row: UnitInfusion | null })[]
  prescriptions: Prescription[]
  kg: number | null
}
const dataOf = <T,>(e: ServerEntry) => (e.data ?? {}) as unknown as T
const head = (it: Item): Head => { const l = latestOf(it); return { item: it.item, entry: l.id, version: l.item_version, latestAt: l.occurred_at } }
/** what is in force at an instant (the end of the hour charted): the open ventilation, its settings, the running infusions, the active
 *  prescriptions, the weight. A change refers to the item's latest version, so the writer refuses it when that is newer than what showed */
export function hourNow(entries: readonly ServerEntry[], lists: TableRead<ListRowData> | undefined, at: string, unit: UnitSetting, kg: number | null): HourNow {
  const items = itemsOf(entries); let airway: HourNow['airway'] = null; let vent: HourNow['vent'] = null; let ventAt = ''; const running: HourNow['running'] = []
  for (const it of items) {
    const e = inForce(it, at); if (!e) continue
    const kind = it.type === 'procedure' ? airwayOf(it.versions[0]) : null
    if (kind) { const data = dataOf<EntryData['procedure']>(e); const since = data.performed?.value ?? e.occurred_at
      if (data.status === 'in-progress' && (!airway || airway.since < since)) airway = { ...head(it), kind, since, data } }
    if (it.type === 'intensive.vent' && e.occurred_at >= ventAt) { vent = { ...head(it), data: dataOf<Vent>(e) }; ventAt = e.occurred_at }
    if (it.type === 'intensive.infusion' && dataOf<Infusion>(e).status === 'running') { const data = dataOf<Infusion>(e); running.push({ ...head(it), data, row: infusionOf(unit, data.key) }) }
  }
  if (!airway) vent = null   // settings belong to an open ventilation
  running.sort((a, b) => a.data.drug.text.localeCompare(b.data.drug.text))
  const prescriptions = (lists?.rows ?? []).filter((r) => r.list === 'medications' && r.status === 'active').flatMap((r): Prescription[] => {
    const e = lists!.entries[r.entry_id]; const drug = e ? dataOf<EntryData['medication']>(e).drug : undefined; if (!drug?.text) return []
    return [{ item: r.item, drug, atc: drug.codings?.find((c) => c.system === 'atc')?.code ?? null }]
  })
  return { airway, vent, running, prescriptions, kg }
}

type Num = 'hr' | 'sys' | 'dia' | 'map' | 'spo2' | 'rr' | 'temp' | 'glucose' | 'cvp' | 'flow' | 'intake' | 'urine'
export type VentField = 'fio2' | 'peep' | 'vt' | 'rate' | 'ps' | 'pinsp'
export interface Start { key: string; dose?: string; rate?: string; amount?: string; volume?: string; kg?: string; medication?: string }
export type HourDraft = { hour: string; acvpu?: Acvpu; o2?: 'air' | 'oxygen'; vent?: { mode?: Mode; mode_text?: string } & Partial<Record<VentField, string>>
  ventOn?: AirwayKind; ventOff?: boolean; doses: Record<string, { dose?: string; rate?: string; stop?: boolean }>; starts: Start[] } & Partial<Record<Num, string>>
export const emptyDraft = (hour: string): HourDraft => ({ hour, doses: {}, starts: [] })

export const LABEL: Record<Num | VentField, string> = { hr: 'HR', sys: 'Systolic', dia: 'Diastolic', map: 'MAP', spo2: 'SpO₂', rr: 'RR', temp: 'T', glucose: 'Glucose',
  cvp: 'CVP', flow: 'Flow', intake: 'In', urine: 'Urine', fio2: 'FiO₂', peep: 'PEEP', vt: 'Vt', rate: 'Rate', ps: 'PS', pinsp: 'Pinsp' }
const RANGE: Record<Num | VentField, [number, number]> = { hr: [20, 250], sys: [40, 300], dia: [10, 200], map: [20, 200], spo2: [50, 100], rr: [3, 60], temp: [30, 45],
  glucose: [10, 1000], cvp: [-5, 40], flow: [0.5, 60], fio2: [21, 100], peep: [0, 30], vt: [100, 1500], rate: [1, 60], ps: [0, 40], pinsp: [0, 50], intake: [0, 3000], urine: [0, 2000] }
const NUMS = Object.keys(LABEL).filter((k) => !['fio2', 'peep', 'vt', 'rate', 'ps', 'pinsp'].includes(k)) as Num[]
const VENT: VentField[] = ['fio2', 'peep', 'vt', 'rate', 'ps', 'pinsp']

/** a typed number: undefined when blank, NaN when not a number */
export function num(s: string | undefined): number | undefined {
  const t = (s ?? '').trim(); if (!t) return undefined
  return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : NaN
}
/** the ventilator's mode: the one chosen, else the one in force */
const modeOf = (d: HourDraft, now: HourNow): Mode | undefined => d.vent?.mode ?? now.vent?.data.mode
/** anything typed or chosen for the ventilator's settings */
const ventTouched = (d: HourDraft) => !!d.vent && Object.values(d.vent).some((v) => typeof v === 'string' && v.trim() !== '')
/** the typed numbers, by field: the vitals', the volumes', the ventilator's */
function typed(d: HourDraft): [Num | VentField, number][] {
  const out: [Num | VentField, number][] = []
  for (const k of NUMS) { const n = num(d[k]); if (n !== undefined) out.push([k, n]) }
  for (const k of VENT) { const n = num(d.vent?.[k]); if (n !== undefined) out.push([k, n]) }
  return out
}
/** the bag and weight a running infusion was worked out with */
export function bagIn(data: Infusion): { bag: Bag | null; unit: DoseUnit | null; kg: number | null } {
  const u = amountUnitOf(data.amount?.ucum); const a = Number(data.amount?.value); const v = Number(data.volume?.value); const w = Number(data.weight?.value)
  return { bag: u && a > 0 && v > 0 ? { amount: a, unit: u, volume: v } : null, unit: isDoseUnit(data.dose_unit) ? data.dose_unit : null, kg: w > 0 ? w : null }
}
/** a start's bag (the row's, or what was typed) and weight */
export function startBag(s: Start, row: UnitInfusion, now: HourNow): { bag: Bag | null; kg: number | null } {
  const b = bagOf(row); const a = num(s.amount) ?? b?.amount; const v = num(s.volume) ?? b?.volume; const u = row.amount_unit
  return { bag: u && a && v && a > 0 && v > 0 ? { amount: a, unit: u, volume: v } : null, kg: DOSE_UNITS[row.dose_unit].perKg ? now.kg ?? num(s.kg) ?? null : null }
}

/** what stops the sign, under its field: only what cannot be written */
export function problemsOf(d: HourDraft, now: HourNow, unit: UnitSetting): { field: string; text: string }[] {
  const out: { field: string; text: string }[] = []; const bad = (field: string, text: string) => out.push({ field, text })
  // a rate of 0 (typed, or a dose too small for the bag) is refused by the server: the pump's rate is above 0
  const zero = (field: string, x: { dose?: string; rate?: string }, bag: Bag | null, u: DoseUnit | null, kg: number | null, words: string) => {
    if (num(x.dose) === 0 || num(x.rate) === 0) return bad(field, words)
    const rd = rateDose(x, bag, u, kg); if (rd && Number(rd.rate?.value) <= 0) bad(field, 'Under 0.1 mL/h with this bag') }
  const check = (field: string, label: string, s: string | undefined, max?: number, negative = false) => { const n = num(s); if (n === undefined) return
    if (Number.isNaN(n)) bad(field, 'A number'); else if ((n < 0 && !negative) || (max !== undefined && n > max)) bad(field, `${label} ${n} is not possible`) }
  for (const k of NUMS) check(k, LABEL[k], d[k], k === 'spo2' ? 100 : undefined, k === 'cvp')
  for (const k of VENT) check(k, LABEL[k], d.vent?.[k], k === 'fio2' ? 100 : undefined)
  const sys = num(d.sys); const dia = num(d.dia)
  if ((sys === undefined) !== (dia === undefined)) bad('bp', 'BP needs both: 118/56')
  else if (sys !== undefined && dia !== undefined && sys <= dia) bad('bp', 'The systolic is below the diastolic')
  const fio2 = num(d.vent?.fio2); if (fio2 !== undefined && fio2 > 0 && fio2 <= 1) bad('fio2', 'FiO₂ is a percentage: 40')
  else if (fio2 !== undefined && fio2 >= 0 && fio2 < 21) bad('fio2', `FiO₂ ${fio2} is not possible: 21 to 100`)
  if (d.o2 === 'air' && num(d.flow) !== undefined) bad('flow', 'Air and oxygen at once')
  if (d.ventOn && !now.airway && !d.vent?.mode) bad('mode', 'Choose the mode')
  if (modeOf(d, now) === 'other' && !d.vent?.mode_text?.trim() && !(now.vent?.data.mode === 'other' && now.vent.data.mode_text?.trim())) bad('mode', 'Name the mode')
  // a change charted at an earlier hour than the item's latest version would be written over it: chart it at that hour or later
  const end = Date.parse(plusHours(d.hour, 1))
  const later = (field: string, h: { latestAt: string } | null | undefined) => {
    if (h && Date.parse(h.latestAt) >= end) bad(field, `Changed at ${hourLabel(h.latestAt)}:00 since: chart the change at that hour or later`) }
  if (now.airway && d.ventOff) later('mode', now.airway)
  else if (now.airway && ventTouched(d)) later('mode', now.vent)
  for (const r of now.running) {
    const x = d.doses[r.item]; if (!x || (!x.stop && num(x.dose) === undefined && num(x.rate) === undefined)) continue
    later(`dose:${r.item}`, r); if (x.stop) continue
    check(`dose:${r.item}`, 'The dose', x.dose); check(`dose:${r.item}`, 'The rate', x.rate)
    if (num(x.dose) !== undefined && num(x.rate) !== undefined) bad(`dose:${r.item}`, 'Type the dose or the rate, not both')
    else if (num(x.dose) !== undefined) { const b = bagIn(r.data); if (!b.bag || !b.unit) bad(`dose:${r.item}`, 'This infusion has no bag here: type its rate')
      else zero(`dose:${r.item}`, x, b.bag, b.unit, b.kg, 'Above 0: to stop it, use Stop') }
    else zero(`dose:${r.item}`, x, null, null, null, 'Above 0: to stop it, use Stop')
  }
  d.starts.forEach((s, i) => {
    const row = infusionOf(unit, s.key); const f = `start:${i}`; if (!row) return bad(f, 'Not on the unit\'s list')
    for (const [k, label] of [['dose', 'The dose'], ['rate', 'The rate'], ['amount', 'The amount'], ['volume', 'The volume'], ['kg', 'The weight']] as const) check(f, label, s[k])
    if (num(s.dose) === undefined && num(s.rate) === undefined) bad(f, 'Its dose or its rate')
    if (num(s.dose) !== undefined && num(s.rate) !== undefined) bad(f, 'Type the dose or the rate, not both')
    const { bag, kg } = startBag(s, row, now)
    if (!bag) bad(f, 'Its bag: the amount and the volume')
    else if (DOSE_UNITS[row.dose_unit].perKg && !kg) bad(f, 'A dose per kg needs the weight: type it')
    else { const p = fitProblem(bag, row.dose_unit, kg); if (p) bad(f, p); else zero(f, s, bag, row.dose_unit, kg, 'Above 0') }
  })
  return out
}
/** a value outside its usual range: shown under its field, never a stop */
export function rangeNotices(d: HourDraft): { field: string; text: string }[] {
  return typed(d).filter(([k, n]) => !Number.isNaN(n) && (n >= 0 || k === 'cvp') && !(k === 'spo2' && n > 100) && !(k === 'fio2' && (n > 100 || n < 21)) && (n < RANGE[k][0] || n > RANGE[k][1])).map(([k, n]) => ({ field: k === 'sys' || k === 'dia' ? 'bp' : k, text: `${LABEL[k]} ${n} is outside ${RANGE[k][0]}–${RANGE[k][1]}: check it` }))
}

const norm = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
/** the same drug by its whole name: lower case, the words in brackets dropped, spaces collapsed */
export const sameName = (a: string, b: string) => norm(a) === norm(b)
const firstWord = (s: string) => norm(s).split(' ')[0] ?? ''
/** a start's prescription: the same ATC code, else the same whole name; those sharing only the first word are offered, never linked */
export function linkOf(row: UnitInfusion, prescriptions: Prescription[]): { linked: Prescription | null; candidates: Prescription[] } {
  const linked = (row.atc ? prescriptions.find((p) => p.atc === row.atc) : undefined) ?? prescriptions.find((p) => sameName(p.drug.text, row.name)) ?? null
  return { linked, candidates: linked ? [] : prescriptions.filter((p) => firstWord(p.drug.text) === firstWord(row.name)) }
}
/** shown, never a stop */
export function noticesOf(d: HourDraft, now: HourNow, unit: UnitSetting, signedBy: string[]): { text: string; tone?: 'warn' }[] {
  const out: { text: string; tone?: 'warn' }[] = []
  for (const s of d.starts) { const row = infusionOf(unit, s.key)
    if (row && !s.medication && !linkOf(row, now.prescriptions).linked) out.push({ text: `No prescription for ${row.name} on the record`, tone: 'warn' }) }
  if (signedBy.length) out.push({ text: `${hourLabel(d.hour)}:00 has entries by ${signedBy.join(', ')}: this adds to them` })
  return out
}

/** a decimal as the record writes it: 0.5, not .5 or 5. */
const dec = (n: number) => String(n)
const q = (n: number | undefined, unit: string, ucum: string): Quantity | undefined => n === undefined || Number.isNaN(n) ? undefined : { value: dec(n), unit, ucum }
const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
/** the rate and the dose written for a typed dose or rate: the rate to 0.1 mL/h, the dose the one that rate gives */
function rateDose(x: { dose?: string; rate?: string }, bag: Bag | null, u: DoseUnit | null, kg: number | null): Pick<Infusion, 'rate' | 'dose'> | null {
  const dose = num(x.dose); let rate = num(x.rate)
  if (dose !== undefined && bag && u) rate = rateFor(dose, bag, u, kg) ?? undefined
  if (rate === undefined || Number.isNaN(rate)) return null
  rate = roundTo(rate, 1); const given = bag && u ? doseFor(rate, bag, u, kg) : null
  return { rate: { value: dec(rate), unit: 'mL/h', ucum: 'mL/h' }, ...(given !== null && u ? { dose: clean({ value: dec(given), unit: DOSE_UNITS[u].words, ucum: DOSE_UNITS[u].ucum ?? undefined }) } : {}) }
}
/** the rate a typed dose gives, or the dose a typed rate gives, for the card's "= …" */
export function otherHalf(x: { dose?: string; rate?: string }, bag: Bag | null, u: DoseUnit | null, kg: number | null): string | null {
  const r = rateDose(x, bag, u, kg); if (!r) return null
  return num(x.dose) !== undefined ? `${r.rate!.value} mL/h` : r.dose ? `${r.dose.value} ${r.dose.unit}` : null
}

/** a setting differs from the one in force, by value (the server's quantities keep their keys in another order) */
function ventChanged(d: HourDraft, typed: Partial<Vent>, was: Vent): boolean {
  if (typed.mode !== undefined && typed.mode !== was.mode) return true
  if (typed.mode_text !== undefined && typed.mode_text !== (was.mode_text ?? '').trim()) return true
  return VENT.some((k) => { const n = num(d.vent?.[k]); return n !== undefined && !Number.isNaN(n) && n !== Number(was[k]?.value) })
}
/** the set: every entry at the column's hour, in the stay and the department; nothing for a blank field */
export function entriesOf(d: HourDraft, now: HourNow, unit: UnitSetting, where: { patientId: string; departmentId: string; stay: string }, id: () => string): { entries: EntryIn[]; seen: Record<string, number> } {
  const at = { patient_id: where.patientId, department_id: where.departmentId, visit_id: where.stay, occurred_at: d.hour, precision: 'minute' }
  const entries: EntryIn[] = []; const seen: Record<string, number> = {}
  const n = (k: Num) => { const x = num(d[k]); return x === undefined || Number.isNaN(x) ? undefined : x }
  const sys = n('sys'); const dia = n('dia')
  const vit = clean<EntryData['vitals']>({ hr: q(n('hr'), 'bpm', '/min'), bp: sys !== undefined && dia !== undefined ? { sys: q(sys, 'mmHg', 'mm[Hg]')!, dia: q(dia, 'mmHg', 'mm[Hg]')! } : undefined,
    rr: q(n('rr'), '/min', '/min'), temp: q(n('temp'), '°C', 'Cel'), spo2: q(n('spo2'), '%', '%'), glucose: q(n('glucose'), 'mg/dL', 'mg/dL'), consciousness: d.acvpu,
    oxygen: d.o2 === 'air' ? { on: 'air' } : d.o2 === 'oxygen' ? clean({ on: 'oxygen' as const, flow: q(n('flow'), 'L/min', 'L/min') }) : undefined })
  if (Object.keys(vit).length) entries.push({ id: id(), ...at, type: 'vitals', data: vit })
  for (const k of ['map', 'cvp', 'intake', 'urine'] as ObsKey[]) { const v = n(k); if (v === undefined) continue
    entries.push({ id: id(), ...at, type: 'observation', data: { code: concept('loinc', OBS[k].code, OBS[k].label), value: { quantity: q(v, OBS[k].unit, OBS[k].ucum)! } } }) }
  const ventTyped = clean<Partial<Vent>>({ mode: d.vent?.mode, mode_text: modeOf(d, now) === 'other' ? d.vent?.mode_text?.trim() || undefined : undefined,
    fio2: q(num(d.vent?.fio2), '%', '%'), peep: q(num(d.vent?.peep), 'cmH₂O', 'cm[H2O]'), vt: q(num(d.vent?.vt), 'mL', 'mL'), rate: q(num(d.vent?.rate), '/min', '/min'),
    ps: q(num(d.vent?.ps), 'cmH₂O', 'cm[H2O]'), pinsp: q(num(d.vent?.pinsp), 'cmH₂O', 'cm[H2O]') })
  if (d.ventOn && !now.airway) {
    const a = AIRWAY[d.ventOn]
    entries.push({ id: id(), ...at, type: 'procedure', data: { concept: concept('local.procedure', a.code, a.label), status: 'in-progress', performed: { value: d.hour, precision: 'minute' } } })
    if (ventTyped.mode) entries.push({ id: id(), ...at, type: 'intensive.vent', data: ventTyped as Vent })
  } else if (now.airway && d.ventOff) {
    entries.push({ id: id(), ...at, type: 'procedure', data: { ...now.airway.data, status: 'completed', outcome: AIRWAY[now.airway.kind].outcome }, refers_to: now.airway.entry, relation: 'changes' })
    seen[now.airway.item] = now.airway.version
  } else if (now.airway && Object.keys(ventTyped).length) {
    if (!now.vent) { if (ventTyped.mode) entries.push({ id: id(), ...at, type: 'intensive.vent', data: ventTyped as Vent }) }
    else { const next = { ...now.vent.data, ...ventTyped }; if (next.mode !== 'other') delete next.mode_text
      if (ventChanged(d, ventTyped, now.vent.data)) {
        entries.push({ id: id(), ...at, type: 'intensive.vent', data: next, refers_to: now.vent.entry, relation: 'changes' }); seen[now.vent.item] = now.vent.version } }
  }
  for (const r of now.running) {
    const x = d.doses[r.item]; if (!x) continue
    const last = r.data; let data: Infusion | null = null
    if (x.stop) data = clean<Infusion>({ drug: last.drug, medication: last.medication, key: last.key, dose_unit: last.dose_unit, amount: last.amount, volume: last.volume, weight: last.weight, status: 'stopped' })
    else { const b = bagIn(last); const rd = rateDose(x, b.bag, b.unit, b.kg)
      if (rd && Number(rd.rate?.value) !== Number(last.rate?.value)) { const { dose: _old, ...rest } = last; void _old; data = { ...rest, status: 'running', ...rd } } }
    if (!data) continue
    entries.push({ id: id(), ...at, type: 'intensive.infusion', data, refers_to: r.entry, relation: 'changes' }); seen[r.item] = r.version
  }
  for (const s of d.starts) {
    const row = infusionOf(unit, s.key); if (!row) continue
    const { bag, kg } = startBag(s, row, now); const rd = rateDose(s, bag, row.dose_unit, kg); if (!rd || !bag) continue
    const { linked } = linkOf(row, now.prescriptions)
    const drug: Concept = linked && row.atc && linked.atc === row.atc ? linked.drug : clean({ text: row.name, codings: row.atc ? [{ system: 'atc', code: row.atc, display: row.name }] : undefined })
    entries.push({ id: id(), ...at, type: 'intensive.infusion', data: clean<Infusion>({ drug, medication: s.medication ?? linked?.item, key: row.key, status: 'running', ...rd, dose_unit: row.dose_unit,
      amount: q(bag.amount, AMOUNT_UNITS[bag.unit].words, AMOUNT_UNITS[bag.unit].ucum), volume: q(bag.volume, 'mL', 'mL'), weight: kg ? q(kg, 'kg', 'kg') : undefined }) })
  }
  return { entries, seen }
}
/** nothing typed or chosen */
export const isEmpty = (d: HourDraft) => typed(d).length === 0 && !d.acvpu && !d.o2 && !d.vent?.mode && !d.vent?.mode_text?.trim() && !d.ventOn && !d.ventOff && d.starts.length === 0
  && !Object.values(d.doses).some((x) => x.stop || num(x.dose) !== undefined || num(x.rate) !== undefined)
