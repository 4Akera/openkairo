// The Session tab's small shared parts (spec/openCare.md §5.6, D2b): a card's heading, its notices (the glyph and the words, amber or
// red; shown, never a stop), and what came back from a Done (a refusal's words, or warnings with Sign anyway), each above its button.
import type { ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button, cn } from '@core/ui'

export const CAPS = 'text-11 font-semibold uppercase tracking-[0.06em] text-faint'
export function CardHead({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-2"><p className={CAPS}>{children}</p>{right}</div>
}
export function Notices({ items }: { items: { text: string; tone: 'warn' | 'danger' }[] }) {
  if (!items.length) return null
  return <ul className="grid gap-0.5">{items.map((n) => <li key={n.text} className={cn('flex items-center gap-1.5 text-12', n.tone === 'danger' ? 'text-danger' : 'text-warn')}>
    <TriangleAlert aria-hidden className="size-3.5 shrink-0" />{n.text}</li>)}</ul>
}
export function SignState({ err, warn }: { err: string | null; warn: { text: string; again: () => void } | null }) {
  return <>
    {err && <p role="alert" className="text-13 text-danger">{err}</p>}
    {warn && <p role="alert" className="flex flex-wrap items-center gap-2 text-13 text-warn"><TriangleAlert aria-hidden className="size-3.5 shrink-0" />{warn.text}
      <Button size="xs" variant="outline" onClick={warn.again}>Sign anyway</Button></p>}
  </>
}
