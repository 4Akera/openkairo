// Development and the newborn checks as paediatrics reads them (spec/openCare.md §5.8, the picture #paeds-develop). A check is one entry
// of the pack's own type, paeds.development (the base's observation: the list, the age, its version, each milestone yes or not
// yet, what was chosen next); the milestones are the clinic's list (the setting paeds.milestones), the list for an age the latest
// one at or before it. "Not yet" past the list's age is a notice, never a stop. The newborn checks are base entries by the pack's own
// codes (paeds.newborn): observations (the birth, the heel prick, hips, eyes, jaundice) and a procedure (the hearing test). Pure.
import type { ServerEntry } from '@core/db/types'

export const DEV = 'paeds.development'
export type Area = 'movement' | 'hands' | 'talking' | 'social'
export const AREAS: { key: Area; label: string }[] = [{ key: 'movement', label: 'Movement' }, { key: 'hands', label: 'Hands' }, { key: 'talking', label: 'Talking' }, { key: 'social', label: 'Social' }]
export interface Milestone { months: number; area: Area; text: string; short?: string }
export interface Item { area: Area; text: string; short?: string; yes: boolean }
export interface DevData { code: { text: string }; value: { text: string }; paeds: { list: string; months: number; age_months: number; version?: string; items: Item[]; plan?: string[] } }

/** the child's age in completed months on today's date (the composer's patient) */
export function ageMonths(born: string | null | undefined, now = new Date()): number | null {
  if (!born) return null
  const [y, m, d] = born.slice(0, 10).split('-').map(Number)
  return (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m) - (now.getDate() < d ? 1 : 0)
}
/** the list for a child's age: the latest age in the clinic's list at or before it (a child under the first list: the first) */
export function listFor(all: Milestone[] | undefined, ageMonths: number): { months: number; items: Milestone[] } | null {
  const ages = [...new Set((all ?? []).map((m) => m.months))].sort((a, b) => a - b)
  if (!ages.length) return null
  const months = [...ages].reverse().find((a) => a <= ageMonths) ?? ages[0]
  return { months, items: (all ?? []).filter((m) => m.months === months) }
}
export const listName = (months: number) => months < 24 ? `${months}-month` : `${months / 12}-year`
/** the check in words, as its value and its line say it: "7 yes · not yet: babbles, looks to the name" */
export function summaryOf(items: Item[], plan: string[] = []): string {
  const no = items.filter((i) => !i.yes).map((i) => i.short || i.text)
  return [`${items.filter((i) => i.yes).length} yes`, no.length ? `not yet: ${no.join(', ')}` : 'all yes', plan.length ? `plan: ${plan.join(', ')}` : ''].filter(Boolean).join(' · ')
}
/** a new check's data for a child of this age, from the clinic's list: every milestone yes until the doctor says not yet */
export function newCheck(all: Milestone[] | undefined, ageMonths: number, version?: string): DevData | null {
  const l = listFor(all, ageMonths); if (!l) return null
  const items: Item[] = AREAS.flatMap((a) => l.items.filter((m) => m.area === a.key).map((m) => ({ area: m.area, text: m.text, ...(m.short ? { short: m.short } : {}), yes: true })))
  return withSummary({ code: { text: 'Development check' }, value: { text: '' }, paeds: { list: listName(l.months), months: l.months, age_months: ageMonths, ...(version ? { version } : {}), items, plan: [] } })
}
export const withSummary = (d: DevData): DevData => ({ ...d, value: { text: summaryOf(d.paeds.items, d.paeds.plan) } })
/** the draft's line: "Development · the 9-month list at 10 mo · 7 yes · not yet: babbles, looks to the name" (the server's line says the same) */
export const devLine = (d: Partial<DevData>) => d.paeds ? `Development · the ${d.paeds.list} list at ${d.paeds.age_months} mo · ${summaryOf(d.paeds.items, d.paeds.plan)}` : 'Development'
/** not yet past the list's age: the notice (the child older than the list, a milestone not yet) */
export const lateOf = (d: DevData) => d.paeds.age_months > d.paeds.months ? d.paeds.items.filter((i) => !i.yes) : []

/** the checks recorded, oldest first: each its list's age and, by area, all yes or which not yet */
export interface Recorded { entry: ServerEntry; months: number; label: string; byArea: Partial<Record<Area, 'yes' | 'not yet'>>; version: string | null }
export function recordedOf(own: ServerEntry[]): Recorded[] {
  return own.filter((e) => e.type === DEV && e.data).map((e) => { const p = (e.data as unknown as DevData).paeds
    const byArea: Recorded['byArea'] = {}
    for (const a of AREAS) { const is = p.items.filter((i) => i.area === a.key); if (is.length) byArea[a.key] = is.every((i) => i.yes) ? 'yes' : 'not yet' }
    return { entry: e, months: p.months, label: listName(p.months).replace('-month', ' mo').replace('-year', ' y'), byArea, version: p.version ?? null } })
    .sort((a, b) => a.entry.occurred_at.localeCompare(b.entry.occurred_at))
}

// ── the newborn checks ──
export const NEWBORN = 'paeds.newborn'
export const CHECKS: { code: string; label: string }[] = [{ code: 'birth', label: 'Birth' }, { code: 'heel_prick', label: 'Heel prick' }, { code: 'hearing', label: 'Hearing' },
  { code: 'hips', label: 'Hips' }, { code: 'eyes', label: 'Eyes' }, { code: 'jaundice', label: 'Jaundice' }]
type Coding = { system?: string; code?: string }
const codeOf = (e: ServerEntry): string | null => {
  const d = e.data as { code?: { codings?: Coding[] }; concept?: { codings?: Coding[] } } | undefined
  return [...(d?.code?.codings ?? []), ...(d?.concept?.codings ?? [])].find((c) => c.system === NEWBORN)?.code ?? null
}
export interface NewbornRow { code: string; label: string; entry: ServerEntry; text: string; refer: boolean }
/** each check's latest entry (observations and procedures by the pack's codes; the crossed out gone), in the checks' order */
export function newbornOf(facts: ServerEntry[] | undefined): NewbornRow[] {
  const crossed = new Set((facts ?? []).filter((e) => e.type === 'crossed_out').map((e) => e.refers_to))
  const latest = new Map<string, ServerEntry>()
  for (const e of facts ?? []) {
    if (e.type === 'crossed_out' || e.hidden || crossed.has(e.id)) continue
    const c = codeOf(e); if (!c) continue
    const was = latest.get(c); if (!was || e.occurred_at > was.occurred_at) latest.set(c, e)
  }
  return CHECKS.flatMap((k) => { const e = latest.get(k.code); if (!e) return []
    const d = e.data as { value?: { text?: string; quantity?: { value: string; unit?: string } }; outcome?: string; note?: string; status?: string } | undefined
    const said = d?.value?.text ?? (d?.value?.quantity ? `${d.value.quantity.value} ${d.value.quantity.unit ?? ''}`.trim() : d?.outcome ?? '')
    const text = [said, d?.note].filter(Boolean).join(' · ')
    return [{ code: k.code, label: k.label, entry: e, text, refer: k.code === 'hearing' && /refer/i.test(`${d?.outcome ?? ''} ${said}`) }] })
}
/** the hearing screen said refer and was never repeated with a pass: the chip's word and the banner's */
export const hearingRefer = (rows: NewbornRow[]) => rows.some((r) => r.refer)
