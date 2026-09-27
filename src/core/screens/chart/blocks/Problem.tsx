// A set's problems as one block, "Diagnoses & problems" (chart-plan.md §1.3): each with its ICD-10 code, Suspected, New / Updated /
// Resolved, since when, and its note. Each line keeps its own states (crossed out, corrected, Details) through ItemFrame.
import type { EntryData } from '../../../db/shapes.generated'
import { Tag, ymd } from '../../../ui'
import type { ChartItem } from '../model/items'
import { PROBLEM_STATUS, partialWords, sinceWords } from '../model/labels'
import { ItemFrame } from './Item'
import type { GroupProps } from './env'

const DONE = new Set(['inactive', 'remission', 'resolved'])
const UNSURE = new Set(['provisional', 'unconfirmed', 'differential'])

export function Problems({ items }: GroupProps) {
  return <div className="grid gap-1">{items.map((i) => <ItemFrame key={i.id} item={i}><ProblemLine item={i} /></ItemFrame>)}</div>
}

function ProblemLine({ item }: { item: ChartItem }) {
  const d = item.entry.data as EntryData['problem'] | undefined
  if (!d?.concept) return <p className="text-13 text-muted">{item.entry.line}</p>
  const code = d.concept.codings?.find((c) => c.system === 'icd10')?.code
  const change = DONE.has(d.clinical_status) ? PROBLEM_STATUS[d.clinical_status] : item.entry.item_version === 1 ? 'New' : 'Updated'
  const since = partialWords(d.onset, ymd); const ago = sinceWords(d.onset?.value)
  const more = [d.laterality, d.body_site?.text, d.severity].filter(Boolean).join(' · ')
  return <div>
    <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span className="text-14 font-medium text-fg">{d.concept.text}</span>{code && <span className="font-mono text-11 text-faint">{code}</span>}
      {UNSURE.has(d.verification) && <Tag tone="warn">Suspected</Tag>}{d.verification === 'refuted' && <Tag>Ruled out</Tag>}
      {d.category === 'encounter-diagnosis' && <Tag>Diagnosis</Tag>}<Tag tone={DONE.has(d.clinical_status) ? 'ok' : 'neutral'}>{change}</Tag>
      {since && <span className="text-12 text-faint tnum">since {since}{ago && ago !== 'this month' ? ` (${ago})` : ''}</span>}
    </p>
    {more && <p className="text-12 text-faint">{more}</p>}
    {d.note && <p className="text-13 text-muted">{d.note}</p>}
  </div>
}
