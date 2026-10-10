// The partograph as the WHO's modified one draws it (spec/openCare.md §5.6; Q9, as drawn, awaiting the owner; the picture
// src/pictures/labour.tsx): hours of active labour across with the clock below, the cervix 0–10 cm up the left (× joined by a line),
// the head in fifths above the brim on the right scale (○ joined by a line), the alert line from where active labour began at 1 cm
// an hour, the action line 4 hours to its right. Before active labour, the latent phase in words: the partograph starts at the
// department's setting (4 cm, or 5).
import { Empty } from '@core/ui'
import { hm } from '@core/ui/time'
import type { Partograph as Model } from './partograph'

const HOUR = 3_600_000
const W = 560, H = 300, L = 34, R = 30, B = 22, T = 8
const PAST = { alert: 'right of the alert line', action: 'right of the action line' } as const

/** the partograph; the head's ○ from every exam that palpated it since active labour began (heads), with or without a cervix */
export function Partograph({ p, af, heads }: { p: Model; af: number; heads: readonly { at: string; descent: number }[] }) {
  if (!p.start) return <Empty>{p.latest ? `Latent phase: ${p.latest.cervix} cm at ${hm(p.latest.at)} — the partograph starts at ${af} cm`
    : `No cervix examined yet — the partograph starts at ${af} cm`}</Empty>
  const t0 = Date.parse(p.start.at); const c0 = p.start.cervix
  const drawn = p.points.filter((x) => Date.parse(x.at) >= t0).map((x) => ({ ...x, h: (Date.parse(x.at) - t0) / HOUR }))
  const head = heads.map((d) => ({ ...d, h: (Date.parse(d.at) - t0) / HOUR })).filter((d) => d.h >= 0)
  const span = Math.max(12, Math.ceil(Math.max(drawn[drawn.length - 1]?.h ?? 0, head[head.length - 1]?.h ?? 0) + 1))
  const x = (h: number) => L + h * ((W - L - R) / span)
  const ys = (cm: number) => T + (10 - cm) * ((H - T - B) / 10)
  const words = `Partograph: cervix ${drawn.map((d) => `${d.cervix} cm at ${hm(d.at)}`).join(', ')}${p.past ? `, ${PAST[p.past]}` : ''}`
    + (head.length ? `; head ${head.map((d) => `${d.descent}/5`).join(', ')}` : '')
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={words}>
    {Array.from({ length: 11 }, (_, cm) => <g key={cm}><line x1={L} x2={W - R} y1={ys(cm)} y2={ys(cm)} className="stroke-line" />
      <text x={L - 8} y={ys(cm) + 4} textAnchor="end" className="fill-faint text-11">{cm}</text>
      {cm % 2 === 0 && <text x={W - R + 4} y={ys(cm) + 4} className="fill-faint text-11">{cm / 2}/5</text>}</g>)}
    {Array.from({ length: span + 1 }, (_, h) => <g key={h}><line x1={x(h)} x2={x(h)} y1={T} y2={H - B} className="stroke-line" />
      {h % 2 === 0 && <text x={x(h)} y={H - 6} textAnchor="middle" className="fill-faint text-11">{hm(new Date(t0 + h * HOUR).toISOString())}</text>}</g>)}
    <line x1={x(0)} y1={ys(c0)} x2={x(10 - c0)} y2={ys(10)} className="stroke-warn" strokeWidth={2} />
    <text x={x(10 - c0) + 4} y={ys(10) + 12} className="fill-warn text-11">alert</text>
    <line x1={x(4)} y1={ys(c0)} x2={x(14 - c0)} y2={ys(10)} className="stroke-danger" strokeWidth={2} strokeDasharray="6 4" />
    <text x={x(14 - c0) + 4} y={ys(10) + 12} className="fill-danger text-11">action</text>
    <polyline points={drawn.map((d) => `${x(d.h)},${ys(d.cervix)}`).join(' ')} className="fill-none stroke-accent" strokeWidth={2} />
    {drawn.map((d, i) => <text key={i} x={x(d.h)} y={ys(d.cervix) + 5} textAnchor="middle" className="fill-accent text-14 font-bold">×</text>)}
    <polyline points={head.map((d) => `${x(d.h)},${ys(d.descent * 2)}`).join(' ')} className="fill-none stroke-fg" strokeWidth={1.5} />
    {head.map((d, i) => <circle key={i} cx={x(d.h)} cy={ys(d.descent * 2)} r={4} className="fill-surface stroke-fg" strokeWidth={1.5} />)}
  </svg>
}
