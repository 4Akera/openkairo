// The birth card's model (spec/openCare.md §5.6): what the midwife or the obstetrician fills — when, by whom,
// how, the perineum, the third stage (oxytocin as the base's given, the placenta, the blood loss), and each baby: sex, weight, Apgar at 1
// and 5 minutes (the server adds them up), breathing at birth, the doses, the cot — and the ONE set its Sign writes: the mother's birth,
// her oxytocin and her pregnancy's end; each baby's new record (the owner's Q10, 2026-10-08: "mother of", twins, all or nothing), its
// stay, weight, Apgar scores and doses as the base's entries. The PPH notice (WHO: 500 mL or more after a vaginal birth, 1000 after a
// caesarean) is a notice only. Oxytocin's and vitamin K's doses are chosen by Claude in the build, awaiting the owner. Pure.
import type { EntryIn, NewPatient } from '@core/db/rpc'
import type { EntryData, Quantity } from '@core/db/shapes.generated'
import type { Place, PresenceRow } from '@core/db/types'
import { keyOf } from '@core/screens/visit/score'
import { hm, ymd } from '@core/ui/time'
import { APGAR, apgarComplete, apgarStarted, type ApgarInputs } from './apgar'

type Birth = EntryData['obgyn.birth']
export type Mode = Birth['mode']
export type Perineum = NonNullable<Birth['perineum']>
export type Sex = 'female' | 'male' | 'unknown'
export type Breathing = 'cried' | 'rubbed' | 'bag_mask'
export interface Doses { vitamin_k: boolean; eye: boolean; hep_b: boolean }
/** one baby on the card: its record's id and its stay's, chosen when the card opens and kept, so a resend makes the same records */
export interface BabyDraft { id: string; stayId: string; sex?: Sex; grams?: number; breathing?: Breathing; apgar1: ApgarInputs; apgar5: ApgarInputs; doses: Doses
  /** a place id, null for "No cot here" */
  cot: string | null }
export interface BirthDraft { bornAt: string; by: string; mode?: Mode; perineum?: Perineum; episiotomy: boolean; repaired: boolean; oxytocin: boolean
  placenta?: 'complete' | 'incomplete'; bloodLoss?: number; babies: BabyDraft[] }

export const MODES: [Mode, string][] = [['normal', 'Normal'], ['vacuum', 'Vacuum'], ['forceps', 'Forceps'], ['breech', 'Breech, vaginal'], ['caesarean', 'Caesarean']]
export const PERINEUM: [Perineum, string][] = [['intact', 'No tear'], ['first', '1st degree'], ['second', '2nd degree'], ['third', '3rd degree'], ['fourth', '4th degree']]
export const SEXES: [Sex, string][] = [['female', 'Girl'], ['male', 'Boy'], ['unknown', 'Not sure']]
export const BREATHING: [Breathing, string][] = [['cried', 'Cried at once'], ['rubbed', 'Needed rubbing'], ['bag_mask', 'Bag and mask']]
/** most babies on one card */
export const MOST_BABIES = 4
const MINUTE = 60_000
const minuteOf = (t: number) => Math.floor(t / MINUTE) * MINUTE

const baby = (ids: () => string, cot: string | null): BabyDraft =>
  ({ id: ids(), stayId: ids(), apgar1: {}, apgar5: {}, doses: { vitamin_k: true, eye: true, hep_b: false }, cot })
/** a card as it opens: born now (to the minute), by me, oxytocin on; one baby with vitamin K and eye ointment on, hepatitis B off, the
 *  first free cot */
