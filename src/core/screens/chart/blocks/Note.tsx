// A note (chart-plan.md §1.3): its kind is the block's label (Progress note, Consult reply …); the heading, then the text with hx: ex:
// plan: and S O A P lines as small labelled paragraphs, then its files. In the glance only the first lines show.
import type { EntryData } from '../../../db/shapes.generated'
import type { BlockProps } from '../../../renderers'
import { cn } from '../../../ui'
import { Files, Paragraphs } from './Shell'

export function Note({ item, data, compact }: BlockProps) {
  const d = data as Partial<EntryData['note']>
  return <div>
    {d.heading && <p className="mb-1 text-14 font-medium text-fg">{d.heading}</p>}
    <Paragraphs text={d.text} className={cn(compact && 'line-clamp-4')} />
    <Files entryId={item.entry.id} files={d.attachments} />
  </div>
}
