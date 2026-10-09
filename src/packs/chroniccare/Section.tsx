// The Chronic care section (spec/openCare.md §5.1 rule 2; picture #chronic-visit): each condition from the problem list, with its code
// and since when; its measures against the target (the patient's own marked so) with the last few values as a line; its checks — last
// done, what was found, how long ago — due or done. A check two conditions share is counted once, under the first.
import type { SectionBody } from '@core/screens/chart/sections'
import { Empty, Tag, cn, shortDate } from '@core/ui'
import { targetWords, valueWords, type Measure } from './model'
import { stateOf } from './words'

/** the last few values as a small line, the last one marked */
function Trend({ m }: { m: Measure }) {
  if (m.trend.length < 2) return <span />
  const lo = Math.min(...m.trend); const hi = Math.max(...m.trend); const w = 48; const h = 14
  const pts = m.trend.map((v, i) => [i * (w / (m.trend.length - 1)), hi === lo ? h / 2 : h - ((v - lo) / (hi - lo)) * h])
  return <svg aria-hidden width={w} height={h + 2} className={cn('shrink-0', m.off ? 'text-warn' : 'text-ok')}><polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r="2" fill="currentColor" /></svg>
}

export function ChronicSection({ p, own }: SectionBody) {
  const st = stateOf({ rec: p.rec, ctx: p.ctx, facts: p.facts, own })
  if (!st.length) return <Empty size="sm">No condition of the clinic&apos;s list on the problem list</Empty>
  return <div className="grid gap-3 text-13">
    <p className="text-end text-12 text-faint">from the problem list</p>
    {st.map((s) => <div key={s.condition.key} className="grid gap-1">
      <p className="flex items-baseline gap-2"><b className="font-semibold text-fg">{s.problem.name ?? s.condition.name}</b><span className="font-mono text-12 text-faint">{s.problem.code?.replace(/^icd10:/, '')}</span>
        {s.problem.onset && <span className="ms-auto text-12 text-faint">since {s.problem.onset.slice(0, 4)}</span>}</p>
      {s.measures.map((m) => <div key={m.key} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2">
        <span className="text-muted">{m.name}</span>
        <span className={cn(m.off && 'font-medium text-warn')}>{valueWords(m)}{m.off && (m.up ? ' ↑' : m.up === false ? ' ↓' : '')}
          {m.target && <span className="font-normal text-12 text-faint"> · {m.target.own ? 'own target' : 'target'} {targetWords(m.target)}{m.target.own?.reason ? ` (${m.target.own.reason})` : ''}</span>}
          {m.at && <span className="font-normal text-12 text-faint"> · {shortDate(m.at)}</span>}</span><Trend m={m} /></div>)}
      {s.checks.map((c) => <div key={c.check.name} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2">
        <span className="text-muted">{c.check.name}</span>
        <span className="text-fg">{c.last ? `${shortDate(c.last)}${c.text ? ` · ${c.text}` : ''} · ${c.months} months` : 'never'}</span>
        {c.due ? <Tag tone="warn">due</Tag> : <span className="text-12 text-ok">✓ done</span>}</div>)}
    </div>)}
  </div>
}
