// The score's card under the line (spec/openCare.md §5.1 rule 8; score.ts): each item to fill — a choice as chips with the table's
// points, yes or no, a number with its unit — and, from the server as it fills (debounced), each item's points, the total and its band
// in words. The card never adds anything up; Done writes the server's total. An unsigned score says so and still works.
import { useEffect, useRef } from 'react'
import { read } from '../../db/rpc'
import { useDepartment } from '../../hooks/organization'
import { Badge, Button, Chip, Input } from '../../ui'
import type { CardEditorProps } from './commands'
import { cardState, current, draft, keyOf, offered, previewer, signOffOf, tableOf, type Inputs, type ScoreParams, type ScoreResult } from './score'

export function ScoreCard({ q, set, ctx }: CardEditorProps) {
  const p = q as ScoreParams
  const { org } = useDepartment()
  const live = useRef({ set, p })
  useEffect(() => { live.current = { set, p } })
  const preview = useRef<{ request: (i: ScoreParams) => void; cancel: () => void } | null>(null)
  // the server's answer (or its failure) lands only while the card still holds what it answered; a card opened from a typed line asks at once
  useEffect(() => {
    const pv = previewer((i: ScoreParams) => read<ScoreResult>({ shape: 'score', score: i.score, version: i.version, inputs: i.inputs }),
      (i, r) => { if (keyOf(live.current.p) === keyOf(i)) live.current.set({ result: { ...r, for: keyOf(i) }, failed: null }) },
      (i, e) => { if (keyOf(live.current.p) === keyOf(i)) live.current.set({ failed: { for: keyOf(i), message: e instanceof Error ? e.message : 'The server could not add it up' } }) })
    preview.current = pv
    const now = live.current.p; if (now.score && !current(now) && Object.keys(now.inputs).length) pv.request(now)
    return () => { pv.cancel(); preview.current = null }
  }, [])

  const t = tableOf(ctx.scores, p.score, p.version)
  if (!t) return <div className="flex flex-wrap items-center gap-1.5"><span className="text-12 text-faint">Which score?</span>
    {offered(ctx.scores, ctx.packs).map((x) => <Chip data-chip key={x.key} onClick={() => set(draft(x).params)}>{x.short}</Chip>)}</div>
  const put = (k: string, v: string | boolean | null) => {
    const inputs: Inputs = { ...p.inputs }; if (v === null || v === '') delete inputs[k]; else inputs[k] = v
    set({ inputs }); if (Object.keys(inputs).length) preview.current?.request({ ...p, inputs }); else preview.current?.cancel()
  }
  const st = cardState(t, p); const signed = org ? signOffOf(org.settings, t.key, t.version) : undefined
  return <div className="grid gap-1.5">
    {st.items.map((i) => <div key={i.key} className="flex flex-wrap items-center gap-1.5">
      <span className="w-36 shrink-0 text-12 text-muted">{i.label}</span>
      {i.input === 'number' ? <><Input aria-label={i.label} inputMode="decimal" value={typeof i.value === 'string' ? i.value : ''} onChange={(e) => put(i.key, e.target.value.trim() || null)}
          className="h-7 w-24 text-end text-13 tnum" />{i.unit && <span className="text-11 text-faint">{i.unit}</span>}</>
        : i.options.map((o) => { const on = i.input === 'yes_no' ? i.value === (o.value === 'yes') : i.value === o.value
          return <Chip data-chip key={o.value} on={on} onClick={() => put(i.key, on ? null : i.input === 'yes_no' ? o.value === 'yes' : o.value)}>{o.label}<span className="tnum opacity-70">{o.points}</span></Chip> })}
      <span className="ms-auto w-10 text-end text-13 font-medium tnum" title="points">{i.points ?? (i.value !== null && st.waiting ? '…' : '—')}</span>
      {i.problem && <span role="alert" className="w-full ps-36 text-11 text-danger">{i.problem}</span>}
    </div>)}
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-1.5 text-13">
      <span className="font-medium text-fg tnum">{t.short} {st.total ?? (st.waiting ? '…' : '—')}</span>
      {st.band && <Badge tone={st.band.tone}>{st.band.words}</Badge>}
      {!st.complete && st.soFar != null && <span className="text-11 text-faint tnum">so far {st.soFar}</span>}
      <span className="ms-auto text-11 text-faint">{t.labels.en ?? t.short}, {t.version}{signed ? '' : ' · not signed off for this clinic'}</span>
    </div>
    {st.failed && <div role="alert" className="flex flex-wrap items-center gap-2 text-12 text-danger">{st.failed}
      <Button size="sm" variant="outline" onClick={() => { set({ failed: null }); preview.current?.request(p) }}>Try again</Button></div>}
  </div>
}
