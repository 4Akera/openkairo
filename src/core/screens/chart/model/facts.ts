// The standing facts every department sees (spec/openCare.md §5.1 rule 3): pregnant or not, breastfeeding or not, and the base alerts
// in the banner's words (DNR, isolation for HBV and HCV, fall risk), from the facts page. Each item's latest version counts; one
// ended is over. An alert's words never name HIV, whatever was typed. Pure.
import type { Organization, ServerEntry } from '../../../db/types'
import type { EntryData } from '../../../db/shapes.generated'
import { dataOf } from '../../../db/views'
import { ymd } from '../../../ui/time'
import { factsOf } from './record'

type Types = Organization['types'] | undefined
const DAY = 86_400_000
const utc = (d: string) => { const [y, m, x] = d.slice(0, 10).split('-').map(Number); return Date.UTC(y, (m || 1) - 1, x || 1) }
const days = (from: string, to: string) => Math.floor((utc(to) - utc(from)) / DAY)

/** past this many weeks a pregnancy never ended is to check, not a plain pregnancy (the server's lmp_long_ago: 44 weeks) */
export const OVERDUE_WEEKS = 44
export interface Pregnancy { item: string; entry: ServerEntry; pregnant: boolean; weeks: number | null; lmp: string | null; at: string; overdue: boolean; data: EntryData['pregnancy'] }
export interface Breastfeeding { item: string; entry: ServerEntry; breastfeeding: boolean; at: string; data: EntryData['breastfeeding'] }

/** completed weeks on a day (YYYY-MM-DD): from the LMP, else the weeks said then plus the weeks since */
export function weeksOn(p: { lmp?: string | null; weeks?: number | null; at: string }, today: string): number | null {
  if (p.lmp) { const n = days(p.lmp, today); return n < 0 ? null : Math.floor(n / 7) }
  if (p.weeks == null) return null
  return p.weeks + Math.max(0, Math.floor(days(ymd(p.at), today) / 7))
}
/** the latest current pregnancy fact (pregnant or not); none, or the latest ended: null */
export function pregnancyOf(facts: ServerEntry[] | undefined, types: Types, today: string): Pregnancy | null {
  const e = factsOf(facts ?? [], types).find((x) => dataOf(x, 'pregnancy', types))
  const d = e && dataOf(e, 'pregnancy', types)
  if (!e || !d || d.status !== 'current') return null
  const lmp = d.lmp?.value ?? null; const weeks = d.pregnant ? weeksOn({ lmp, weeks: d.weeks, at: e.occurred_at }, today) : null
  // never ended past 44 weeks (a delivery written nowhere): to check and end, never a plain pregnancy counting on
  const overdue = d.pregnant && (weeks != null ? weeks > OVERDUE_WEEKS : days(ymd(e.occurred_at), today) > OVERDUE_WEEKS * 7)
  return { item: e.item, entry: e, pregnant: d.pregnant, lmp, weeks, at: e.occurred_at, overdue, data: d }
}
/** the latest current breastfeeding fact (yes or no); none, or the latest ended: null */
export function breastfeedingOf(facts: ServerEntry[] | undefined, types: Types): Breastfeeding | null {
  const e = factsOf(facts ?? [], types).find((x) => dataOf(x, 'breastfeeding', types))
  const d = e && dataOf(e, 'breastfeeding', types)
  if (!e || !d || d.status !== 'current') return null
  return { item: e.item, entry: e, breastfeeding: d.breastfeeding, at: e.occurred_at, data: d }
}
/** "Pregnant · 24 wk", "Pregnant", "Not pregnant"; past 44 weeks never ended "Pregnancy · check (64 wk)" */
export const pregnancyWords = (p: Pick<Pregnancy, 'pregnant' | 'weeks'> & { overdue?: boolean }) => !p.pregnant ? 'Not pregnant'
  : p.overdue ? `Pregnancy · check${p.weeks != null ? ` (${p.weeks} wk)` : ''}` : p.weeks != null ? `Pregnant · ${p.weeks} wk` : 'Pregnant'
export const breastfeedingWords = (b: Pick<Breastfeeding, 'breastfeeding'>) => b.breastfeeding ? 'Breastfeeding' : 'Not breastfeeding'

// ── alerts ──
/** the base alerts the composer writes (/alert), as local.alert codes; other is the clinician's words */
export const ALERT_KINDS = [['dnr', 'DNR'], ['isolation_hbv', 'Isolation · HBV'], ['isolation_hcv', 'Isolation · HCV'], ['fall_risk', 'Fall risk'], ['other', 'Other']] as const
export type AlertKind = typeof ALERT_KINDS[number][0]
const WORD: Record<string, string> = { 'local.alert:dnr': 'DNR', 'local.alert:isolation_hbv': 'Isolation · HBV', 'local.alert:isolation_hcv': 'Isolation · HCV',
  'local.alert:isolation': 'Isolation', 'local.alert:fall_risk': 'Fall risk' }
/** what names HIV, case-insensitive: the word (HIV1, _hiv too), AIDS, spelled out, in Arabic, and the ICD-10 codes (B20–B24, Z21,
 *  R75, Z20.6, Z71.7, O98.7). The server's base.names_hiv holds the same pattern (test-banner checks they match) */
export const HIV_PATTERN = String.raw`(^|[^a-z])(hiv|aids)([^a-z]|$)|human[^a-z]*immuno[^a-z]*deficiency|(^|[^a-z0-9])(b2[0-4]|z21|r75|z20\.6|z71\.7|o98\.7)([^0-9]|$)|إيدز|ايدز|نقص المناعة`
const HIV = new RegExp(HIV_PATTERN, 'i')
export const namesHiv = (s: string | null | undefined) => HIV.test(s ?? '')
/** an alert in the banner's words: its code's short word, else its text; a text naming HIV reads "Isolation" (never the reason) */
export function alertWord(text: string, code: string | null): string {
  if (code && WORD[code]) return WORD[code]
  return namesHiv(text) || namesHiv(code) ? 'Isolation' : text
}
/** a fall risk is a caution (warn); every other alert is danger */
export const alertTone = (code: string | null, text: string): 'danger' | 'warn' => code === 'local.alert:fall_risk' || /\bfall/i.test(text) ? 'warn' : 'danger'
