// A set's allergies as one block (chart-plan.md §1.3): the substance in danger, allergy or intolerance, the reactions, the worst
// severity, high risk, the kind; a refuted one reads "Not an allergy (ruled out)" and is not red.
import type { EntryData } from '../../../db/shapes.generated'
import { Badge, Tag, cn } from '../../../ui'
import type { ChartItem } from '../model/items'
import { ALLERGY_STATUS } from '../model/labels'
import { ItemFrame } from './Item'
import type { GroupProps } from './env'

const RANK = { mild: 1, moderate: 2, severe: 3 } as const
const SEVERITY_TONE = { mild: 'neutral', moderate: 'warn', severe: 'danger' } as const

export function Allergies({ items }: GroupProps) {
  return <div className="grid gap-1">{items.map((i) => <ItemFrame key={i.id} item={i}><AllergyLine item={i} /></ItemFrame>)}</div>
}

function AllergyLine({ item }: { item: ChartItem }) {
  const d = item.entry.data as EntryData['allergy'] | undefined
  if (!d?.concept) return <p className="text-13 text-muted">{item.entry.line}</p>
  const refuted = d.verification === 'refuted'; const active = d.clinical_status === 'active' && !refuted
  const worst = (d.reactions ?? []).map((r) => r.severity).filter((s): s is keyof typeof RANK => !!s).sort((a, b) => RANK[b] - RANK[a])[0]
  const reactions = (d.reactions ?? []).map((r) => r.manifestation.text).filter(Boolean).join(', ')
  return <div>
    <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span className={cn('text-14 font-medium', active ? 'text-danger' : 'text-muted')}>{d.concept.text}</span>
      <span className="text-13 text-muted">{d.type === 'intolerance' ? 'intolerance' : 'allergy'}{reactions && ` · ${reactions}`}</span>
      {worst && !refuted && <Badge tone={SEVERITY_TONE[worst]}>{worst[0].toUpperCase() + worst.slice(1)}</Badge>}
      {d.criticality === 'high' && !refuted && <Badge tone="danger">High risk</Badge>}
      {refuted ? <span className="text-13 text-muted">{ALLERGY_STATUS.refuted}</span> : !active && <Tag>{ALLERGY_STATUS[d.clinical_status]}</Tag>}
      {d.verification === 'unconfirmed' && <Tag tone="warn">Unconfirmed</Tag>}
    </p>
    {(d.category?.length || d.note) && <p className="text-12 text-faint">{[d.category?.join(', '), d.note].filter(Boolean).join(' · ')}</p>}
  </div>
}
