// What the Chest section reads (spec/openCare.md §5.8; the picture #chest-spiro), all the base's: the smoking (LOINC 72166-2), the scores
// (GOLD group, CAT, mMRC, ACT), the flares, the inhaler technique and the action plan (observations in this pack's terms), the last
// spirometry, the inhalers (R03), the eosinophils, the flu and pneumococcal immunisations (the base's given). Pure (npm run test:lungs).
import type { Medication, ServerEntry, ValueRow } from '@core/db/types'
import { isSpiro } from './spiro'

export const TERMS = 'lungs.terms'
const newest = (a: ServerEntry, b: ServerEntry) => b.occurred_at.localeCompare(a.occurred_at)
const codings = (e: ServerEntry) => ((e.data?.code as { codings?: { system: string; code: string }[] } | undefined)?.codings ?? [])
export const termOf = (e: ServerEntry) => codings(e).find((c) => c.system === TERMS)?.code ?? null
const textOf = (e: ServerEntry) => String((e.data?.value as { text?: string } | undefined)?.text ?? '')
const DAY = 86_400_000

export interface Scored { key: string; total: number; band: string; at: string; id: string }
/** the latest of each of this pack's scores */
export function scoresOf(own: ServerEntry[]): Partial<Record<'gold' | 'cat' | 'mmrc' | 'act', Scored>> {
  const out: Partial<Record<'gold' | 'cat' | 'mmrc' | 'act', Scored>> = {}
  for (const e of [...own].filter((x) => x.type === 'score').sort(newest)) {
    const k = String(e.data?.score ?? '').replace(/^lungs\./, '') as 'gold' | 'cat' | 'mmrc' | 'act'
    if (['gold', 'cat', 'mmrc', 'act'].includes(k) && !out[k]) out[k] = { key: k, total: Number(e.data?.total), band: String(e.data?.band ?? ''), at: e.occurred_at, id: e.id }
  }
  return out
}
export const GOLD_WORD: Record<string, string> = { a: 'A', b: 'B', e: 'E' }
export interface Flare { at: string; treated: string; where: string | null; id: string }
/** the flares written in the last 12 months (before `now`), the newest first */
export const flaresOf = (own: ServerEntry[], now: Date) => own.filter((e) => e.type === 'observation' && termOf(e) === 'flare' && now.getTime() - Date.parse(e.occurred_at) <= 365 * DAY)
  .sort(newest).map((e): Flare => ({ at: e.occurred_at, treated: textOf(e), where: typeof e.data?.note === 'string' ? e.data.note : null, id: e.id }))
/** the latest observation of a term (the technique, the action plan) or of a LOINC code (smoking) */
export const latestOf = (own: ServerEntry[], term: string) => own.filter((e) => e.type === 'observation' && (termOf(e) === term || codings(e).some((c) => c.code === term))).sort(newest)[0] ?? null
export const valueText = textOf
/** the technique: correct, or what went wrong (said in amber) */
export const techniqueOk = (e: ServerEntry) => /^correct\b/i.test(textOf(e))
/** the action plan's three zones, each a line "every day: …", "worse: …", "emergency: …" */
export const ZONES = [['every day', 'ok'], ['worse', 'warn'], ['emergency', 'danger']] as const
export function planOf(e: ServerEntry | null): [string, 'ok' | 'warn' | 'danger', string][] {
  if (!e) return []
  return textOf(e).split('\n').flatMap((l) => { const z = ZONES.find(([w]) => l.toLowerCase().startsWith(`${w}:`)); return z ? [[z[0], z[1], l.slice(z[0].length + 1).trim()] as [string, 'ok' | 'warn' | 'danger', string]] : [] })
}
export const lastSpiro = (own: ServerEntry[]) => own.filter((e) => e.type === 'result' && isSpiro(e.data)).sort(newest)[0] ?? null
export const inhalersOf = (meds: Medication[]) => meds.filter((m) => m.drug_code?.startsWith('atc:R03'))
/** a vaccine given (the base's given by ATC: flu J07BB, pneumococcal J07AL), the latest */
export const givenOf = (own: ServerEntry[], atc: string) => own.filter((e) => e.type === 'given' && ((e.data?.drug as { codings?: { system: string; code: string }[] } | undefined)?.codings ?? [])
  .some((c) => c.system === 'atc' && c.code.startsWith(atc))).sort(newest)[0] ?? null
export const eosinophils = (values: ValueRow[]) => values.filter((v) => v.code === 'loinc:711-2').sort((a, b) => b.at.localeCompare(a.at))[0] ?? null
export const hasAsthma = (problems: { code: string | null; status: string }[]) => problems.some((p) => p.code?.startsWith('icd10:J45') && p.status === 'active')
export const hasCopd = (problems: { code: string | null; status: string }[]) => problems.some((p) => p.code?.startsWith('icd10:J44') && p.status === 'active')
