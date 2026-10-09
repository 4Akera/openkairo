// The clinics, drawn together (2026-10-08, proposed by Claude, awaiting the owner): ObGyn's clinic, paediatrics, internal medicine and
// its branches, surgery with theatre and anaesthesia, family medicine. Most of their work happens in the chart of a visit, so this file
// draws the chart as the app does (§4.6, §5.1 rules 2–3): the banner's zones (who · where · safety · this department's pack words), the
// record on the left (40 %) with its row of section chips and its sections, the encounter on the right (60 %) with the composer's line,
// the card under the line, the drafts before Done and what was signed. Each pack's pictures are in its own file (obgyn.tsx,
// paeds.tsx, medicine.tsx, haemonc.tsx, surgery.tsx, family.tsx); stays.tsx still holds the board, the grid by hour and Ask.
import type { ComponentType, ReactNode } from 'react'
import { Banner, Button, Card, Heading, Kbd, Tag, cn, type Tone } from '@core/ui'
import { App, Label } from './kit'

export { Ask, Board, Grid, noop, type Bed, type GridRow } from './stays'
export { Keys, Line, Under } from './order'

/** a chip in the record's row: its title, its word (a count or a state), a tone only for a state that asks for something */
export type ChipDef = [title: string, word?: string, tone?: 'warn' | 'danger']
/** the row of section chips (§5.1 "The section chips"): the Summary and this department's pack sections, a thin line, the base's, then
 *  More · n; `on` is the chip in view (accent). As the chart does, chips that do not fit the record's width fold into More from the
 *  end (here by an estimate of each chip's width, in a record column about 27rem wide); a chip with a state word never folds. */
