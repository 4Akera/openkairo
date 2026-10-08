// The Growth section (spec/openCare.md §5.7, the picture #paeds-growth): each latest value with its z-score and centile, the WHO curve
// for weight, length, head or weight-for-length with the child's own points, a word when the weight has crossed two centile lines, and
// every measurement. The z-scores and centiles are the server's (paediatrics.growth); the curves are drawn from the loaded WHO tables
// (the demo's: birth to 2 years, a demo sample). Read-only: a measurement opens its entry.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { read } from '@core/db/rpc'
import type { SectionBody } from '@core/screens/chart/sections'
import { Empty, Segmented, cn, shortDate } from '@core/ui'
import { INDICATORS, LINES, ageText, centileText, crossed, crossedText, latestOf, rowsOf, sexWords, valueOf, zOff, zText, type GrowthRow, type Ind } from './growth'

type Lms = [number, number, number]
/** the loaded table for an indicator and sex: by age in months, or length in cm (weight-for-length) */
function useTable(ind: Ind, sex: 'm' | 'f' | null) {
  return useQuery({
    queryKey: ['paediatrics', 'who', ind, sex], enabled: !!sex, staleTime: Infinity,
    queryFn: async () => {
      const r = await read<{ codes: { code: string; props: { L: number; M: number; S: number } }[] }>({ shape: 'codes', system: 'paediatrics.who_growth', q: `${ind}.${sex}.`, limit: 2000 })
      return r.codes.map((c) => ({ x: Number(c.code.split('.').slice(2).join('.')), lms: [c.props.L, c.props.M, c.props.S] as Lms })).sort((a, b) => a.x - b.x)
    },
  })
}
const at = ([L, M, S]: Lms, z: number) => L === 0 ? M * Math.exp(S * z) : M * (1 + L * S * z) ** (1 / L)

