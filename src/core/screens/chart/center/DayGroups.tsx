// A stay's days (chart-plan.md §0, §3.2): newest first, "Day 4 · Tue 30 Sep", every day from admission to today (or the discharge) — a
// day with nothing signed says so — each day's signed sets inside, on the clinical day they happened (the clinic's time zone).
import { ymd } from '../../../ui'
import { SetCard } from '../blocks'
import type { DayGroup } from '../model/encounter'

/** a date (not an instant) in words: Tue 30 Sep */
const dayWords = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })

export function DayGroups({ days, filtered }: { days: DayGroup[]; filtered?: boolean }) {
  const today = ymd(new Date().toISOString())
  return <div className="grid gap-4">{days.map((d) => <section key={d.day} aria-label={`Day ${d.n}`} className="grid gap-2">
    <h3 className="flex items-baseline gap-2 text-12 text-faint tnum"><span className="font-semibold text-fg">Day {d.n}</span>{dayWords(d.day)}{d.day === today && <span className="text-accent">today</span>}</h3>
    {d.sets.length ? d.sets.map((s) => <SetCard key={s.set_id} set={s} />)
      : <p className="rounded-lg px-3 py-2 text-13 text-faint ring-1 ring-inset ring-line">{filtered ? 'None of these this day' : 'Nothing signed this day'}</p>}
  </section>)}</div>
}
