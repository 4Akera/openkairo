// A list review (chart-plan.md §1.3): one quiet line in the block's meta line — "Medicines reviewed", "Allergies: none known" (ok).
import type { EntryData } from '../../../db/shapes.generated'
import type { BlockProps } from '../../../renderers'

const LIST: Record<string, string> = { problems: 'Problems', medications: 'Medicines', allergies: 'Allergies' }
export function ListReview({ data }: BlockProps) {
  const d = data as Partial<EntryData['list_review']>; const what = LIST[d.list ?? ''] ?? 'The list'
  return <span className="min-w-0">
    {d.outcome === 'none_known' ? <span className="font-medium text-ok">{what}: none known</span> : <span>{what} reviewed</span>}
    {d.note && <span> · {d.note}</span>}
  </span>
}