function Curve({ ind, sex, rows }: { ind: Ind; sex: 'm' | 'f' | null; rows: GrowthRow[] }) {
  const t = useTable(ind, sex)
  const pts = rows.flatMap((r) => { const v = valueOf(r, ind); const x = ind === 'wfl' ? r.length : r.age_days / 30.4375
    return v !== null && x !== null && (ind !== 'wfl' || r.z.wfl) ? [{ x, v, off: zOff(r.z[ind]?.z) }] : [] })
  if (!sex) return <Empty size="sm">The sex is not recorded: the WHO tables are read by sex</Empty>
  if (t.isLoading) return null
  const table = t.data ?? []
  if (!table.length) return <Empty size="sm">The WHO tables are not loaded here (Settings → Reference lists)</Empty>
  const lastX = table[table.length - 1].x
  const xs = ind === 'wfl' ? [Math.max(table[0].x, Math.floor(Math.min(...pts.map((p) => p.x), 60) - 5)), Math.min(lastX, Math.ceil(Math.max(...pts.map((p) => p.x), 70) + 5))]
    : [0, Math.min(lastX, Math.max(...pts.map((p) => p.x), 0) <= 12 ? 12 : 24)]
  const shown = table.filter((r) => r.x >= xs[0] && r.x <= xs[1])
  const ys = [...shown.map((r) => at(r.lms, -2.5)), ...pts.map((p) => p.v)]; const ye = [...shown.map((r) => at(r.lms, 2.5)), ...pts.map((p) => p.v)]
  const y0 = Math.floor(Math.min(...ys)); const y1 = Math.ceil(Math.max(...ye))
  const W = 440, H = 240, L = 30, R = 38, T = 8, B = 26
  const x = (v: number) => L + (v - xs[0]) * ((W - L - R) / Math.max(1, xs[1] - xs[0])); const y = (v: number) => T + (y1 - v) * ((H - T - B) / Math.max(1, y1 - y0))
  const step = (y1 - y0) > 30 ? 10 : (y1 - y0) > 12 ? 5 : (y1 - y0) > 6 ? 2 : 1
  const yTicks = Array.from({ length: Math.floor((y1 - y0) / step) + 1 }, (_, i) => y0 + i * step)
  const xStep = ind === 'wfl' ? 5 : xs[1] > 12 ? 4 : 2
  const xTicks = Array.from({ length: Math.floor((xs[1] - xs[0]) / xStep) + 1 }, (_, i) => xs[0] + i * xStep)
  const unit = INDICATORS.find((i) => i.key === ind)!.unit
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${INDICATORS.find((i) => i.key === ind)!.label}, ${sex === 'm' ? 'boys' : 'girls'}: the WHO centile lines and ${pts.length} measurements`}>
    {yTicks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-line" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-faint text-11">{v}</text></g>)}
    {xTicks.map((v) => <g key={v}><line x1={x(v)} x2={x(v)} y1={T} y2={H - B} className="stroke-line" />
      <text x={x(v)} y={H - 10} textAnchor="middle" className="fill-faint text-11">{ind === 'wfl' ? `${v}` : v === 0 ? 'birth' : `${v} mo`}</text></g>)}
    {LINES.map(([c, z]) => <g key={c}><polyline points={shown.map((r) => `${x(r.x)},${y(at(r.lms, z))}`).join(' ')} strokeWidth={z === 0 ? 1.75 : 1.25}
      className={cn('fill-none', z === 0 ? 'stroke-ok' : Math.abs(z) > 1.5 ? 'stroke-warn' : 'stroke-line-strong')} />
      <text x={W - R + 4} y={y(at(shown[shown.length - 1].lms, z)) + 4} className="fill-muted text-11">{c}</text></g>)}
    {pts.length > 1 && <polyline points={pts.map((p) => `${x(p.x)},${y(p.v)}`).join(' ')} className="fill-none stroke-accent" strokeWidth={2} />}
    {pts.map((p, i) => <circle key={i} cx={x(p.x)} cy={y(p.v)} r={i === pts.length - 1 ? 4.5 : 3.5} className={cn('stroke-surface', i === pts.length - 1 && p.off ? 'fill-warn' : 'fill-accent')} strokeWidth={1.5} />)}
    <text x={L + 4} y={T + 12} className="fill-faint text-11">{unit}{ind === 'wfl' ? ' · by length, cm' : ''}</text>
  </svg>
}

const Z = ({ z }: { z: number | undefined }) => z === undefined ? <span className="text-faint">—</span>
  : <span className={cn('tnum', zOff(z) && 'font-medium text-warn')}>{zText(z)}{zOff(z) ? (z < 0 ? ' ↓' : ' ↑') : ''}</span>
const th = 'py-1 pe-2 text-start text-11 font-medium uppercase tracking-[0.04em] text-faint'
const td = 'py-1 pe-2 text-13'

export function GrowthBody({ p }: SectionBody) {
  const rows = rowsOf(p.rec.tables as never)
  const [ind, setInd] = useState<Ind>('wfa')
  if (!rows.length) return <Empty size="sm">No weight, length or head measured yet: /v wt … len … hc …</Empty>
  const latest = latestOf(rows); const last = rows[rows.length - 1]
  const sex = last.sex === 'male' ? 'm' : last.sex === 'female' ? 'f' : null
  const x = crossed(rows)
  const valueText = (k: Ind, r: GrowthRow) => k === 'wfl' ? `${r.weight?.toFixed(1)} kg at ${r.length?.toFixed(1)} cm` : `${valueOf(r, k)?.toFixed(1)} ${k === 'wfa' ? 'kg' : 'cm'}`
  const today = new Date().toDateString()
  const outside = [...new Set(rows.flatMap((r) => r.outside))]
  return <div className="grid gap-2">
    <p className="flex flex-wrap items-center gap-x-2 text-12 text-faint"><span>{last.version}{sexWords(last.sex) ? ` · ${sexWords(last.sex)}` : ''}</span>
      {outside.length > 0 && <span>· beyond the loaded tables: {outside.map((k) => INDICATORS.find((i) => i.key === k)?.label.toLowerCase()).join(', ')}</span>}</p>
    <table className="w-full"><thead><tr><th className={th} /><th className={th}>{last && new Date(last.at).toDateString() === today ? 'Today' : 'Latest'}</th><th className={th}>z</th><th className={th}>Centile</th></tr></thead>
      <tbody>{INDICATORS.map(({ key, label }) => { const r = latest[key]; if (!r) return null; const z = r.z[key]
        return <tr key={key} className="border-t border-line"><td className={cn(td, 'text-muted')}>{label}</td><td className={cn(td, 'tnum')}>{valueText(key, r)}</td>
          <td className={td}><Z z={z?.z} /></td><td className={cn(td, 'tnum')}>{z ? centileText(z.c) : <span className="text-faint">{r.outside.includes(key) ? 'beyond the table' : '—'}</span>}</td></tr> })}</tbody></table>
    <div className="flex flex-wrap items-center gap-2 pt-1"><Segmented size="sm" aria-label="Chart" value={ind} onChange={(v) => setInd(v as Ind)}
      options={[['wfa', 'Weight'], ['lfa', 'Length'], ['hcfa', 'Head'], ['wfl', 'Weight-for-length']]} />
      <span className="ms-auto text-11 text-faint">{ind === 'wfl' ? 'by length, 45–110 cm' : 'birth to 2 y'}</span></div>
    <Curve ind={ind} sex={sex} rows={rows} />
    {x && <p className={cn('text-12 font-medium', x.down ? 'text-warn' : 'text-muted')}>{crossedText(x)}</p>}
    <p className="pt-1 text-11 font-medium uppercase tracking-[0.06em] text-faint">Measured</p>
    <table className="w-full"><thead><tr>{['Age', 'kg', 'cm', 'Head', 'Weight z'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
      <tbody>{[...rows].reverse().map((r) => <tr key={r.item} className="border-t border-line">
        <td className={td}><button type="button" onClick={() => r.source_entries.length && p.open(r.source_entries[r.source_entries.length - 1])} className="rounded-sm text-start hover:underline focus-ring">
          {r.age_days < 7 ? 'birth' : ageText(r.age_days)}{new Date(r.at).toDateString() === today ? ' · today' : ''}</button> <span className="text-11 text-faint">{shortDate(r.at)}</span></td>
        <td className={cn(td, 'tnum')}>{r.weight?.toFixed(1) ?? '—'}</td><td className={cn(td, 'tnum')}>{r.length?.toFixed(1) ?? '—'}</td>
        <td className={cn(td, 'tnum')}>{r.head?.toFixed(1) ?? '—'}</td><td className={td}><Z z={r.z.wfa?.z} /></td></tr>)}</tbody></table>
  </div>
}
