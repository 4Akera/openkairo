// A pack's section in the record panel (spec/openCare.md §5.1 rule 2): the kit's folding section with the pack's title, its Summary
// line while folded, and the pack's body over the entries this reader may see. What is hidden from the reader shows as the fact only
// (§4.3): "Private dispense · Psychiatry · 3 Sep", never its content; a section that holds nothing else is never handed to the pack.
// While the packs' read is under way the body is a skeleton, never the pack's empty line.
import { Lock } from 'lucide-react'
import { nameOf } from '../../../db/views'
import { Section, Skeleton, shortDate } from '../../../ui'
import type { Own, SectionDef } from '../sections'
import type { Panel } from './RecordPanel'

export function PackSection({ def, p, own, line, hiddenOnly }: { def: SectionDef; p: Panel; own: Own; line: string | null; hiddenOnly: boolean }) {
  return <Section id={`chart.${def.key}`} variant="compact" title={def.title} summary={hiddenOnly ? 'private' : line ?? undefined}>
    {p.packsLoading ? <Skeleton lines={2} className="py-1.5" /> : !hiddenOnly && <def.Body p={p} own={own} />}
    {own.hidden.length > 0 && <ul aria-label="Private" className="mt-1 grid gap-0.5 text-12 text-faint">{own.hidden.map((e) => <li key={e.item} className="flex items-center gap-1.5">
      <Lock aria-hidden className="size-3 shrink-0" />{[e.line, nameOf(p.ctx.org, e.department_id), shortDate(e.occurred_at)].filter(Boolean).join(' · ')}</li>)}</ul>}
  </Section>
}
