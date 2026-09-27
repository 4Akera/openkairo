// The block's shell (design-system.md §4.5): a set's head (when, who, where, the presence moves), a block's row (the time gutter, the
// family's icon and plain label, the tags, the body), and the parts bodies share: labelled paragraphs and file chips. Tokens only;
// colour marks state, the family is told by the icon and the word.
import { useState, type HTMLAttributes, type ReactNode } from 'react'
import { Paperclip, type LucideIcon } from 'lucide-react'
import type { Attachment } from '../../../db/shapes.generated'
import { fileLink } from '../../../db/rpc'
import { cn, errorText, hm } from '../../../ui'
import type { SetGroup } from '../model/encounter'
import { baseOf } from '../model/items'
import { MOVE_WORD, sections, words } from '../model/labels'
import { personName, placeName, useBlockEnv, when } from './env'

type RowProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & { time?: string | null; icon: LucideIcon; label?: ReactNode; tags?: ReactNode; bare?: boolean }
/** a block's row: the time gutter, then the meta line (icon, plain label, tags at the end) and the body; bare puts a one-line body in
 *  the meta line itself (a list review) */
export function Shell({ time, icon: I, label, tags, bare, className, children, ...rest }: RowProps) {
  return <div className={cn('grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 px-4 py-3 transition-colors hover:bg-hover', className)} {...rest}>
    <span className="pt-px text-end text-12 text-faint tnum">{time}</span>
    <div className="min-w-0">
      <div className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-1 text-12 text-faint', !bare && 'mb-1')}>
        <I aria-hidden className="size-3.5 shrink-0" />{bare ? children : <span className="min-w-0">{label}</span>}
        {tags && <span className="ms-auto flex flex-wrap items-center justify-end gap-1">{tags}</span>}
      </div>
      {!bare && children}
    </div>
  </div>
}

/** a presence move in words: Called 09:05 · Moved to Bed 5 10:12 */
function moveWords(env: ReturnType<typeof useBlockEnv>, m: SetGroup['moves'][number]) {
  const b = baseOf(m.type, env.org?.types); const d = m.data ?? {}
  const where = b === 'moved' ? env.org?.places.find((p) => p.id === d.place_id)?.name : b === 'transferred' ? placeName(env, d.to_department_id as string) : null
  return `${MOVE_WORD[b] ?? words(b)}${where ? ` to ${where}` : ''} ${hm(m.recorded_at)}`
}
/** a signed set's head: when it was signed, by whom, where; the visit's moves that went with it at the end */
export function SetHead({ set }: { set: SetGroup }) {
  const env = useBlockEnv(); const moves = set.moves.map((m) => moveWords(env, m))
  const alone = !set.groups.length
  return <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5 bg-sunken px-4 py-2 text-12 text-faint tnum', !alone && 'border-b border-line')}>
    <span>{when(set.at)}</span>
    {set.author_id && <span className="font-medium text-fg">{personName(env, set.author_id) ?? 'Someone'}</span>}
    <span>{placeName(env, set.department_id)}</span>
    {moves.length > 0 && <span className={cn(!alone && 'ms-auto')}>{alone ? `· ${moves.join(' · ')}` : moves.join(' · ')}</span>}
  </div>
}

/** a note's or a report's text as small labelled paragraphs (hx: ex: plan:, S O A P, Findings: Impression:) */
export function Paragraphs({ text, className }: { text: string | null | undefined; className?: string }) {
  const parts = sections(text)
  if (!parts.length) return null
  return <div className={cn('grid gap-2', className)}>{parts.map((p, i) => <div key={i}>
    {p.label && <p className="text-11 font-semibold uppercase tracking-[0.08em] text-faint">{p.label}</p>}
    <p className="whitespace-pre-wrap text-14 leading-relaxed text-fg">{p.text}</p>
  </div>)}</div>
}

const size = (n: number) => n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`
/** a note's or a result's files: chips that open a short-lived link (the server checks the reader may see the entry) */
export function Files({ entryId, files }: { entryId: string; files: Attachment[] | undefined }) {
  const env = useBlockEnv(); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState<string | null>(null)
  if (!files?.length) return null
  const open = async (f: Attachment) => {
    if (env.sample || !env.departmentId) { env.onSample?.(`open ${f.name ?? 'the file'}`); return }
    setErr(null); setBusy(f.sha256)
    try { window.open(await fileLink(entryId, f.sha256, env.departmentId), '_blank', 'noopener') } catch (e) { setErr(errorText(e)) } finally { setBusy(null) }
  }
  return <div className="mt-2 grid gap-1">
    <div className="flex flex-wrap gap-1.5">{files.map((f) => <button key={f.sha256} type="button" onClick={() => void open(f)} aria-busy={busy === f.sha256 || undefined}
      className="inline-flex h-6 max-w-full items-center gap-1 rounded-md px-2 text-12 text-fg ring-1 ring-inset ring-line transition-colors hover:bg-hover hover:ring-line-strong focus-ring">
      <Paperclip aria-hidden className="size-3.5 shrink-0 text-faint" /><span className="truncate">{f.name ?? 'File'}</span><span className="text-faint tnum">{size(f.size)}</span>
    </button>)}</div>
    {err && <p role="alert" className="text-12 text-danger">{err}</p>}
  </div>
}
