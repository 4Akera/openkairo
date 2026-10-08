// The departments of places, drawn together (2026-10-08, proposed by Claude, awaiting the owner): the ward, the ER, ICU and CCU, the
// labour ward and the dialysis unit share one board (the base's, §5.1 rule 4) and, all but dialysis, one pack of ward nursing — the
// drug round, observations with NEWS2, fluid balance, handover and the discharge letter. Each specialty adds only what is its own
// (emergency, critical, obgyn's labour ward, dialysis: er.tsx, icu.tsx, labour.tsx, dialysis.tsx). This file holds the shared parts
// (the stay's chart, a board, a grid by hour, a question to the owner); the ward pack's pictures are in ward.tsx.
import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { Button, Card, Kbd, cn } from '@core/ui'
import { BedTile, type Occupant } from '@core/screens/ward/Tile'
import type { TileAction, TileSegment } from '@core/screens/ward/tiles'
import { App } from './kit'

export const noop = () => undefined

// ── shared: the stay's chart, a board, a grid by hour ──

/** the chart of a patient in a bed: the banner's zones (who · where · safety · this department's pack words), Sign and Discharge */
export function Stay({ dept, user, who, where, safety, words, actions, wide, children }: { dept: string; user: string; who: [string, string]; where: string
  safety?: ReactNode; words?: ReactNode; actions?: ReactNode; wide?: boolean; children: ReactNode }) {
  return <App dept={dept} user={user}>
    <div className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-13">
        <span className="text-18 font-semibold text-fg">{who[0]}</span><span className="text-muted tnum">{who[1]}</span>
        <span className="text-accent sm:border-s sm:border-line sm:ps-3">{where}</span>
        {safety && <span className="flex flex-wrap items-center gap-1 sm:border-s sm:border-line sm:ps-3">{safety}</span>}
        {words && <span className="flex flex-wrap items-center gap-1 sm:border-s sm:border-line sm:ps-3">{words}</span>}
        <span className="ms-auto flex gap-2">{actions ?? <><Button size="sm">Sign<Kbd className="ms-1">⌘↵</Kbd></Button><Button size="sm" variant="outline">Discharge</Button></>}</span>
      </div>
    </div>
    <div className={cn('mx-auto grid w-full gap-3 px-4 py-4', wide ? 'max-w-6xl' : 'max-w-3xl')}>{children}</div>
  </App>
}

/** one bed for a picture: who is in it, the packs' one line, and the packs' buttons (at most two on a tile, whatever the packs) */
export interface Bed { name: string; closed?: boolean; who?: Omit<Occupant, 'onOpen'>; line?: (string | { text: string; tone?: 'ok' | 'info' | 'warn' | 'danger' })[]; buttons?: string[] }
const occupant = (o: Omit<Occupant, 'onOpen'>): Occupant => ({ ...o, onOpen: noop })
const lineOf = (l: Bed['line']): TileSegment[] => l?.length ? [{ pack: 'p', words: l.map((w) => typeof w === 'string' ? { text: w } : w) }] : []
const actionsOf = (b: Bed): TileAction[] => {
  const base: TileAction[] = b.who ? [{ key: 'move', label: 'Move', base: true, off: false }, { key: 'discharge', label: 'Discharge', base: true, off: false }]
    : b.closed ? [] : [{ key: 'admit', label: 'Admit here', base: true, off: false }]
  return [...base, ...(b.who ? b.buttons ?? [] : []).slice(0, 2).map((label): TileAction => ({ key: label, label, base: false, def: { pack: 'p', key: label, label, onClick: noop } }))]
}
/** the base's board, the real tiles: the base's part on top, then the packs' line, then the base's buttons and the packs' */
export function Board({ beds, noBed, noBedTitle = 'Admitted, no bed here' }: { beds: Bed[]; noBed?: Bed[]; noBedTitle?: string }) {
  return <>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{beds.map((b) =>
      <BedTile key={b.name} name={b.name} closed={!!b.closed} who={b.who ? occupant(b.who) : null} line={lineOf(b.line)} actions={actionsOf(b)} onAction={noop} />)}</div>
    {noBed && noBed.length > 0 && <section className="grid gap-2"><p className="text-12 font-medium text-faint">{noBedTitle}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{noBed.map((b) =>
        <BedTile key={b.name + (b.who?.name ?? '')} name={b.name} closed={false} who={b.who ? occupant(b.who) : null} line={lineOf(b.line)} actions={actionsOf(b).filter((a) => !a.base)} onAction={noop} />)}</div></section>}
  </>
}

