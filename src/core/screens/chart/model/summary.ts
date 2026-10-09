// The Summary, exactly (chart-plan.md §4): seven items built from data only, in the agreed order, each with its limit and empty state;
// the notices above them; the banner's to-review chip. The glance takes items 1–5 at half the limits. Pure.
import type { PresenceRow, ServerEntry } from '../../../db/types'
import { nameOf } from '../../../db/views'
import { alertsOf, allergiesOf, medicinesOf, problemsOf, visitsOf, waitingOf, type ChartCtx, type Rec } from './record'
import { keyResults, vitalsNow } from './values'
import { breastfeedingOf, pregnancyOf } from './facts'

export interface SummaryOpts {
  facts?: ServerEntry[]                          // the facts page (alerts); none read yet: no alerts
  visitId?: string | null                        // this encounter: left out of Last visits
  visit?: Pick<PresenceRow, 'state'> | null      // a clinic visit waiting for results says so under Still waiting
  half?: boolean                                 // the glance
  today?: string                                 // the clinic's day (YYYY-MM-DD): a pregnancy's weeks
}
const cut = <T,>(rows: T[], n: number) => ({ rows: rows.slice(0, n), more: Math.max(0, rows.length - n) })

export function summaryOf(rec: Rec, ctx: ChartCtx, o: SummaryOpts = {}) {
  const lim = (n: number) => o.half ? Math.ceil(n / 2) : n
  const values = rec.tables['base.values']?.rows ?? []
  const problems = problemsOf(rec, ctx); const meds = medicinesOf(rec, ctx); const allergies = allergiesOf(rec, ctx)
  const alerts = alertsOf(o.facts ?? [], ctx.org?.types, ctx.now); const key = keyResults(values, lim(6)); const w = waitingOf(rec, ctx, o.visit)
  const critical = w.reviews.filter((r) => r.critical); const others = w.reviews.filter((r) => !r.critical)
  return {
    notices: { hidden: rec.hidden.filter((h) => h.items > 0).map((h) => ({ department_id: h.department_id, department: nameOf(ctx.org, h.department_id) ?? '', items: h.items })),
      died: rec.tables['base.deceased']?.rows[0]?.at ?? null },
    /** 1 · chronic ones first, then the newest; empty: "No active problems" and the review line (reviewed · or not reviewed, a prompt) */
    problems: { ...cut(problems.active, lim(6)), review: problems.review },
    /** 2 · current, then reported (tagged); on hold and sent on are on each row */
    medicines: { ...cut([...meds.current, ...meds.reported], lim(8)), review: meds.review },
    /** 3 · never cut: every active alert, then every active allergy; empty: checked (nka) or not asked */
    allergies: { alerts: alerts.active, rows: allergies.active, review: allergies.review, nka: allergies.nka, asked: allergies.asked },
    /** 3b · the latest current pregnancy and breastfeeding facts (yes or no); none: the item is left out */
    facts: { pregnancy: pregnancyOf(o.facts, ctx.org?.types, o.today ?? new Date().toISOString().slice(0, 10)), breastfeeding: breastfeedingOf(o.facts, ctx.org?.types) },
    /** 4 · one reading's worth of tiles, unflagged; empty: "No vitals recorded" */
    vitals: vitalsNow(values, rec.tables['base.values']?.entries),
    /** 5 · show: any result value at all (else the item is left out); none: values, but no key test and nothing flagged */
    results: { rows: key.rows, show: key.any, none: key.any && !key.rows.length },
    /** 6 · the latest visits and stays other than this one */
    visits: cut(visitsOf(rec, ctx, o.visitId).filter((v) => v.id !== o.visitId), lim(3)),
    /** 7 · every critical review and three others; orders out, five; this visit waiting for results */
    waiting: { reviews: [...critical, ...others.slice(0, 3)], more_reviews: Math.max(0, others.length - 3), orders: cut(w.orders, 5), pending: w.pending,
      empty: !w.reviews.length && !w.orders.length && !w.pending },
    /** the banner's chip: "1 critical to review" (danger) or "2 to review" (warn) */
    to_review: { n: w.reviews.length, critical: critical.length },
  }
}
export type Summary = ReturnType<typeof summaryOf>
