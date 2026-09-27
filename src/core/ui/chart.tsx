// Numbers over time, in SVG with the tokens (design-system.md §4.3, the dataviz method). One series, so no legend: the label
// names it. A flag shows in the point's shape as well as its colour (filled normal, hollow abnormal, a larger filled critical
// with ‼ above), every value is reachable without hover (the Table view), and the arrow keys move the crosshair. Stat lives
// here with the Sparkline it draws (display.tsx ← chart.tsx, never both ways).
import { useCallback, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { TONE, cn, flagMark, flagTone, flagWord, trendMark, type Flag } from './tone'
import { hm, shortDate } from './time'
import { AnalyteTable } from './display'
import { Chip } from './controls'

type F = Flag | string | null | undefined
type Band = { low?: number | null; high?: number | null }
const abnormal = (f: F) => f === 'low' || f === 'high' || f === 'abnormal'
const ink = (f: F) => f === 'critical' ? 'var(--danger)' : abnormal(f) ? 'var(--warn)' : 'var(--accent)'
const time = (at: string | number, i: number) => { const v = typeof at === 'number' ? at : Date.parse(at); return isNaN(v) ? i : v }
/** x by time (by order when the times are all one), y over the values and the band */
function scales(points: { at: string | number; value: number }[], band: Band | undefined, x0: number, x1: number, y0: number, y1: number, pad = 0) {
  const ts = points.map((p, i) => time(p.at, i)); const t0 = Math.min(...ts), t1 = Math.max(...ts)
  const vs = [...points.map((p) => p.value), ...[band?.low, band?.high].filter((v): v is number => v != null)]
  let lo = Math.min(...vs), hi = Math.max(...vs); if (hi === lo) { lo -= 1; hi += 1 } const r = (hi - lo) * pad; lo -= r; hi += r
  const x = (i: number) => points.length === 1 ? (x0 + x1) / 2 : t1 > t0 ? x0 + (ts[i] - t0) / (t1 - t0) * (x1 - x0) : x0 + i / (points.length - 1) * (x1 - x0)
  const y = (v: number) => y1 - (v - lo) / (hi - lo) * (y1 - y0)
  return { x, y, lo, hi }
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** a tiny trend beside a value: no axes, no hover (the value next to it carries the number); fewer than 2 points draw nothing */
export function Sparkline({ points, band, width = 64, height = 20, label, className }: { points: { at: string | number; value: number; flag?: F }[]; band?: Band; width?: number; height?: number; label: string; className?: string }) {
  if (points.length < 2) return null
  const { x, y } = scales(points, band, 3, width - 3, 3, height - 3); const last = points.length - 1
  const hasBand = band && (band.low != null || band.high != null)
  const b0 = hasBand ? clamp(y(band.high ?? Infinity), 0, height) : 0, b1 = hasBand ? clamp(y(band.low ?? -Infinity), 0, height) : 0
  return <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label} className={cn('shrink-0 overflow-visible', className)}>
    {hasBand && b1 > b0 && <rect x={0} width={width} y={b0} height={b1 - b0} fill="var(--band)" />}
    <polyline points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    <circle cx={x(last)} cy={y(points[last].value)} r={2.5} fill={ink(points[last].flag)} stroke="var(--surface)" strokeWidth={1.5} />
  </svg>
}

const num = (v: ReactNode) => typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : null
/** one number with its context: the flag as tone and glyph, the value before as a trend (↗ ↘ →, never a flag arrow), a sparkline */
export function Stat({ label, value, unit, flag, previous, trend, band, size = 'md', onClick, title, className }: {
  label: ReactNode; value: ReactNode; unit?: string | null; flag?: F; previous?: { value: ReactNode; at?: string } | null
  trend?: { at: string; value: number; flag?: F }[]; band?: Band; size?: 'sm' | 'md'; onClick?: () => void; title?: string; className?: string
}) {
  const flagged = !!flag && flag !== 'normal'
  const body = <>
    <span className="block text-12 text-muted">{label}</span>
    <span className="flex items-baseline gap-1">
      <span className={cn('font-semibold', size === 'sm' ? 'text-16' : 'text-22', flagged ? TONE[flagTone(flag)].text : 'text-fg')}>{value}{flagged && <span aria-hidden> {flagMark(flag)}</span>}</span>
      {unit && <span className="text-12 text-faint">{unit}</span>}{flagged && <span className="sr-only">{flagWord(flag)}</span>}
      {trend && trend.length > 1 && <Sparkline className="ms-auto self-center" points={trend} band={band} label={`${typeof label === 'string' ? label : 'Trend'} ${trend.map((p) => p.value).join(', ')} ${unit ?? ''}`.trim()} />}
    </span>
    {previous && <span className="block text-12 text-faint tnum">{trendMark(num(value), num(previous.value))} was {previous.value}{previous.at && ` · ${isNaN(Date.parse(previous.at)) ? previous.at : shortDate(previous.at)}`}</span>}
  </>
  return onClick ? <button type="button" title={title} onClick={onClick} className={cn('-m-2 block rounded-lg p-2 text-start hover:bg-hover focus-ring', className)}>{body}</button>
    : <div title={title} className={className}>{body}</div>
}

/** the element's width, kept current (a ref callback with its own cleanup) */
function useWidth() {
  const [w, setW] = useState(0)
  const ref = useCallback((el: HTMLDivElement | null) => { if (!el) return; const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width))); ro.observe(el); return () => ro.disconnect() }, [])
  return [ref, w] as const
}
const nice = (x: number) => { const e = 10 ** Math.floor(Math.log10(x)); const f = x / e; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e }
const fmt = (v: number, step: number) => v.toFixed(Math.max(0, -Math.floor(Math.log10(step))))
const range = (b?: Band) => b?.low != null && b?.high != null ? `${b.low}–${b.high}` : b?.high != null ? `≤ ${b.high}` : b?.low != null ? `≥ ${b.low}` : ''
type Point = { at: string; value: number; flag?: F; entryId?: string; corrected?: boolean }
/** The trend opened from a result: band, critical limits, points shaped by their flag, the last value labelled; hover or the
 *  arrow keys show a point, Enter opens its entry; "Table" shows the same points as rows. */