export function emptyBirth(now: Date, me: string, ids: () => string, freeCots: string[]): BirthDraft {
  return { bornAt: new Date(minuteOf(now.getTime())).toISOString(), by: me, episiotomy: false, repaired: false, oxytocin: true, babies: [baby(ids, freeCots[0] ?? null)] }
}
/** another baby (twins and more, up to four): the next free cot no other baby of the card has */
export function addBaby(d: BirthDraft, ids: () => string, freeCots: string[]): BirthDraft {
  if (d.babies.length >= MOST_BABIES) return d
  const taken = new Set(d.babies.map((b) => b.cot))
  return { ...d, babies: [...d.babies, baby(ids, freeCots.find((c) => !taken.has(c)) ?? null)] }
}
/** How chosen: a caesarean has no perineum, episiotomy or repair, so they are cleared */
export const withMode = (d: BirthDraft, mode: Mode | undefined): BirthDraft =>
  mode === 'caesarean' ? { ...d, mode, perineum: undefined, episiotomy: false, repaired: false } : { ...d, mode }
/** "HH:MM" typed on the card as the last such time in the clinic's zone: today's, or yesterday's when today's is still to come (a
 *  birth at 23:55 signed at 00:05 is last night's) */
export function clockTime(hhmm: string, now: number): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim()); if (!m || +m[1] > 23 || +m[2] > 59) return null
  const at = minuteOf(now); const [h, mi] = hm(new Date(at).toISOString()).split(':').map(Number)
  let t = at + ((+m[1] * 60 + +m[2]) - (h * 60 + mi)) * MINUTE
  if (t > now + MINUTE) t -= 24 * 60 * MINUTE
  return new Date(t).toISOString()
}

/** the third stage's oxytocin by How: 5 units by slow IV injection at a caesarean, else 10 units IM */
export const oxytocinOf = (mode?: Mode): { dose: number; route: 'im' | 'iv'; words: string } =>
  mode === 'caesarean' ? { dose: 5, route: 'iv', words: '5 units slow IV' } : { dose: 10, route: 'im', words: '10 units IM' }
/** vitamin K by the weight: 0.5 mg under 1500 g (the preterm dose), else 1 mg, IM */
export const vitaminKOf = (grams?: number): { mg: 1 | 0.5; words: string } =>
  grams !== undefined && grams < 1500 ? { mg: 0.5, words: '0.5 mg IM' } : { mg: 1, words: '1 mg IM' }
/** the baby's name until the desk gives one: "Baby of Salma Ahmed Abdelrahman"; twins and more "Baby 1 of …" */
export const babyName = (mother: string, n: number, of: number) => of > 1 ? `Baby ${n} of ${mother}` : `Baby of ${mother}`
/** the PPH notice (WHO): 500 mL or more after a vaginal birth, 1000 or more after a caesarean; none before the blood loss is said */
export function pphOf(d: Pick<BirthDraft, 'mode' | 'bloodLoss'>): { ml: number; over: boolean; words: string } | null {
  if (d.bloodLoss === undefined) return null
  const cs = d.mode === 'caesarean'; const limit = cs ? 1000 : 500; const over = d.bloodLoss >= limit
  return { ml: d.bloodLoss, over, words: over ? `PPH: ${d.bloodLoss} mL (${limit} or more after ${cs ? 'a caesarean' : 'a vaginal birth'}). Tell the doctor now. Only a notice.` : '' }
}