export function Chips({ lead, base, more = 0, on, room = 430 }: { lead: ChipDef[]; base: ChipDef[]; more?: number; on?: string; room?: number }) {
  const width = ([t, w]: ChipDef) => 18 + 6.4 * (t.length + (w ? w.length + 1 : 0))
  const all = [...lead, ...base]; const keep = new Set<ChipDef>()
  let used = (lead.length > 1 && base.length ? 10 : 0) + 72
  for (const c of [...all.filter((x, i) => i === 0 || x[2]), ...all.filter((x, i) => i !== 0 && !x[2])]) { const w = width(c) + 2; if (used + w > room && keep.size) continue; used += w; keep.add(c) }
  const shownLead = lead.filter((c) => keep.has(c)), shownBase = base.filter((c) => keep.has(c)), folded = all.length - keep.size + more
  const chip = ([t, w, tone]: ChipDef) => <span key={t} className={cn('inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-12 text-muted',
    t === on && 'bg-accent-soft font-medium text-accent')}>{t}{w && <span className={cn('tnum', tone === 'danger' ? 'font-medium text-danger' : tone === 'warn' ? 'font-medium text-warn' : t === on ? 'text-accent' : 'text-faint')}>{w}</span>}</span>
  return <nav aria-label="Record sections" className="flex items-center gap-0.5 py-0.5">
    <span className="flex min-w-0 items-center gap-0.5 overflow-hidden">{shownLead.map(chip)}{shownLead.length > 1 && shownBase.length > 0 && <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-line-strong" />}{shownBase.map(chip)}</span>
    {folded > 0 && <span className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full px-2 text-12 text-faint">More · {folded}</span>}
  </nav>
}

/** a section of the record panel, as the chart draws it (the kit's compact section): its title, its count, its body; folded, its
 *  Summary line only. A pack's section is drawn exactly like a base one. */
export function Rec({ title, count, folded, right, tone, children }: { title: string; count?: number | string; folded?: string; right?: ReactNode; tone?: 'attention'; children?: ReactNode }) {
  return <Card className={cn('overflow-hidden', tone === 'attention' && 'ring-1 ring-warn-line')}>
    <div className="flex items-center gap-2 px-3.5 pt-3 pb-1">
      <span aria-hidden className={cn('text-11 text-faint', !folded && 'rotate-90')}>›</span>
      <Heading count={count}>{title}</Heading>
      {folded && <span className="min-w-0 truncate text-12 text-faint">{folded}</span>}
      {right && <span className="ms-auto flex shrink-0 items-center gap-1">{right}</span>}
    </div>
    {!folded && children && <div className="px-3.5 pb-3">{children}</div>}
  </Card>
}

/** a label and its value on one line inside a section (the record panel's dense rows) */
export const Row = ({ k, children, tone }: { k: ReactNode; children: ReactNode; tone?: Tone }) =>
  <div className="flex items-baseline gap-2 py-0.5 text-13"><span className="w-24 shrink-0 text-12 text-faint">{k}</span>
    <span className={cn('min-w-0 flex-1', tone === 'danger' ? 'font-medium text-danger' : tone === 'warn' ? 'font-medium text-warn' : tone === 'ok' ? 'text-ok' : 'text-fg')}>{children}</span></div>

/** the drafts, as the chart draws them before Done (or Sign in a stay): one dashed box, a line a draft */
export function Unsigned({ n, sign = 'Done', children }: { n: number; sign?: string; children: ReactNode }) {
  return <div className="grid overflow-hidden rounded-lg border border-line">
    <p className="flex items-center gap-2 bg-surface px-3 py-2 text-13"><Tag tone="accent">Not signed yet</Tag><span className="text-muted">{n} {n === 1 ? 'draft' : 'drafts'} · {sign} writes {n === 1 ? 'it' : 'them'}</span></p>
    <div className="grid gap-1.5 border-t border-dashed border-accent-line bg-accent-soft/40 px-3 py-3 text-14">{children}</div>
  </div>
}

/** something signed earlier in this visit or before: the time, who, and its lines */
export function Signed({ at, by, title, children }: { at: string; by: string; title?: string; children: ReactNode }) {
  return <Card className="grid gap-1 p-3 text-13">
    <p className="flex flex-wrap items-baseline gap-2"><span className="font-mono text-12 text-faint tnum">{at}</span>{title && <span className="font-medium text-fg">{title}</span>}<span className="text-12 text-faint">{by}</span></p>
    <div className="grid gap-0.5 text-fg">{children}</div>
  </Card>
}

/** the chart of a clinic visit: the shell, the banner's zones, then the record (left, 40 %) and the encounter (right, 60 %).
 *  `words` are this department's pack words (two, then +n); `actions` replace Done (a stay's Sign and Discharge, say). */
export function Visit({ dept, user, who, where = 'In consult · 8 min', safety, words, plus, actions, record, children }: {
  dept: string; user: string; who: [string, string]; where?: ReactNode; safety: ReactNode; words?: ReactNode; plus?: number
  actions?: ReactNode; record: ReactNode; children: ReactNode }) {
  const zones = [
    { key: 'where', label: 'Where', node: <span className="text-13 text-accent">{where}</span> },
    { key: 'safety', label: 'Safety', node: <>{safety}</> },
    ...(words ? [{ key: 'packs', label: 'This department', node: <>{words}{!!plus && <span className="rounded-full px-1.5 text-12 font-medium text-accent">+{plus}</span>}</> }] : []),
  ]
  return <App dept={dept} user={user}>
    <Banner name={who[0]} sub={who[1]} zones={zones} sticky={false} back={{ label: 'Back', onClick: noopLocal }}
      actions={actions ?? <Button size="sm">Done<Kbd className="ms-1">⌘↵</Kbd></Button>} />
    <div className="mx-auto mt-4 grid max-w-6xl gap-4 px-4 md:grid-cols-[minmax(15rem,2fr)_minmax(0,3fr)]">
      <aside aria-label="Record" className="grid min-w-0 grid-cols-1 content-start gap-3">{record}</aside>
      <section aria-label="Encounter" className="grid min-w-0 grid-cols-1 content-start gap-3">{children}</section>
    </div>
    <div className="h-8" />
  </App>
}
const noopLocal = () => undefined

/** a pack word in the banner: plain, or a state's colour (the word says it, the colour never alone) */
export const Word = ({ children, tone }: { children: ReactNode; tone?: 'ok' | 'info' | 'warn' | 'danger' }) =>
  tone ? <Tag tone={tone}>{children}</Tag> : <span className="rounded-full bg-sunken px-2 py-0.5 text-12 text-fg ring-1 ring-inset ring-line">{children}</span>

/** a small table inside a card or a section: a head row and plain rows; a cell may carry a state colour */
export function Table({ head, rows, className, first }: { head: string[]; rows: ReactNode[][]; className?: string; first?: string }) {
  return <div className={cn('overflow-x-auto', className)}><table className="w-full border-collapse text-12 tnum">
    <thead><tr className="border-b border-line">{head.map((h, i) => <th key={h + i} className="px-2 py-1 text-start text-11 font-semibold uppercase tracking-[0.06em] text-faint" style={i === 0 && first ? { width: first } : undefined}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="px-2 py-1 align-top text-13 text-fg">{c}</td>)}</tr>)}</tbody>
  </table></div>
}

/** a page that is a pack's own screen in a department (a list of work that is not places, a settings card): the shell and the tabs */
export function Page({ dept, user, tabs, tab, children }: { dept: string; user: string; tabs?: string[]; tab?: string; children: ReactNode }) {
  return <App dept={dept} user={user} tabs={tabs} tab={tab}>{children}</App>
}

/** a flagged value inline: ↑ ↓ ‼ with the colour (never the colour alone) */
export const V = ({ children, f }: { children: ReactNode; f?: 'high' | 'low' | 'critical' | 'ok' }) =>
  <span className={cn('tnum', f === 'critical' ? 'font-semibold text-danger' : f === 'ok' ? 'text-ok' : f ? 'font-medium text-warn' : 'text-fg')}>{children}{f && f !== 'ok' && <span aria-hidden>{f === 'low' ? ' ↓' : f === 'high' ? ' ↑' : ' ‼'}</span>}</span>

export { Label }

/** one picture in the gallery (Pictures.tsx lists each file's in order) */
export interface Pic { id: string; title: string; note: string; Page: ComponentType }
