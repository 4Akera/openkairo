// The large lab's switches as the laboratory's screens read them (spec/openCare.md §5.3; the setting lis.large, on the laboratory's
// card, all off for a small lab): turnaround targets per section, a second person checks, scan to receive, collection chairs. Pure:
// what is late, which ticket is whose, who calls next, what a scan names.
import { settingIn } from '@core/screens/settings/form/model'
import type { Organization, RequestQueueRow } from '@core/db/types'
import type { PatientGroup } from '@core/screens/bench/shared'

export interface Large { turnaround: boolean; targets: Record<string, number>; second_check: boolean; scan_receive: boolean; chairs: number }
/** this laboratory's switches, the shape's defaults where unset */
export function largeOf(org: Organization | undefined, departmentId: string): Large {
  const s = settingIn(org, 'lis.large', departmentId)
  return { turnaround: s.turnaround ?? false, targets: (s.targets ?? {}) as Record<string, number>, second_check: s.second_check ?? false,
    scan_receive: s.scan_receive ?? false, chairs: s.chairs ?? 0 }
}
/** Urine & stool → urine_stool: a section's key among the targets */
export const sectionKey = (section: string) => section.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
/** the minutes a section's sample may wait, or null (turnaround off, or a section with no target) */
export const targetOf = (l: Large, section: string | null) => l.turnaround && section ? l.targets[sectionKey(section)] ?? null : null
/** minutes waited when past the target, else null */
export function lateBy(since: string | null | undefined, target: number | null, now = Date.now()): number | null {
  if (!since || target == null) return null
  const waited = Math.floor((now - Date.parse(since)) / 60_000)
  return waited > target ? waited : null
}

// ── the chairs: a ticket per patient's tests of the day (the pack's own table, lis.tickets), called to a chair ──
export interface Ticket { number: number; items: string[]; chair: number | null; called_at: string | null }
/** a patient's ticket: the one naming any of their orders */
export const ticketOf = (g: Pick<PatientGroup, 'rows'>, tickets: Ticket[]) => tickets.find((t) => g.rows.some((r) => t.items.includes(r.item)))
/** the groups to number, in the order they came (earliest order first) */
export const byArrival = <G extends Pick<PatientGroup, 'oldest'>>(groups: G[]) => [...groups].sort((a, b) => a.oldest.localeCompare(b.oldest))
/** who this chair has now: the patient it called last who still waits to be collected */
export function nowAt<G extends Pick<PatientGroup, 'rows'>>(chair: number, waiting: G[], tickets: Ticket[]) {
  const called = tickets.filter((t) => t.chair === chair && t.called_at).sort((a, b) => (b.called_at ?? '').localeCompare(a.called_at ?? ''))
  for (const t of called) { const g = waiting.find((x) => x.rows.some((r) => t.items.includes(r.item))); if (g) return { group: g, ticket: t } }
  return null
}
/** who to call next: stat first, then by ticket number; never one another chair has called */
export function nextUp<G extends Pick<PatientGroup, 'rows' | 'priority'>>(waiting: G[], tickets: Ticket[]) {
  const rank = (g: G) => ({ stat: 0, urgent: 1, routine: 2 })[g.priority]
  return waiting.map((g) => ({ group: g, ticket: ticketOf(g, tickets) })).filter((x): x is { group: G; ticket: Ticket } => !!x.ticket && x.ticket.chair == null)
    .sort((a, b) => rank(a.group) - rank(b.group) || a.ticket.number - b.ticket.number)[0] ?? null
}

// ── scan to receive ──
/** a test still with the laboratory: not sent back for a new sample, nothing released */
export const inLab = (r: RequestQueueRow) => r.order.status !== 'on-hold' && !r.reply
/** a sample number as scanned or typed: S-1007-0002, whatever the case and spaces */
export const sampleKey = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '')
/** the orders a scan names: those to receive now, and those in already */
export function scanned(rows: RequestQueueRow[], typed: string) {
  const k = sampleKey(typed); const mine = rows.filter((r) => r.step_data?.specimen && sampleKey(r.step_data.specimen) === k && inLab(r))
  return { toReceive: mine.filter((r) => r.order.step_key === 'collected'), already: mine.filter((r) => r.order.step_key === 'received') }
}
