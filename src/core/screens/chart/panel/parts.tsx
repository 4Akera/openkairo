// The record panel's shared row parts (from visit/Side.tsx): a list's review toggle, the + that starts a line in the composer, a
// draft row (the draft look: signed on Done), a row's actions shown on hover or focus (always on a touch screen), Undo, a fact that
// opens its entry in the center, the "+N more" that opens the rest in place, and a group's small heading. Tokens only.
import type { ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import type { ListReview } from '../../../db/types'
import { Heading, IconButton, cn, shortDate } from '../../../ui'
import { DRAFT_LOOK } from '../blocks/env'
import { DRAFT, startLine, type ListDrafts, type ListName } from './actions'
import type { Panel } from './RecordPanel'

/** a list's review: ✓ the date it was reviewed, or "not reviewed" (warn: it asks for one); a click drafts "reviewed today" or takes it back */
export function ReviewToggle({ p, d, list, at }: { p: Panel; d: ListDrafts; list: ListName; at: ListReview | null }) {
  if (!p.writes('write:list_review')) return null
  const now = d.review(list)
  return <button type="button" title="Mark this list reviewed today" aria-pressed={!!now} onClick={() => now ? d.remove(now.id) : d.add(DRAFT.reviewed(list))}
    className={cn('rounded-sm px-0.5 text-11 focus-ring', now ? 'font-medium text-accent' : at ? 'text-faint hover:text-muted' : 'text-warn')}>
    {now ? '✓ reviewed now' : at ? `✓ ${shortDate(at.reviewed_at)}` : 'not reviewed'}</button>
}
/** the list's review as a line after its empty state: reviewed on a date (ok) or not reviewed (warn) */
export function ReviewLine({ at }: { at: ListReview | null }) {
  return at ? <span className="text-ok"> · reviewed {shortDate(at.reviewed_at)}</span> : <span className="text-warn"> · not reviewed</span>
}

/** + : the composer's line started (/dx, /rx, /al), as Alt+P, Alt+M, Alt+A */
export function AddButton({ p, line, keyName, action }: { p: Panel; line: string; keyName: string; action: string }) {
  if (!p.writes(action)) return null
  return <IconButton title={`Add (Alt+${keyName})`} aria-label={`Add (Alt+${keyName})`} onClick={() => { startLine(line); p.onCompose?.() }}><Plus /></IconButton>
}

/** a new item drafted here, signed on Done: the draft look, and a way to take it back */
export function DraftRow({ children, onUndo }: { children: ReactNode; onUndo: () => void }) {
  return <li className={cn('my-1 flex items-start gap-2 rounded-md px-2 py-1.5', DRAFT_LOOK)}>
    <span className="min-w-0 flex-1 text-13 font-medium text-accent"><span className="sr-only">Not signed yet: </span>{children}</span>
    <IconButton title="Remove" aria-label="Remove" onClick={onUndo}><X /></IconButton>
  </li>
}
export const Undo = ({ onClick }: { onClick: () => void }) => <IconButton title="Undo" aria-label="Undo" onClick={onClick}><X /></IconButton>

/** a row's actions: shown on hover and focus, always where there is no hover */
export function RowActions({ children }: { children: ReactNode }) {
  return <span className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">{children}</span>
}

/** a fact that opens its entry in the center */
export function Fact({ onOpen, children, className, title }: { onOpen?: () => void; children: ReactNode; className?: string; title?: string }) {
  if (!onOpen) return <span className={className}>{children}</span>
  return <button type="button" title={title} onClick={onOpen} className={cn('rounded-sm text-start hover:underline focus-ring', className)}>{children}</button>
}

/** "+N more": the rest, in place or in its section */
export function More({ n, onClick, children }: { n: number; onClick: () => void; children?: ReactNode }) {
  if (n <= 0 && !children) return null
  return <button type="button" onClick={onClick} className="mt-0.5 rounded-sm text-12 text-accent hover:underline focus-ring">{children ?? `+${n} more`}</button>
}

/** a group's small heading inside a section (Diagnoses at visits, Family history, a laboratory service) */
export function Sub({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return <Heading right={right} className={cn('mt-2 mb-0.5', className)}>{children}</Heading>
}