export function LineChart({ points, unit, band, critical, height = 160, label, onPoint, showTable }: { points: Point[]; unit?: string; band?: Band; critical?: Band; height?: number; label: string; onPoint?: (entryId: string) => void; showTable?: boolean }) {
  const [box, w] = useWidth(); const [at, setAt] = useState<number | null>(null); const [focused, setFocused] = useState(false); const [table, setTable] = useState(!!showTable)
  const L = 32, R = 8, T = 16, B = 20, n = points.length
  const s = scales(points, band, L + 8, Math.max(L + 9, w - R - 8), T, height - B, 0.08)
  const step = nice((s.hi - s.lo) / 3); const ticks: number[] = []; for (let v = Math.ceil(s.lo / step) * step; v <= s.hi + 1e-9; v += step) ticks.push(v)
  const dates = n <= 4 ? points.map((_, i) => i) : [0, Math.round((n - 1) / 3), Math.round(2 * (n - 1) / 3), n - 1]
  const hasBand = band && (band.low != null || band.high != null)
  const b0 = hasBand ? clamp(s.y(band.high ?? Infinity), T, height - B) : 0, b1 = hasBand ? clamp(s.y(band.low ?? -Infinity), T, height - B) : 0
  const said = (p: Point) => `${p.value}${unit ? ` ${unit}` : ''}, ${shortDate(p.at)} ${hm(p.at)}${flagWord(p.flag) ? `, ${flagWord(p.flag)}` : ''}${p.corrected ? ', corrected' : ''}`
  const near = (e: PointerEvent<SVGSVGElement>) => { const px = e.clientX - e.currentTarget.getBoundingClientRect().left; let k = 0; points.forEach((_, i) => { if (Math.abs(s.x(i) - px) < Math.abs(s.x(k) - px)) k = i }); setAt(k) }
  const open = (i: number | null) => { const id = i == null ? undefined : points[i].entryId; if (id && onPoint) onPoint(id) }
  const keys = (e: KeyboardEvent) => {
    const k = e.key === 'ArrowRight' ? (at ?? n - 1) + 1 : e.key === 'ArrowLeft' ? (at ?? n) - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null
    if (k !== null) { e.preventDefault(); setAt(clamp(k, 0, n - 1)) } else if (e.key === 'Enter') open(at); else if (e.key === 'Escape') setAt(null)
  }
  const cur = at == null ? null : points[at]; const last = points[n - 1]
  const bandY = n && Math.abs(s.y(last.value) - 9 - (b0 + 11)) < 14 ? b1 - 4 : b0 + 11   // the band's label moves to its foot when the last value's label would sit on it
  return <figure className="grid min-w-0 gap-2">
    <figcaption className="flex items-center gap-2 text-12 text-muted"><span className="min-w-0 flex-1 truncate">{label}</span><Chip variant="check" on={table} onClick={() => setTable(!table)}>Table</Chip></figcaption>
    {table ? <AnalyteTable dense nameHead="Date" rows={points.map((p) => ({ name: `${shortDate(p.at)} ${hm(p.at)}`, value: p.value, unit, flag: p.flag, low: band?.low, high: band?.high, text: p.corrected ? 'corrected' : null, onOpen: p.entryId && onPoint ? () => onPoint(p.entryId!) : undefined }))} />
      : <div ref={box} className="relative">
        {w > 0 && n > 0 && <svg width={w} height={height} role="img" aria-roledescription="chart" aria-label={`${label}: ${points.map(said).join('; ')}`} tabIndex={0} className="block overflow-visible rounded-md focus-ring"
          onPointerMove={near} onPointerLeave={() => { if (!focused) setAt(null) }} onClick={() => open(at)} onKeyDown={keys} onFocus={() => { setFocused(true); setAt((a) => a ?? n - 1) }} onBlur={() => { setFocused(false); setAt(null) }}>
          {hasBand && b1 > b0 && <><rect x={L} width={w - L - R} y={b0} height={b1 - b0} fill="var(--band)" /><text x={w - R} y={bandY} textAnchor="end" className="fill-muted text-11">normal {range(band)}</text></>}
          {ticks.map((v) => <g key={v}><line x1={L} x2={w - R} y1={s.y(v)} y2={s.y(v)} stroke="var(--line)" /><text x={L - 6} y={s.y(v) + 4} textAnchor="end" className="fill-faint text-11 tnum">{fmt(v, step)}</text></g>)}
          {[critical?.low, critical?.high].map((v, i) => v != null && v >= s.lo && v <= s.hi && <line key={i} x1={L} x2={w - R} y1={s.y(v)} y2={s.y(v)} stroke="var(--danger-line)" />)}
          {dates.map((i, k) => <text key={i} x={s.x(i)} y={height - 4} textAnchor={k === 0 && dates.length > 1 ? 'start' : k === dates.length - 1 && dates.length > 1 ? 'end' : 'middle'} className="fill-faint text-11 tnum">{shortDate(points[i].at)}</text>)}
          {cur && <line x1={s.x(at!)} x2={s.x(at!)} y1={T} y2={height - B} stroke="var(--line-strong)" />}
          {n > 1 && <polyline points={points.map((p, i) => `${s.x(i)},${s.y(p.value)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {points.map((p, i) => { const c = p.flag === 'critical', r = c ? 5 : 4, cx = s.x(i), cy = s.y(p.value)
            return <g key={i}><circle cx={cx} cy={cy} r={r + 2} fill="var(--surface)" />
              {abnormal(p.flag) ? <circle cx={cx} cy={cy} r={r - 1} fill="var(--surface)" stroke="var(--warn)" strokeWidth={2} /> : <circle cx={cx} cy={cy} r={r} fill={ink(p.flag)} />}
              {c && <text x={cx} y={cy - 9} textAnchor="middle" className="fill-danger text-11 font-semibold">‼</text>}</g> })}
          <text x={s.x(n - 1) - (last.flag === 'critical' ? 14 : 9)} y={s.y(last.value) - 9} textAnchor="end" className="fill-fg text-12 font-semibold tnum">{last.value}{unit ? ` ${unit}` : ''}</text>
        </svg>}
        {cur && <div aria-hidden className="pointer-events-none absolute z-popover -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-raised px-2.5 py-1.5 text-12 shadow-md"
          style={{ left: clamp(s.x(at!), 60, Math.max(60, w - 60)), top: s.y(cur.value) - 12 }}>
          <span className="block text-13 font-semibold text-fg tnum">{cur.value}{unit ? ` ${unit}` : ''}{flagMark(cur.flag) && ` ${flagMark(cur.flag)}`}</span>
          <span className="text-faint">{shortDate(cur.at)} {hm(cur.at)}{flagWord(cur.flag) && ` · ${flagWord(cur.flag)}`}{cur.corrected && ' · corrected'}</span>
        </div>}
        <span className="sr-only" aria-live="polite">{focused && cur ? said(cur) : ''}</span>
      </div>}
  </figure>
}
