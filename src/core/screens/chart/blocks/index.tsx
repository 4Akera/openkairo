// The record's blocks (chart-plan.md §1.3, design-system.md §4.5): one card per signed set, its blocks divided by hairlines; within a
// set the paper forms (a prescription, a requisition, the problems, the allergies) are one block each, everything else stands alone.
// The shell, the time, the family's icon and plain word and every state are drawn here, the body by the type's block (registry.ts), so
// a pack's block looks native. The center, the drafts, the glance and the /design gallery all draw through these.
import type { ReactNode } from 'react'
import { Card, Tag, cn } from '../../../ui'
import type { SetGroup } from '../model/encounter'
import type { BlockGroup, ChartItem } from '../model/items'
import { ItemFrame } from './Item'
import { SetHead, Shell } from './Shell'
import { BARE, GROUPS, GROUP_OF, ICON, blockFor, labelFor, ownBlock, type GroupKind } from './registry'
import { DRAFT_LOOK, gutter, useBlockEnv } from './env'

/** a signed set: its head (when, who, where, the visit's moves), then its blocks; head replaces the head (the drafts' "Not signed yet") */
export function SetCard({ set, head, className }: { set: SetGroup; head?: ReactNode; className?: string }) {
  return <Card className={cn('overflow-hidden', className)}>
    {head ?? <SetHead set={set} />}
    {set.groups.length > 0 && <div className="divide-y divide-line">{set.groups.map((g) => <BlockView key={g.items[0].id} group={g} setAt={set.at} />)}</div>}
  </Card>
}

/** a block group: a paper form, or one item (an item of a pack's own block always stands alone) */
export function BlockView({ group, setAt }: { group: BlockGroup; setAt?: string | null }) {
  if (group.kind === 'single') return <EntryBlock item={group.items[0]} setAt={setAt} />
  const own = group.items.filter((i) => ownBlock(i.type)); const rest = group.items.filter((i) => !ownBlock(i.type))
  return <>{rest.length > 0 && <GroupBlock kind={group.kind} items={rest} setAt={setAt} />}{own.map((i) => <EntryBlock key={i.id} item={i} setAt={setAt} />)}</>
}

/** one item as a block: its frame and states (ItemFrame), its body from the registry; a medicine, problem, allergy or order alone is
 *  still drawn as its paper form */
export function EntryBlock({ item, setAt }: { item: ChartItem; setAt?: string | null }) {
  const env = useBlockEnv(); const types = env.org?.types; const g = GROUP_OF[item.family]
  if (g && !ownBlock(item.type)) return <GroupBlock kind={g} items={[item]} setAt={setAt} />
  const Body = blockFor(item.type, types).Body
  return <ItemFrame item={item} head={{ time: gutter(item.at, setAt, !!item.draft), icon: ICON[item.family], label: labelFor(item, types), bare: BARE.has(item.family) }}>
    <Body item={item} data={item.entry.data ?? {}} compact={env.compact} />
  </ItemFrame>
}

/** a paper form: one shell (the earliest time, the form's icon and name), each member a line with its own states */
function GroupBlock({ kind, items, setAt }: { kind: GroupKind; items: ChartItem[]; setAt?: string | null }) {
  const G = GROUPS[kind]; const drafts = items.every((i) => i.draft)
  const at = items.reduce((a, i) => i.at < a ? i.at : a, items[0].at)
  return <div className={cn(drafts && DRAFT_LOOK, items.some((i) => i.review?.critical) && 'rail-danger')}>
    <Shell time={gutter(at, setAt, drafts)} icon={G.icon} label={G.label(items)} tags={drafts && <Tag tone="accent">Not signed</Tag>}><G.Body items={items} /></Shell>
  </div>
}
