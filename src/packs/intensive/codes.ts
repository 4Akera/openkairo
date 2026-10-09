// Critical care's codes (spec/openCare.md §5.6): the base's observations the ICU chart writes and reads (their LOINC codes and UCUM
// units, the owner's B1), the two kinds of time on a ventilator as the base's procedure (local.procedure, the base's open list), and
// the ventilator's modes. Pure.
import type { ServerEntry } from '@core/db/types'
import type { Concept } from '@core/db/shapes.generated'

interface ObsCode { code: string; label: string; short: string; unit: string; ucum: string }
/** the observations the chart writes, one an hour: MAP, CVP, fluid in, urine (each hour's volume up to the column's time) */
export const OBS = {
  map: { code: '8478-0', label: 'Mean blood pressure', short: 'MAP', unit: 'mmHg', ucum: 'mm[Hg]' },
  cvp: { code: '60985-9', label: 'Central venous pressure (CVP)', short: 'CVP', unit: 'cmH₂O', ucum: 'cm[H2O]' },
  intake: { code: '9103-3', label: 'Fluid intake total Measured', short: 'In', unit: 'mL', ucum: 'mL' },
  urine: { code: '9188-4', label: 'Urine output 1 hour', short: 'Urine', unit: 'mL/h', ucum: 'mL/h' },
} as const satisfies Record<string, ObsCode>
export type ObsKey = keyof typeof OBS
/** drawn, never written by this pack: the urine and the total output another pack's fluids write (to agree on, spec §5.6) */
export const READ_ONLY = {
  urine_volume: { code: '9187-6', label: 'Urine output', short: 'Urine', unit: 'mL', ucum: 'mL' },
  output: { code: '9257-7', label: 'Fluid output total Measured', short: 'Output total', unit: 'mL', ucum: 'mL' },
} as const satisfies Record<string, ObsCode>
export type ReadOnlyKey = keyof typeof READ_ONLY

const codingsOf = (c: unknown): { system?: string; code?: string }[] =>
  c && typeof c === 'object' && Array.isArray((c as Concept).codings) ? (c as Concept).codings as { system?: string; code?: string }[] : []
/** an observation's LOINC coding → its key here; null for any other */
export function obsKeyOf(e: Pick<ServerEntry, 'type' | 'data'>): ObsKey | ReadOnlyKey | null {
  if (e.type !== 'observation') return null
  const loinc = codingsOf(e.data?.code).filter((c) => c.system === 'loinc').map((c) => c.code)
  for (const [k, v] of Object.entries({ ...OBS, ...READ_ONLY })) if (loinc.includes(v.code)) return k as ObsKey | ReadOnlyKey
  return null
}

/** the time on a ventilator, as the base's procedure: in progress until a version that changes it ends it */
export const AIRWAY = {
  invasive: { code: 'invasive_ventilation', label: 'Invasive ventilation', short: 'Ventilated', ended: 'Extubated', outcome: 'extubated' },
  non_invasive: { code: 'non_invasive_ventilation', label: 'Non-invasive ventilation', short: 'NIV', ended: 'Off NIV', outcome: 'off NIV' },
} as const
export type AirwayKind = keyof typeof AIRWAY
/** a local.procedure code → its kind */
export const airwayKind = (code: unknown): AirwayKind | null =>
  (Object.keys(AIRWAY) as AirwayKind[]).find((k) => AIRWAY[k].code === code) ?? null
/** a procedure's local.procedure coding → its kind; null for any other procedure */
export function airwayOf(e: Pick<ServerEntry, 'type' | 'data'>): AirwayKind | null {
  if (e.type !== 'procedure') return null
  for (const c of codingsOf(e.data?.concept)) if (c.system === 'local.procedure') { const k = airwayKind(c.code); if (k) return k }
  return null
}

export type Mode = 'vc' | 'pc' | 'prvc' | 'simv' | 'ps' | 'cpap' | 'other'
export const MODES: [Mode, string][] = [['vc', 'VC'], ['pc', 'PC'], ['prvc', 'PRVC'], ['simv', 'SIMV'], ['ps', 'PS'], ['cpap', 'CPAP'], ['other', 'Other']]
/** the ventilator's mode in words: its own words for another mode */
export function modeWords(data: { mode?: unknown; mode_text?: unknown } | undefined): string {
  if (data?.mode === 'other') return typeof data.mode_text === 'string' && data.mode_text.trim() ? data.mode_text.trim() : 'Other'
  return MODES.find(([m]) => m === data?.mode)?.[1] ?? ''
}

/** a concept with one coding */
export const concept = (system: string, code: string, text: string): Concept => ({ text, codings: [{ system, code, display: text }] })
