// The pharmacy's settings as Dispensing reads them (spec/openCare.md §5.1 rule 7), each edited only through its automatic form:
// pharmacy.prepare_first (per pharmacy, off by default: To give → Prepared → Given when one person prepares and another hands over),
// pharmacy.late_after (per pharmacy: how long a prepared dispense waits before it reads late) and pharmacy.counselling (for the
// clinic: the note shown to whoever gives). Unset, the shape's defaults hold. Pure.
import { settingIn } from '@core/screens/settings/form/model'
import type { Organization, RequestQueueRow } from '@core/db/types'

/** this pharmacy prepares first (the Prepared step and view), else gives straight away */
export const prepareFirst = (org: Organization | undefined, departmentId: string) => settingIn(org, 'pharmacy.prepare_first', departmentId).prepare ?? false
/** minutes a prepared dispense may wait in this pharmacy before it reads late */
export const lateAfter = (org: Organization | undefined, departmentId: string) => settingIn(org, 'pharmacy.late_after', departmentId).minutes ?? 30
/** the note to show when giving, or null when the clinic shows none */
export function counselling(org: Organization | undefined): string | null {
  const c = settingIn(org, 'pharmacy.counselling', org?.organization.id)
  return c.show && c.note?.trim() ? c.note.trim() : null
}
/** since when a patient's prepared orders have waited: the earliest last step among them */
export const preparedSince = (rows: Pick<RequestQueueRow, 'order'>[]) =>
  rows.map((r) => r.order.last_at).filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null
/** minutes waited when that is past the limit, else null (not late, or nothing prepared) */
export function lateBy(since: string | null, minutes: number, now = Date.now()): number | null {
  if (!since) return null
  const waited = Math.floor((now - Date.parse(since)) / 60_000)
  return waited > minutes ? waited : null
}