/** what blocks Sign, each said under its field (baby fields as "baby0.sex") */
export function problemsOf(d: BirthDraft, now: number): { field: string; text: string }[] {
  const out: { field: string; text: string }[] = []
  if (!d.mode) out.push({ field: 'mode', text: 'How was she delivered?' })
  // the birth's check refuses it (obgyn.birth_check): said here first
  if (d.mode !== 'caesarean' && d.perineum === 'intact' && d.episiotomy) out.push({ field: 'perineum', text: 'An episiotomy: the perineum is not intact — choose the degree' })
  const t = Date.parse(d.bornAt)
  if (!Number.isFinite(t)) out.push({ field: 'bornAt', text: 'The birth time: HH:MM' })
  // a minute's grace for the tab's clock, which ticks once a minute (the writer refuses an Apgar at 5 minutes dated past its own clock + 5)
  else if (t > now + MINUTE) out.push({ field: 'bornAt', text: 'The birth time is after now' })
  else if (t < now - 24 * 60 * MINUTE) out.push({ field: 'bornAt', text: 'A birth more than a day ago: write it in the chart' })
  d.babies.forEach((b, i) => {
    if (!b.sex) out.push({ field: `baby${i}.sex`, text: 'Girl, boy or not sure' })
    if (b.grams === undefined || !Number.isInteger(b.grams) || b.grams < 300 || b.grams > 6500) out.push({ field: `baby${i}.grams`, text: 'The weight in grams, 300–6500' })
    if (apgarStarted(b.apgar1) && !apgarComplete(b.apgar1)) out.push({ field: `baby${i}.apgar1`, text: 'Apgar at 1 minute: all five signs, or none' })
    if (apgarStarted(b.apgar5) && !apgarComplete(b.apgar5)) out.push({ field: `baby${i}.apgar5`, text: 'Apgar at 5 minutes: all five signs, or none' })
  })
  if (d.bloodLoss !== undefined && (!Number.isInteger(d.bloodLoss) || d.bloodLoss < 0 || d.bloodLoss > 5000)) out.push({ field: 'bloodLoss', text: 'Blood loss in mL, 0–5000' })
  return out
}

/** the server's Apgar answer the set writes (its total, its band's key, the version it used), or null while it has not come */
export type ApgarAnswer = (inputs: ApgarInputs) => { total: number; band: string; version: string } | null
/** the key the server's answer is kept under (the score card's) */
export const apgarKey = (version: string, inputs: ApgarInputs) => keyOf({ score: APGAR, version, inputs: inputs as Record<string, string> })
/** an Apgar complete whose server answer has not come: Sign waits ("Adding up Apgar…") */
export const apgarWaiting = (d: BirthDraft, answer: ApgarAnswer) =>
  d.babies.some((b) => [b.apgar1, b.apgar5].some((a) => apgarComplete(a) && !answer(a)))

/** a place named "Cot …" */
export const isCot = (p: Pick<Place, 'name'>) => /^cot\b/i.test(p.name)
/** this department's free places for a baby: not closed and held by no stay; the free cots, or every free place when no cot is free
 *  (the card chooses only a cot for itself: the others are offered, never chosen) */
export function freeCots(places: readonly Place[], rows: readonly Pick<PresenceRow, 'place_id' | 'state'>[], deptId: string): Place[] {
  const held = new Set(rows.filter((r) => r.state === 'admitted' && r.place_id).map((r) => r.place_id))
  const free = places.filter((p) => p.department_id === deptId && !p.closed && !held.has(p.id)).sort((a, b) => a.position - b.position)
  const cots = free.filter(isCot)
  return cots.length ? cots : free
}

const q = (value: number, unit: string, ucum: string): Quantity => ({ value: String(value), unit, ucum })
const plus = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * MINUTE).toISOString()
const NEWBORN: Record<keyof Doses, (grams?: number) => EntryData['given']> = {
  vitamin_k: (g) => ({ drug: { text: 'Vitamin K (phytomenadione)' }, dose: q(vitaminKOf(g).mg, 'mg', 'mg'), route: 'im', status: 'completed' }),
  eye: () => ({ drug: { text: 'Eye ointment (tetracycline 1%)' }, route: 'eye', status: 'completed' }),
  hep_b: () => ({ drug: { text: 'Hepatitis B vaccine' }, dose: q(0.5, 'mL', 'mL'), route: 'im', status: 'completed' }),
}
export interface Where { mother: string; motherName: string; stay: string; dept: string
  pregnancy: { entry: string; item: string; version: number; data: EntryData['pregnancy'] } | null; apgar: ApgarAnswer }

