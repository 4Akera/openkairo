// What the center shows, above it (chart-plan.md §1.2): this visit or stay (its date and department), an older visit opened from the
// record (read-only, with the way back: Esc), the entries outside any visit, the Whole record, results over time, an entry; then the
// kind filter with the counts of what is shown. The composer and the drafts stay above it whatever is open (§9.2).
import type { ReactNode } from 'react'
import { ArrowLeft, Lock } from 'lucide-react'
import { Button, Kbd, shortDate } from '../../../ui'
import { useChart } from '../context'
import type { VisitLine } from '../model/record'

const HOME = { visit: 'Back to this visit', stay: 'Back to this stay', record: 'Back to the record' }

export function ScopeBar({ title, line, meta, children }: { title: ReactNode; line?: VisitLine | null; meta?: string | null; children?: ReactNode }) {
  const c = useChart(); const away = c.at.scope !== 'encounter'
  const words = line ? [shortDate(line.start), line.kind === 'stay' ? `${line.days} day${line.days === 1 ? '' : 's'}` : null, line.department, line.who].filter(Boolean).join(' · ') : null
  return <div className="grid gap-2">
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <h2 className="text-14 font-semibold text-fg">{title}</h2>
      {line?.locked && <Lock aria-label="Private notes here are hidden from you" className="size-3.5 self-center text-faint" />}
      {(words || meta) && <span className="min-w-0 text-12 text-faint tnum">{[words, meta].filter(Boolean).join(' · ')}</span>}
      {away && <Button size="xs" variant="ghost" className="ms-auto" onClick={() => c.open({ scope: 'encounter' })}>
        <ArrowLeft aria-hidden className="rtl:-scale-x-100" />{HOME[c.mode]}<Kbd>esc</Kbd></Button>}
    </div>
    {children}
  </div>
}
