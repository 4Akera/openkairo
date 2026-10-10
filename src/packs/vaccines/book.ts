// The booking of the next visit from /vax (spec/openCare.md §5.8, the picture #vax-chart: "Next visit · 18 months · Mon 8 Mar · the
// booking"). A card cannot add drafts, and the booking is another pack's, so the note under /vax says what to type where the department
// books its visits — the composer's /book, offered there by whoever keeps the diary — never naming that pack: "/book 21w" to the next
// due day (the booking card then picks the nearest free place). Chosen by Claude at the owner's request, 2026-10-10. Pure.
import { commandNamed, allowed } from '@core/screens/visit/commands'
import type { Ctx } from '@core/screens/visit/parse'
import { daysBetween } from './schedule'

/** "/book 21w" (a week or more), "/book 10d", from today to the next due day; nothing when it is due already */
export function bookFor(today: string, dueOn: string | null | undefined): string | null {
  if (!dueOn) return null
  const days = daysBetween(today, dueOn); if (days <= 0) return null
  return days < 14 ? `/book ${days}d` : `/book ${Math.round(days / 7)}w`
}
/** is /book offered to this reader here (its command registered, their role holds it, its pack is here) */
export const booksHere = (ctx: Ctx) => { const c = commandNamed('book', ctx); return !!c && allowed(c, ctx) }
