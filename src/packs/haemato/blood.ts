// What the Transfusions section reads (spec/openCare.md §5.7; the pictures #haem-blood, #haem-bedside), all the base's but the programme:
// the blood group and antibody screen (the Blood bank's results, LOINC 882-1 and 890-4), each unit given (the base's given: the unit
// number its lot, the volume its dose, what happened in its note), the Hb before each, the ferritin, the chelation (V03AC) at mg/kg,
// its checks; the programme is this pack's own. Pure (npm run test:haemato).
import type { Medication, ServerEntry, ValueRow } from '@core/db/types'

const newest = (a: { occurred_at: string }, b: { occurred_at: string }) => b.occurred_at.localeCompare(a.occurred_at)
type Analyte = { key: string; code?: { code: string }; text?: string; value?: { value: string } }
const analytes = (e: ServerEntry) => (e.data?.analytes as Analyte[] | undefined) ?? []
/** the latest text a result gave for a LOINC code (the group, the screen), with its date */
export function resultText(own: ServerEntry[], loinc: string) {
  for (const e of [...own].filter((x) => x.type === 'result').sort(newest)) { const a = analytes(e).find((x) => x.code?.code === loinc && x.text); if (a) return { text: a.text!, at: e.occurred_at, id: e.id } }
  return null
}
/** "O Rh positive" → "O Rh+" */
export const shortGroup = (g: string) => g.replace(/ Rh positive$/i, ' Rh+').replace(/ Rh negative$/i, ' Rh−')
const PRODUCT = /^(red cells|platelets|plasma|ffp|cryo)/i
/** a unit of blood given: the base's given whose medicine is a blood product */
export const isUnit = (e: ServerEntry) => e.type !== 'crossed_out' && typeof (e.data?.drug as { text?: string } | undefined)?.text === 'string' && PRODUCT.test((e.data!.drug as { text: string }).text)
  && (e.type === 'given' || !!e.data?.lot)
export interface Unit { id: string; at: string; product: string; unit: string | null; ml: number | null; note: string | null; stopped: boolean }
export const unitsOf = (own: ServerEntry[]): Unit[] => own.filter(isUnit).sort(newest).map((e) => ({ id: e.id, at: e.occurred_at, product: String((e.data!.drug as { text: string }).text),
  unit: typeof e.data?.lot === 'string' ? e.data.lot : null, ml: (e.data?.dose as { value?: string } | undefined)?.value ? Number((e.data!.dose as { value: string }).value) : null,
  note: typeof e.data?.note === 'string' ? e.data.note : null, stopped: /\bstopped\b/i.test(String(e.data?.note ?? '')) }))
export interface Session { day: string; units: Unit[]; hb: number | null; ml: number; perKg: number | null }
/** the transfusions by day, the newest first: how many units, the Hb before (the last on or before that day), mL/kg at the weight then */
export function sessionsOf(units: Unit[], values: ValueRow[]): Session[] {
  const by = new Map<string, Unit[]>(); for (const u of units) { const d = u.at.slice(0, 10); by.set(d, [...(by.get(d) ?? []), u]) }
  const before = (code: string, key: string | null, day: string) => values.filter((v) => (v.code === code || (key && v.key === key)) && v.at.slice(0, 10) <= day).sort((a, b) => b.at.localeCompare(a.at))[0]?.value ?? null
  return [...by.entries()].map(([day, us]) => { const ml = us.reduce((s, u) => s + (u.ml ?? 0), 0); const kg = before('loinc:29463-7', 'weight', day)
    return { day, units: us, hb: before('loinc:718-7', null, day), ml, perKg: kg ? Math.round(ml / kg) : null } })
}
export interface Programme { every_weeks: number; hb: { low: number; high: number }; needs?: string[]; condition?: string; at: string }
export const programmeOf = (own: ServerEntry[]): Programme | null => { const e = own.filter((x) => x.type === 'haemato.programme').sort(newest)[0]
  return e && e.data?.status !== 'stopped' ? { ...(e.data as unknown as Programme), at: e.occurred_at } : null }
/** the chelation on the list (deferasirox, deferiprone, deferoxamine) and its mg/kg at the latest weight */
export function chelationOf(meds: Medication[], values: ValueRow[]) {
  const m = meds.find((x) => x.drug_code?.startsWith('atc:V03AC')); if (!m) return null
  const kg = values.filter((v) => v.key === 'weight').sort((a, b) => b.at.localeCompare(a.at))[0]?.value ?? null
  const perDay = m.dose_number != null ? m.dose_number * ({ OD: 1, QD: 1, BD: 2, BID: 2, TDS: 3, TID: 3 } as Record<string, number>)[m.frequency ?? 'OD'] : null
  return { med: m, kg, perKg: perDay != null && kg ? Math.round(perDay / kg) : null }
}
export const latest = (values: ValueRow[], code: string) => values.filter((v) => v.code === code).sort((a, b) => b.at.localeCompare(a.at))
