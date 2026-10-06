// Pregnant and breastfeeding (spec/openCare.md §5.1 rule 3): yes or no in words, the LMP or the weeks said, and, ended, struck and
// quiet with why. A state in words, never by colour alone.
import type { EntryData } from '../../../db/shapes.generated'
import type { BlockProps } from '../../../renderers'
import { Tag, longDate } from '../../../ui'
import { breastfeedingWords, pregnancyWords } from '../model/facts'

export function Fact({ item, data }: BlockProps) {
  const preg = item.type === 'pregnancy' || item.base === 'pregnancy'
  const d = data as Partial<EntryData['pregnancy'] & EntryData['breastfeeding']>
  const yes = preg ? !!d.pregnant : !!d.breastfeeding
  const word = preg ? pregnancyWords({ pregnant: yes, weeks: d.weeks ?? null }) : breastfeedingWords({ breastfeeding: yes })
  const ended = d.status === 'ended'
  return <div className="grid gap-0.5 text-13">
    <p className="flex flex-wrap items-baseline gap-x-1.5">
      <span className={ended ? 'text-14 text-faint line-through' : 'text-14 font-medium text-fg'}>{word}</span>
      {ended ? <Tag>Ended</Tag> : yes && <Tag tone="info">Current</Tag>}
      {preg && d.lmp?.value && <span className="text-12 text-muted tnum">LMP {longDate(d.lmp.value)}</span>}
    </p>
    {(d.reason || d.note) && <p className="text-muted">{[d.reason, d.note].filter(Boolean).join(' — ')}</p>}
  </div>
}