/** a value in a grid cell: plain, flagged (a glyph with the colour), done, due, late or not given */
export type Cell = ReactNode | { v: ReactNode; f?: 'high' | 'low' | 'critical' } | { done: string } | { due: true } | { late: string } | { not: string }
function cellOf(c: Cell): ReactNode {
  if (c && typeof c === 'object' && !Array.isArray(c) && !('$$typeof' in (c as object))) {
    const o = c as Record<string, unknown>
    if ('done' in o) return <span className="inline-flex items-center gap-0.5 text-ok"><Check className="size-3" /><span className="text-11 text-muted">{o.done as string}</span></span>
    if ('due' in o) return <span className="rounded-sm bg-accent-soft px-1 text-11 font-medium text-accent">due</span>
    if ('late' in o) return <span className="rounded-sm bg-danger-soft px-1 text-11 font-medium text-danger">late {o.late as string}</span>
    if ('not' in o) return <span className="text-11 text-warn">✕ {o.not as string}</span>
    if ('v' in o) { const f = o.f as string | undefined
      return <span className={cn(f === 'critical' ? 'font-semibold text-danger' : f ? 'font-medium text-warn' : 'text-fg')}>{o.v as ReactNode}{f && <span aria-hidden>{f === 'low' ? ' ↓' : f === 'high' ? ' ↑' : ' !!'}</span>}</span> }
  }
  return c as ReactNode
}
export interface GridRow { label: ReactNode; unit?: string; cells: Cell[]; group?: string; total?: ReactNode }
/** a chart by hour (or by dose time): a column per time, a row per thing; the current column marked; a group's heading over its rows */
export function Grid({ times, rows, now, totals, first = '12rem' }: { times: string[]; rows: GridRow[]; now?: number; totals?: string; first?: string }) {
  const heads = rows.map((r, i) => !!r.group && r.group !== rows.slice(0, i).reduce<string | undefined>((g, x) => x.group ?? g, undefined))
  return <Card className="overflow-x-auto"><table className="w-full border-collapse text-12 tnum">
    <thead><tr className="border-b border-line"><th className="sticky start-0 bg-surface px-3 py-1.5 text-start text-11 font-semibold uppercase tracking-[0.06em] text-faint" style={{ width: first }} />
      {times.map((t, i) => <th key={t + i} className={cn('px-2 py-1.5 text-center text-11 font-semibold text-faint', i === now && 'bg-accent-soft text-accent')}>{t}</th>)}
      {totals && <th className="px-3 py-1.5 text-end text-11 font-semibold uppercase tracking-[0.06em] text-faint">{totals}</th>}</tr></thead>
    <tbody>{rows.flatMap((r, ri) => [heads[ri] ? <tr key={`g${ri}`}><td colSpan={times.length + 2} className="border-t border-line bg-sunken px-3 py-1 text-11 font-semibold uppercase tracking-[0.06em] text-faint">{r.group}</td></tr> : null,
        <tr key={ri} className="border-t border-line">
          <td className="sticky start-0 bg-surface px-3 py-1.5 text-13 text-fg">{r.label}{r.unit && <span className="ms-1 whitespace-nowrap text-11 text-faint">{r.unit}</span>}</td>
          {times.map((t, i) => <td key={t + i} className={cn('px-2 py-1.5 text-center', i === now && 'bg-accent-soft/50')}>{r.cells[i] === undefined ? '' : cellOf(r.cells[i])}</td>)}
          {totals && <td className="px-3 py-1.5 text-end font-medium text-fg">{r.total}</td>}
        </tr>])}</tbody>
  </table></Card>
}

/** what a picture asks the owner: a question, the choice drawn, and the other one */
export function Ask({ n, children }: { n: number; children: ReactNode }) {
  return <p className="flex gap-2 rounded-lg border border-dashed border-info-line bg-info-soft px-3 py-2 text-13 text-fg"><b className="shrink-0 font-semibold text-info">Q{n}</b><span>{children}</span></p>
}