/** the one set's entries in their order — the mother's birth first (the writer takes her as the newborns' mother), her oxytocin, her
 *  pregnancy's end; then each baby: admitted (its own stay), its weight, Apgar at 1 and 5 minutes, its doses — and the babies' records */
export function entriesOf(d: BirthDraft, w: Where, newId: () => string, now = Date.now()): { entries: EntryIn[]; patients: NewPatient[]; seen: Record<string, number> } {
  const mode = d.mode ?? 'normal'; const at = d.bornAt
  const mum = { patient_id: w.mother, department_id: w.dept, visit_id: w.stay }
  const birth: Birth = { mode, ...(mode !== 'caesarean' && d.perineum ? { perineum: d.perineum } : {}), ...(mode !== 'caesarean' && d.episiotomy ? { episiotomy: true } : {}),
    ...(mode !== 'caesarean' && d.repaired ? { repaired: true } : {}), ...(d.placenta ? { placenta: d.placenta } : {}),
    ...(d.bloodLoss !== undefined ? { blood_loss: q(d.bloodLoss, 'mL', 'mL') } : {}), delivered_by: { to: 'user', id: d.by },
    babies: d.babies.map((b) => ({ patient: { to: 'patient' as const, id: b.id }, born_at: at, sex: b.sex ?? 'unknown', ...(b.grams !== undefined ? { grams: b.grams } : {}),
      ...(b.breathing ? { breathing: b.breathing } : {}) })) }
  const entries: EntryIn[] = [{ id: newId(), type: 'obgyn.birth', ...mum, occurred_at: at, data: birth }]
  if (d.oxytocin) { const o = oxytocinOf(mode)
    entries.push({ id: newId(), type: 'given', ...mum, occurred_at: plus(at, 1), data: { drug: { text: 'Oxytocin', codings: [] }, dose: q(o.dose, 'units', '[iU]'), route: o.route,
      ...(mode === 'caesarean' ? { note: 'slow IV' } : {}), status: 'completed' } }) }
  const seen: Record<string, number> = {}
  if (w.pregnancy) {
    entries.push({ id: newId(), type: 'pregnancy', ...mum, occurred_at: at, refers_to: w.pregnancy.entry, relation: 'changes', data: { ...w.pregnancy.data, status: 'ended', reason: 'delivered' } })
    seen[w.pregnancy.item] = w.pregnancy.version
  }
  const given = new Date(Math.max(minuteOf(now), Date.parse(at))).toISOString()
  d.babies.forEach((b) => {
    const head = { patient_id: b.id, department_id: w.dept, visit_id: b.stayId }
    entries.push({ id: b.stayId, type: 'admitted', ...head, occurred_at: at, data: { department_id: w.dept, ...(b.cot ? { place_id: b.cot } : {}), admit_source: 'born', reason: 'born here' } })
    if (b.grams !== undefined) entries.push({ id: newId(), type: 'vitals', ...head, occurred_at: at, data: { weight: q(+(b.grams / 1000).toFixed(3), 'kg', 'kg') } })
    for (const [inputs, note, m] of [[b.apgar1, '1 min', 1], [b.apgar5, '5 min', 5]] as const) {
      const r = apgarComplete(inputs) ? w.apgar(inputs) : null
      if (r) entries.push({ id: newId(), type: 'score', ...head, occurred_at: plus(at, m), data: { score: APGAR, version: r.version, inputs: { ...inputs }, total: r.total, band: r.band, note } })
    }
    for (const k of ['vitamin_k', 'eye', 'hep_b'] as const) if (b.doses[k]) entries.push({ id: newId(), type: 'given', ...head, occurred_at: given, data: NEWBORN[k](b.grams) })
  })
  const patients = d.babies.map((b, i): NewPatient => ({ id: b.id, mother: w.mother, full_name: babyName(w.motherName, i + 1, d.babies.length), gender: b.sex ?? 'unknown',
    birth_date: ymd(at), department_id: w.dept }))
  return { entries, patients, seen }
}
