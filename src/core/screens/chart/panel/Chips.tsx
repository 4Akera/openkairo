// The section chips (spec/openCare.md §5.1 "The section chips"): one row — the Summary and this department's pack sections, a thin
// line, the base's, other packs' that show because of data, then More · n, which opens the rest in the same row and folds them again
// (never a menu over the record). Chips that do not fit the row's width fold into More too, from the end, so the row never runs past
// its edge and More is always in sight; the Summary never folds. Each chip is the section's name and its word; a colour only for a
// state (critical, not asked), never to tell a pack apart. ←/→ (Home, End) move, ↵ jumps; keys 1–9 jump to the chip in that place
// (ChartScreen's listener clicks [data-chip]); the chart's Alt+R focuses the current one (#record-sections). A chip with a state word
// (critical, not asked) never folds. Opened, the row wraps so every chip is in sight, Fewer last. On a phone it sits under the banner.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '../../../ui'
import type { ChipWord } from '../sections'

export interface ChipItem { key: string; title: string; word: ChipWord | null }
const WORD = { warn: 'font-medium text-warn', danger: 'font-medium text-danger' }
const GAP = 2, LINE = 10, MORE = 72   // px: between chips, the thin line, the More chip

/** how many of the row's chips fit in `room` px, keeping room for More when anything is left over (at least the Summary) */
export function fitCount(widths: number[], room: number, extra: number, line: number): number {
  const fits = (reserve: number) => { let used = 0, n = 0
    for (let i = 0; i < widths.length; i++) { const w = widths[i] + GAP + (i === line ? LINE : 0); if (used + w > room - reserve) break; used += w; n++ }
    return n }
  const all = fits(extra > 0 ? MORE : 0)
  return Math.max(1, all === widths.length ? all : fits(MORE))
}

/** which of the row's chips stay in sight: the Summary first, then those with a state word (critical, not asked: they never fold),
 *  then the rest in order, as many as fit; shown in the row's own order */
export function keptChips(line: ChipItem[], width: (c: ChipItem) => number, room: number, extra: number, hasLine: boolean): Set<string> {
  const priority = [line[0], ...line.slice(1).filter((c) => c.word?.tone), ...line.slice(1).filter((c) => !c.word?.tone)].filter(Boolean)
  const n = fitCount(priority.map(width), room - (hasLine ? LINE : 0), extra, -1)
  return new Set(priority.slice(0, n).map((c) => c.key))
}

export function Chips({ lead, rest, more, open, onMore, jump }: { lead: ChipItem[]; rest: ChipItem[]; more: ChipItem[]; open: boolean; onMore: () => void
  jump: (key: string) => void }) {
  const row = useRef<HTMLElement>(null)
  // the row's width and each chip's, measured when the row resizes (a folded chip keeps the width it had when last drawn)
  const [size, setSize] = useState<{ room: number; widths: Record<string, number> }>({ room: Number.POSITIVE_INFINITY, widths: {} })
  useEffect(() => {
    const el = row.current; if (!el) return
    const measure = () => setSize((s) => { const widths = { ...s.widths }
      el.querySelectorAll<HTMLElement>('[data-chip]').forEach((b) => { widths[b.dataset.chip!] = b.offsetWidth })
      return { room: el.clientWidth, widths } })
    const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect()
  }, [])
  const { room, widths } = size
  const line = [...lead, ...rest]
  const width = (c: ChipItem) => widths[c.key] ?? 16 + 7 * (c.title.length + (c.word?.word.length ?? 0))
  const kept = keptChips(line, width, room, more.length, lead.length > 1)
  const folded = line.filter((c) => !kept.has(c.key))
  const shown = open ? [...line, ...more] : line.filter((c) => kept.has(c.key))
  const leadShown = shown.filter((c) => lead.includes(c)).length
  const [focus, setFocus] = useState<string | null>(null)
  const at = Math.max(0, shown.findIndex((c) => c.key === focus))
  const keys = (e: KeyboardEvent<HTMLElement>) => {
    const k = e.key === 'ArrowRight' ? at + 1 : e.key === 'ArrowLeft' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? shown.length - 1 : null
    if (k === null || !(e.target as HTMLElement).hasAttribute('data-chip')) return
    e.preventDefault(); const i = (k + shown.length) % shown.length; setFocus(shown[i].key); e.currentTarget.querySelectorAll<HTMLElement>('[data-chip]')[i]?.focus()
  }
  const chip = (c: ChipItem) => { const i = shown.indexOf(c)
    return <button key={c.key} type="button" data-chip={c.key} tabIndex={i === at ? 0 : -1} aria-keyshortcuts={i < 9 ? String(i + 1) : undefined}
      onClick={() => { setFocus(c.key); jump(c.key) }}
      className={cn('inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-12 text-muted transition-colors hover:bg-hover hover:text-fg focus-ring',
        i === at && 'bg-accent-soft font-medium text-accent')}>
      {c.title}{c.word && <span className={cn('tnum', c.word.tone ? WORD[c.word.tone] : i === at ? 'text-accent' : 'text-faint')}>{c.word.word}</span>}</button> }
  const left = folded.length + more.length
  return <nav ref={row} id="record-sections" aria-label="Record sections" onKeyDown={keys}
    className={cn('flex items-center gap-0.5 py-0.5 @max-split:sticky @max-split:top-[calc(var(--chart-top,0px)+2.25rem)] @max-split:z-sticky @max-split:bg-canvas',
      open ? 'flex-wrap' : 'overflow-hidden')}>
    {shown.slice(0, leadShown).map(chip)}
    {leadShown > 1 && shown.length > leadShown && <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-line-strong" />}
    {shown.slice(leadShown).map(chip)}
    {left > 0 && <button type="button" aria-expanded={open} onClick={onMore}
      className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full px-2 text-12 text-faint transition-colors hover:bg-hover hover:text-fg focus-ring">
      {open ? 'Fewer' : `More · ${left}`}</button>}
  </nav>
}
