// One item of the record with its states (design-system.md §4.5, chart-plan.md §1.3), drawn the same wherever it stands: a draft
// (dashed, "Not signed", edit and remove), new (a dot), corrected, crossed out (struck, with why, who and when), a review for me
// (critical: the danger rail and a badge; Reviewed for whoever may write it), private (a quiet line, Open anyway). ↵ on it opens its
// Details under it and Esc closes them. A single block is one of these with a head; each line of a group block is one without.
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown, Pencil, Trash2, type LucideIcon } from 'lucide-react'
import { oneSet, reviewed } from '../../../db/entries'
import { useWrite } from '../../../hooks/writes'
import { Badge, Button, IconButton, Tag, cn, errorText } from '../../../ui'
import type { ChartItem } from '../model/items'
import { CROSSED_REASON } from '../model/labels'
import { Details } from './Details'
import { PrivateBlock } from './Privacy'
import { Shell } from './Shell'
import { DRAFT_LOOK, personName, useBlockEnv, when } from './env'

export interface Head { time: string | null; icon: LucideIcon; label: ReactNode; bare?: boolean }
// shown on hover, on focus within, and always where there is no hover (a touch screen)
const REVEAL = 'opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100'
const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus'

export function ItemFrame({ item, head, tags: more, children }: { item: ChartItem; head?: Head; tags?: ReactNode; children: ReactNode }) {
  const env = useBlockEnv(); const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(() => !!env.startOpen?.includes(item.entry.id))
  if (item.hidden) return <PrivateBlock item={item} time={head?.time} inline={!head} />
  const close = () => { setOpen(false); ref.current?.focus() }
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(); return }
    if (e.key === 'Enter' && e.target === e.currentTarget && !e.altKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setOpen(!open) }
  }
  const critical = !!item.review?.critical
  const tags = <>
    {more}
    {item.isNew && <span className="inline-flex items-center gap-1 text-11 font-medium text-accent"><span aria-hidden className="size-1.5 rounded-full bg-accent" />new</span>}
    {item.corrected && <Tag tone="info">Corrected</Tag>}
    {item.review && (critical ? <Badge tone="danger">Critical</Badge> : <Tag tone="warn">To review</Tag>)}
    {item.review && (env.sample || env.can?.('write:reviewed')) && <MarkReviewed item={item} />}
    {head && item.draft && <Tag tone="accent">Not signed</Tag>}
    {item.draft && env.onEdit && <IconButton title="Edit" aria-label="Edit" className={REVEAL} onClick={() => env.onEdit!(item.draft!)}><Pencil /></IconButton>}
    {item.draft && env.onRemove && <IconButton title="Remove" aria-label="Remove" tone="danger" className={REVEAL} onClick={() => env.onRemove!(item.draft!)}><Trash2 /></IconButton>}
    <IconButton title={open ? 'Hide the details (Esc)' : 'Details (↵)'} aria-label="Details" aria-expanded={open} onClick={() => open ? close() : setOpen(true)} className={cn(!open && REVEAL)}>
      <ChevronDown className={cn('transition-transform duration-base', open && 'rotate-180')} /></IconButton>
  </>
  const body = item.crossed ? <>
    <div className="text-faint line-through [&_*]:text-faint">{children}</div>
    <p className="mt-1 text-12 text-faint">Crossed out · {CROSSED_REASON[item.crossed.reason] ?? item.crossed.reason}{item.crossed.text ? ` (${item.crossed.text})` : ''}
      {' · '}{personName(env, item.crossed.by) ?? 'someone'} · {when(item.crossed.at)}</p>
  </> : item.draft && env.draftLine ? <>{children}{env.draftLine(item.draft)}</> : children
  const label = typeof head?.label === 'string' ? head.label : undefined
  if (head) return <div ref={ref} id={`entry-${item.entry.id}`} tabIndex={0} role="article" aria-label={label} onKeyDown={keys}
    className={cn('group/item', FOCUS, item.draft && DRAFT_LOOK, critical && 'rail-danger')}>
    <Shell time={head.time} icon={head.icon} label={head.label} bare={head.bare} tags={tags}>{body}</Shell>
    {open && <Details item={item} onClose={close} />}
  </div>
  return <div ref={ref} id={`entry-${item.entry.id}`} tabIndex={0} onKeyDown={keys} className={cn('group/item -mx-2 rounded-md px-2 py-1', FOCUS, critical && 'rail-danger')}>
    <div className="flex flex-wrap items-start gap-x-2 gap-y-1"><div className="min-w-0 flex-[1_1_12rem]">{body}</div><span className="ms-auto flex shrink-0 flex-wrap items-center justify-end gap-1">{tags}</span></div>
    {open && <Details inset item={item} onClose={close} />}
  </div>
}

/** "I have seen it": a reviewed entry about the result closes its review row (as the clinic home's list does) */
function MarkReviewed({ item }: { item: ChartItem }) {
  const env = useBlockEnv(); const w = useWrite()
  const go = () => env.sample || !env.departmentId ? env.onSample?.('mark it reviewed')
    : w.mutate(oneSet([reviewed(item.review?.entry_id ?? item.entry.id, item.entry.patient_id, env.departmentId)]))
  return <>
    <Button size="xs" variant="outline" loading={w.isPending} onClick={go}>Reviewed</Button>
    {w.error && <span role="alert" className="text-12 text-danger">{errorText(w.error)}</span>}
  </>
}
