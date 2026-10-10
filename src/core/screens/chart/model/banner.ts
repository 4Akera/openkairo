// The chart's banner in zones (spec/openCare.md §5.1 rule 3): one line, fixed zones split by thin lines — who (name, age, sex, record
// number), where (the encounter in words), safety (the same in every department: allergies, the base alerts, critical results
// waiting, pregnant or breastfeeding), then this department's pack words (words.ts). The phone and everything else live in the
// Summary. Pure: the screen draws what this says.
import type { ServerEntry } from '../../../db/types'
import { ageWords } from '../../../db/views'
import { alertWord, alertTone, breastfeedingOf, pregnancyOf, pregnancyWords } from './facts'
import { alertsOf, allergiesOf, type ChartCtx, type Rec } from './record'

/** the zones, in their one order */
export const ZONES = ['who', 'where', 'safety', 'packs'] as const
export type Zone = typeof ZONES[number]

export interface SafetyItem { key: string; kind: 'allergy' | 'allergies' | 'alert' | 'critical' | 'pregnant' | 'breastfeeding'; word: string; tone: 'danger' | 'warn' | 'info' | 'neutral' }
export interface SafetyInput { rec: Rec; ctx: ChartCtx; facts?: ServerEntry[]; today: string }
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** the safety zone, the same in every department (the department is never asked): severe allergies by name and the others counted,
 *  or none known, or "Allergies not asked" (warn); the active base alerts (never naming HIV); the patient's critical results
 *  waiting for review, whoever they wait for (never filtered by reader or department); pregnant, breastfeeding (past 44 weeks never
 *  ended: to check, in warn) */
export function safetyOf(x: SafetyInput): SafetyItem[] {
  const out: SafetyItem[] = []; const types = x.ctx.org?.types
  const a = allergiesOf(x.rec, x.ctx)
  const severe = a.active.filter((r) => r.high_risk || r.severity === 'severe'); const others = a.active.length - severe.length
  for (const r of severe) out.push({ key: `allergy:${r.id}`, kind: 'allergy', word: r.substance_name, tone: 'danger' })
  if (others) out.push({ key: 'allergies', kind: 'allergies', word: severe.length ? `+${plural(others, 'allergy', 'allergies')}` : plural(others, 'allergy', 'allergies'), tone: 'neutral' })
  else if (!a.active.length) out.push(a.nka ? { key: 'allergies', kind: 'allergies', word: 'No known allergies', tone: 'neutral' }
    : { key: 'allergies', kind: 'allergies', word: 'Allergies not asked', tone: 'warn' })
  for (const r of alertsOf(x.facts ?? [], types, x.ctx.now).active) out.push({ key: `alert:${r.item}`, kind: 'alert', word: alertWord(r.text, r.code), tone: alertTone(r.code, r.text) })
  const critical = new Set((x.rec.tables['base.review']?.rows ?? []).filter((r) => r.critical).map((r) => r.item)).size
  if (critical) out.push({ key: 'critical', kind: 'critical', word: `${critical} critical to review`, tone: 'danger' })
  const p = pregnancyOf(x.facts, types, x.today)
  if (p?.pregnant) out.push({ key: 'pregnant', kind: 'pregnant', word: pregnancyWords(p), tone: p.overdue ? 'warn' : 'info' })
  const b = breastfeedingOf(x.facts, types)
  if (b?.breastfeeding) out.push({ key: 'breastfeeding', kind: 'breastfeeding', word: 'Breastfeeding', tone: 'info' })
  return out
}

const SEX: Record<string, string> = { male: 'M', female: 'F', other: 'X' }
/** who: the name, then age, sex and record number in one run (no phone: the Summary has it) */
export function whoOf(p: { given_name: string; family_name: string; age: number; born_on?: string; sex: string; record_number: number; died_on: string | null }) {
  return { name: `${p.given_name} ${p.family_name}`.trim(), sub: [ageWords(p.born_on, new Date(), true) || `${p.age} y`, SEX[p.sex], `#${p.record_number}`].filter(Boolean).join(' · '), deceased: !!p.died_on }
}
