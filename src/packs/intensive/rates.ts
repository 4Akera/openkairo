// An infusion's arithmetic (spec/openCare.md §5.6): the pump's rate in mL/h is what the nurse sets; the dose is always the dose that
// rate gives, from the bag (its amount and its volume) and, for a dose per kg, the weight. The server's intensive.dose_exact does the
// same sums and refuses a dose that is not the rate's. UCUM only where a code is exact (µg/kg/min, mg/h); the others are words. Pure.

export type DoseUnit = 'ug/kg/min' | 'ug/min' | 'ug/h' | 'mg/h' | 'mg/kg/h' | 'g/h' | 'units/h'
export type AmountUnit = 'ug' | 'mg' | 'g' | 'units'

interface DoseInfo { words: string; ucum: string | null; perKg: boolean; perMin: boolean; decimals: number; scale: number }
/** each dose unit: its words, its exact UCUM code (or none), per kg, per minute, the decimals it is written with, µg (or units) in one */
export const DOSE_UNITS: Record<DoseUnit, DoseInfo> = {
  'ug/kg/min': { words: 'µg/kg/min', ucum: 'ug/kg/min', perKg: true, perMin: true, decimals: 2, scale: 1 },
  'ug/min': { words: 'µg/min', ucum: null, perKg: false, perMin: true, decimals: 1, scale: 1 },
  'ug/h': { words: 'µg/h', ucum: null, perKg: false, perMin: false, decimals: 0, scale: 1 },
  'mg/h': { words: 'mg/h', ucum: 'mg/h', perKg: false, perMin: false, decimals: 1, scale: 1000 },
  'mg/kg/h': { words: 'mg/kg/h', ucum: null, perKg: true, perMin: false, decimals: 2, scale: 1000 },
  'g/h': { words: 'g/h', ucum: null, perKg: false, perMin: false, decimals: 2, scale: 1_000_000 },
  'units/h': { words: 'units/h', ucum: null, perKg: false, perMin: false, decimals: 1, scale: 1 },
}
/** a bag's amount: its words, its UCUM code, and µg in one (null: units, not a mass) */
export const AMOUNT_UNITS: Record<AmountUnit, { words: string; ucum: string; ug: number | null }> = {
  ug: { words: 'µg', ucum: 'ug', ug: 1 }, mg: { words: 'mg', ucum: 'mg', ug: 1000 }, g: { words: 'g', ucum: 'g', ug: 1_000_000 }, units: { words: 'units', ucum: '[iU]', ug: null },
}
export const isDoseUnit = (u: unknown): u is DoseUnit => typeof u === 'string' && Object.hasOwn(DOSE_UNITS, u)
/** a bag's amount unit from its UCUM code */
export const amountUnitOf = (ucum: unknown): AmountUnit | null => (Object.keys(AMOUNT_UNITS) as AmountUnit[]).find((k) => AMOUNT_UNITS[k].ucum === ucum) ?? null

export interface Bag { amount: number; unit: AmountUnit; volume: number }

/** x to n decimals, as a person rounds it (1.005 → 1.01) */
export function roundTo(x: number, n: number): number {
  const r = Number(`${Math.round(Number(`${x}e${n}`))}e-${n}`)
  return Number.isFinite(r) ? r : Math.round(x * 10 ** n) / 10 ** n
}

/** what one mL/h of the bag is in the dose's unit, as a fraction num / den; null when the bag and the unit do not go together */
function perMl(bag: Bag, unit: DoseUnit, kg: number | null): { num: number; den: number } | null {
  const d = DOSE_UNITS[unit]; const a = AMOUNT_UNITS[bag.unit]
  if (!(bag.volume > 0) || !(bag.amount > 0)) return null
  if ((unit === 'units/h') !== (bag.unit === 'units')) return null
  if (d.perKg && !(kg && kg > 0)) return null
  return { num: bag.amount * (a.ug ?? 1), den: bag.volume * (d.perKg ? kg! : 1) * (d.perMin ? 60 : 1) * d.scale }
}
/** the dose a rate gives, unrounded */
export function doseExact(rate: number, bag: Bag, unit: DoseUnit, kg: number | null): number | null {
  const p = perMl(bag, unit, kg); return p ? rate * p.num / p.den : null
}
/** the dose a rate gives, at the unit's decimals */
export function doseFor(rate: number, bag: Bag, unit: DoseUnit, kg: number | null): number | null {
  const x = doseExact(rate, bag, unit, kg); return x === null ? null : roundTo(x, DOSE_UNITS[unit].decimals)
}
/** the rate that gives a dose, to 0.1 mL/h */
export function rateFor(dose: number, bag: Bag, unit: DoseUnit, kg: number | null): number | null {
  const p = perMl(bag, unit, kg); return p ? roundTo(dose * p.den / p.num, 1) : null
}
/** why a bag cannot give this dose unit, in words; null when it can */
export function fitProblem(bag: Bag, unit: DoseUnit, kg: number | null): string | null {
  if (unit === 'units/h' && bag.unit !== 'units') return `This bag is in ${AMOUNT_UNITS[bag.unit].words}: a units/h dose needs a bag in units`
  if (unit !== 'units/h' && bag.unit === 'units') return `This bag is in units: a ${DOSE_UNITS[unit].words} dose needs a bag by mass`
  if (DOSE_UNITS[unit].perKg && !(kg && kg > 0)) return 'A dose per kg needs the weight'
  return null
}
export const bagWords = (bag: Bag) => `${bag.amount} ${AMOUNT_UNITS[bag.unit].words} in ${bag.volume} mL`
export const doseWords = (value: number | string, unit: DoseUnit) => `${value} ${DOSE_UNITS[unit].words}`
