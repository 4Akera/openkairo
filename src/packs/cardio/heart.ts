// What the Heart and Heart failure sections read (spec/openCare.md §5.8; the pictures #cardio-ecg, #cardio-hf), all from the base's record:
// the ECGs (results with the ECG study's code), the last echo (its EF, LOINC 10230-1, and its conclusion), NYHA and the dry weight (the
// base's observations in this pack's terms), the weights (vitals), K, creatinine and eGFR (results), and the four medicine groups read from
// the medication list by ATC class against the clinic's target doses (cardio.hf_targets). Pure (npm run test:cardio).
import type { Medication, ServerEntry, ValueRow } from '@core/db/types'
import { ecgOf, isEcg, type EcgParams } from './ecg'

export const TERMS = 'cardio.terms'
export const EF = 'loinc:10230-1'
const K = 'loinc:2823-3', CREAT = 'loinc:2160-0', EGFR = ['loinc:98979-8', 'loinc:62238-1']
const newest = (a: { at: string }, b: { at: string }) => b.at.localeCompare(a.at)
const termOf = (e: ServerEntry) => ((e.data?.code as { codings?: { system: string; code: string }[] } | undefined)?.codings ?? []).find((c) => c.system === TERMS)?.code

// ── the ECGs and the echo ──
export interface EcgRow extends EcgParams { at: string; entry_id: string }
/** each ECG, the newest first */
export const ecgsOf = (own: ServerEntry[]): EcgRow[] => own.filter((e) => e.type === 'result' && isEcg(e.data))
  .map((e) => ({ ...ecgOf(e.data), at: e.occurred_at, entry_id: e.id })).sort(newest)
export interface Echo { at: string; ef: number | null; conclusion: string | null; entry_id: string }
/** the last echo: its EF and its conclusion's first line */
export function echoOf(values: ValueRow[], own: ServerEntry[]): Echo | null {
  const ef = values.filter((v) => v.code === EF).sort(newest)[0]; if (!ef) return null
  const e = own.find((x) => x.id === ef.entry_id); const c = typeof e?.data?.conclusion === 'string' ? e.data.conclusion.split('\n')[0] : null
  return { at: ef.at, ef: ef.value, conclusion: c, entry_id: ef.entry_id }
}

// ── heart failure: NYHA, the weight against the dry weight ──
const ROMAN = ['I', 'II', 'III', 'IV']
export const nyhaWord = (n: number) => ROMAN[n - 1] ?? String(n)
export interface Nyha { at: string; cls: number; note: string | null }
/** NYHA as written, the newest first */
export const nyhasOf = (own: ServerEntry[]): Nyha[] => own.filter((e) => e.type === 'observation' && termOf(e) === 'nyha').map((e) => {
  const t = String((e.data?.value as { text?: string } | undefined)?.text ?? ''); return { at: e.occurred_at, cls: ROMAN.indexOf(t) + 1, note: typeof e.data?.note === 'string' ? e.data.note : null }
}).filter((x) => x.cls > 0).sort(newest)
export interface Weight { now: ValueRow | null; dry: ValueRow | null; over: number | null; trend: ValueRow[] }
/** the weights (vitals) and the dry weight the doctor set last (it stands until another) */
export function weightOf(values: ValueRow[]): Weight {
  const ws = values.filter((v) => v.key === 'weight').sort(newest); const dry = values.filter((v) => v.code === `${TERMS}:dry_weight`).sort(newest)[0] ?? null
  const now = ws[0] ?? null
  return { now, dry, over: now && dry ? Math.round((now.value - dry.value) * 10) / 10 : null, trend: ws.slice(0, 6).reverse() }
}
/** the latest K, creatinine, eGFR, BP and pulse: shown beside the four medicines, never a stop */
export function besideOf(values: ValueRow[]) {
  const last = (codes: string[]) => values.filter((v) => codes.includes(v.code ?? '') || codes.includes(v.key)).sort(newest)[0] ?? null
  const sys = last(['bp.sys']); const dia = sys ? values.find((v) => v.key === 'bp.dia' && v.entry_id === sys.entry_id) ?? null : null
  return { k: last([K]), creat: last([CREAT]), egfr: last(EGFR), sys, dia, pulse: last(['hr']) }
}

// ── the four medicine groups against their target doses ──
export type Group = 'ras' | 'bb' | 'mra' | 'sglt2'
export const GROUPS: [Group, string, string][] = [['ras', 'ACEi · ARB · ARNI', 'C09'], ['bb', 'Beta-blocker', 'C07'], ['mra', 'MRA', 'C03DA'], ['sglt2', 'SGLT2 inhibitor', 'A10BK']]
export interface Target { group: Group; name: string; atc: string; mg_a_day: number }
const PER_DAY: Record<string, number> = { OD: 1, QD: 1, BD: 2, BID: 2, TDS: 3, TID: 3, QDS: 4, QID: 4, q12h: 2, q8h: 3, q6h: 4 }
const atcOf = (m: Pick<Medication, 'drug_code'>) => m.drug_code?.startsWith('atc:') ? m.drug_code.slice(4) : null
/** mg a day as prescribed (a combination counts its first part: sacubitril/valsartan 49/51 is 49), or null when it cannot be told */
export const mgADay = (m: Pick<Medication, 'dose_number' | 'dose_unit' | 'frequency'>) =>
  m.dose_number != null && (m.dose_unit ?? 'mg').toLowerCase() === 'mg' && m.frequency && PER_DAY[m.frequency] ? m.dose_number * PER_DAY[m.frequency] : null
export type Standing = 'not on' | 'low' | 'half' | 'at target' | 'on'
export interface GroupRow { group: Group; title: string; med: Medication | null; target: Target | null; standing: Standing; share: number | null }
/** each group: the medicine on the list in its class, its target, and how far it is: not on, under half (low), half, at target; on
 *  (no target to say it against) */
export function groupsOf(meds: Medication[], targets: Target[]): GroupRow[] {
  return GROUPS.map(([group, title, cls]) => {
    const med = meds.find((m) => atcOf(m)?.startsWith(cls)) ?? null
    const target = med ? targets.find((t) => t.atc === atcOf(med)) ?? null : targets.find((t) => t.group === group) ?? null
    if (!med) return { group, title, med, target, standing: 'not on', share: null }
    const mg = mgADay(med); const share = mg != null && target?.atc === atcOf(med) ? mg / target.mg_a_day : null
    return { group, title, med, target, share, standing: share == null ? 'on' : share >= 0.95 ? 'at target' : share >= 0.45 ? 'half' : 'low' }
  })
}
/** "ARNI and beta-blocker at half the target · MRA not on · SGLT2 inhibitor at target" */
export function groupsLine(rows: GroupRow[]): string {
  const by = new Map<Standing, string[]>(); for (const r of rows) by.set(r.standing, [...(by.get(r.standing) ?? []), r.group === 'ras' ? 'ACEi/ARB/ARNI' : r.title])
  const say: [Standing, string][] = [['low', 'under half the target'], ['half', 'at half the target'], ['at target', 'at target'], ['on', 'on'], ['not on', 'not on']]
  return say.filter(([s]) => by.has(s)).map(([s, w]) => `${by.get(s)!.join(' and ')} ${w}`).join(' · ')
}
/** is heart failure on the problem list (I50) */
export const hasHf = (problems: { code: string | null; status: string }[]) => problems.some((p) => p.code?.startsWith('icd10:I50') && p.status === 'active')
