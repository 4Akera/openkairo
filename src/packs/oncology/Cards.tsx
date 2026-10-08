// Oncology's cards under the line (spec/openCare.md §5.7; the pictures #onc-plan, #onc-cycle). The cycle's card says what /chemo worked
// out — BSA, each dose and its rounding, the regimen's checks (shown, never a stop), the toxicity since the last cycle, Give · Delay ·
// Reduce, what is given before, where it goes — and each chip rewrites the line, so the line and the drafts always agree. The cancer's
// card fills a new cancer field by field; on a cancer already on record the line adds today's ECOG (the note under the card).
import type { ReactNode } from 'react'
import { compose } from '@core/hooks/composer'
import type { CardEditorProps } from '@core/screens/visit/commands'
import type { Ctx, Parsed } from '@core/screens/visit/parse'
import { Chip, Input, Tag, cn } from '@core/ui'
import { TOXICITIES, anthracycline, cancersOf, cyclesOf, mg, type CancerWords, type CycleWords } from './model'
import { chemoLine, toxAsked, type ChemoSaid } from './line'
import { seenEntries, seenRegimens } from './seen'

const foot = 'text-12 text-faint'
const Label = ({ children, className }: { children: ReactNode; className?: string }) => <span className={cn('text-11 font-semibold uppercase tracking-[0.06em] text-faint', className)}>{children}</span>
const Box = ({ children }: { children: ReactNode }) => <div className="grid gap-1.5 rounded-lg border border-line bg-surface p-2.5 text-13">{children}</div>
function Pick({ k, children, hint }: { k: string; children: ReactNode; hint?: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5 text-13"><Label className="w-28 shrink-0">{k}</Label>{children}{hint && <span className="text-12 text-faint">{hint}</span>}</div>
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const ago = (at: string, now = Date.now()) => Math.max(0, Math.round((now - Date.parse(at)) / 86_400_000))
const day = (at: string) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** what the line said, read back from the cycle's words (the chips rewrite the line from it) */
export function saidOf(w: CycleWords): ChemoSaid {
  return { regimen: w.regimen, cycle: w.cycle, day: w.day, decision: w.decision, delay: w.delay_days ?? 7, reduce: 100 - (w.percent ?? 100),
    tox: Object.fromEntries((w.toxicity ?? []).map((t) => [TOXICITIES.find((x) => x.term === t.term)?.key ?? t.term, t.grade])), peg: !!w.added?.length }
}

export function CycleCard({ q, ctx }: CardEditorProps) {
  const w = q.oncology as CycleWords; const said = saidOf(w)
  const go = (c: Partial<ChemoSaid>) => compose({ text: chemoLine(said, c) })
  const reg = seenRegimens().regimens.find((r) => r.key === w.regimen)
  const pid = ctx.record?.patient?.id
  const cycles = cyclesOf(seenEntries(pid)); const before = [...cycles].reverse().find((c) => c.status !== 'revoked' && c.words.decision !== 'delay')
  const fnBefore = (before?.words.toxicity ?? []).some((t) => /febrile neutropenia/i.test(t.term) && t.grade >= 3) || (w.toxicity ?? []).some((t) => /febrile neutropenia/i.test(t.term) && t.grade >= 3)
  const anth = anthracycline(cycles); const anthToday = (w.doses ?? []).filter((d) => /doxorubicin|epirubicin/i.test(d.drug) && d.basis === 'm2').reduce((s, d) => s + (d.per ?? 0) * (w.percent ?? 100) / 100, 0)
  const unit = ctx.departments.find((d) => d.id === q.department_id)?.name ?? 'the day unit'
  const delayed = w.decision === 'delay'
  return <div className="grid gap-2">
    <p className="flex flex-wrap items-baseline gap-x-2 text-13"><b className="text-14 font-semibold text-fg">{w.name ?? w.regimen} · cycle {w.cycle}{w.of ? ` of ${w.of}` : ''} · day {w.day}</b>
      <span className="text-muted">{reg?.every_days ? `every ${reg.every_days} days` : ''}{before ? ` · ${before.words.name ?? before.words.regimen} ${before.words.cycle} on ${day(before.due)}, ${ago(before.due)} days ago` : ''} · from the clinic's list</span></p>
    {w.bsa ? <p className="flex flex-wrap items-baseline gap-x-3 text-13"><span className="text-muted">{w.height} cm · {w.weight} kg today</span>
      <span className="text-fg">BSA <b className="text-16 font-semibold tnum">{w.bsa} m²</b></span><span className={foot}>Mosteller: √({w.height} × {w.weight} ÷ 3600)</span></p>
      : <p className="text-13 font-medium text-warn">No height and weight today: type /v h 158 w 72 first, then the doses are worked out.</p>}
    {(w.doses?.length ?? 0) > 0 && <table className="w-full text-13"><thead><tr className="text-start text-11 uppercase tracking-[0.06em] text-faint">
      {['Drug', 'Per', w.bsa ? `× ${w.bsa}` : 'Worked', 'Dose', 'How'].map((h) => <th key={h} className="px-1 py-1 text-start font-semibold">{h}</th>)}</tr></thead>
      <tbody>{w.doses!.map((d, i) => <tr key={i} className="border-t border-line align-top"><td className="px-1 py-1 text-fg">{d.drug}</td>
        <td className="px-1 py-1 tnum text-muted">{d.basis === 'auc' ? `AUC ${d.per}` : d.basis === 'kg' ? `${d.per} mg/kg` : d.basis === 'flat' ? 'flat' : `${d.per} mg`}</td>
        <td className="px-1 py-1 tnum text-muted">{d.worked != null ? mg(d.worked) : ''}</td><td className="px-1 py-1 tnum"><b className="font-semibold text-fg">{mg(d.dose)} mg</b></td>
        <td className="px-1 py-1 text-muted">{d.how}</td></tr>)}</tbody></table>}
    {(w.doses?.length ?? 0) > 0 && <p className="text-12 text-muted">Rounded as the regimen says{reg?.drugs?.length ? ` (${reg.drugs.map((d) => `${d.drug.toLowerCase()} to ${d.round ?? 1} mg`).join(', ')})` : ''}
      {anthToday > 0 ? ` · doxorubicin so far ${anth} mg/m², ${anth + anthToday} after today` : ''}</p>}
    <Box><Label>Before the cycle · the regimen's checks</Label>
      {(w.checks?.length ?? 0) > 0 ? <p className="flex flex-wrap gap-1.5">{w.checks!.map((c) => <Tag key={c.text} tone={c.ok === true ? 'ok' : 'warn'}>{c.text}</Tag>)}</p>
        : <p className="text-muted">The regimen names no checks.</p>}
      <p className={foot}>Shown, never a stop: a number past its limit turns amber; the oncologist decides.</p></Box>
    <Box><Label>Since the last cycle · CTCAE v5 grades</Label>
      {toxAsked(said).map((t) => <div key={t.key} className="flex flex-wrap items-center gap-1.5"><span className="w-48 shrink-0 text-fg">{t.term}</span>
        {t.grades.map((g) => <Chip key={g} on={said.tox[t.key] === g} onClick={() => go({ tox: { [t.key]: g } })}>{g === 0 && t.key === 'fn' ? 'none' : String(g)}</Chip>)}</div>)}</Box>
    <Pick k="Decision" hint={said.decision === 'reduce' ? 'of every dose' : 'Reduce opens 10 · 20 · 25 %'}>
      <Chip on={said.decision === 'give'} onClick={() => go({ decision: 'give' })}>Give</Chip>
      <Chip on={delayed} onClick={() => go({ decision: 'delay', delay: 7 })}>Delay a week</Chip>
      <Chip on={said.decision === 'reduce'} onClick={() => go({ decision: 'reduce', reduce: said.reduce || 20 })}>Reduce by…</Chip>
      {said.decision === 'reduce' && [10, 20, 25].map((n) => <Chip key={n} on={said.reduce === n} onClick={() => go({ decision: 'reduce', reduce: n })}>{n} %</Chip>)}</Pick>
    {(fnBefore || said.peg) && !delayed && <p className="flex flex-wrap items-center gap-2 text-13">{said.peg ? <Tag tone="info">added this cycle</Tag> : <Tag tone="warn">febrile neutropenia after the last cycle</Tag>}
      <Chip on={said.peg} onClick={() => go({ peg: !said.peg })}>Pegfilgrastim 6 mg SC</Chip><span className="text-muted">24–72 h after</span></p>}
    {(w.premeds?.length ?? 0) > 0 && <p className="text-13 text-muted">Before it, the regimen's: {w.premeds!.join(' · ')}</p>}
    <p className="flex flex-wrap items-center gap-2 text-13"><Label>Goes to</Label>{delayed
      ? <span className="text-fg">{unit} · in {w.delay_days} days; no medicine is sent today</span>
      : <span className="text-fg">{ctx.send ? <><b className="font-medium">{cap(ctx.send.chip.replace(/^Send to /i, ''))}</b> prepares it (its list, to prepare) → </> : ''}<b className="font-medium">{unit}</b> gives it today</span>}</p>
  </div>
}
export const cycleCardLine = (p: Record<string, unknown>) => {
  const w = p.oncology as CycleWords
  return `${w.name ?? w.regimen} · cycle ${w.cycle} day ${w.day}${w.bsa ? ` · BSA ${w.bsa}` : ''} · ${w.percent ?? 100} % · ${w.decision}`
}

// ── the cancer ──
const STAGES = ['0', 'IA', 'IB', 'IIA', 'IIB', 'IIIA', 'IIIB', 'IIIC', 'IV']
const PLAN_STEPS: [string, string][] = [['operation', 'Operation'], ['chemotherapy', 'Chemotherapy'], ['radiotherapy', 'Radiotherapy'], ['endocrine', 'Endocrine'], ['targeted', 'Targeted'], ['immunotherapy', 'Immunotherapy']]
const MARKERS = ['ER', 'PR', 'HER2', 'Ki-67']
/** a new cancer, field by field: what and where, the morphology, grade, TNM with its edition, the stage group, markers, intent, plan, the regimen */
export function CancerCard({ q, set }: CardEditorProps) {
  const w = (q.oncology ?? {}) as CancerWords
  const put = (patch: Partial<CancerWords>) => set({ oncology: Object.fromEntries(Object.entries({ ...w, ...patch }).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))) })
  const plans = seenRegimens().plans.filter((p) => !w.site || !p.site || p.site.toLowerCase() === w.site.toLowerCase())
  const code = (q.concept?.codings?.[0]?.code as string | undefined) ?? ''
  const marker = (k: string) => w.markers?.find((m) => m.name === k)?.value ?? ''
  const small = 'h-7 text-13'
  return <div className="grid gap-1.5">
    <Pick k="Diagnosis"><Input aria-label="Diagnosis" value={q.concept?.text ?? ''} onChange={(e) => set({ concept: { text: e.target.value, codings: q.concept?.codings ?? [] } })} placeholder="Breast cancer, left, upper outer" className={cn(small, 'w-64')} />
      <Input aria-label="ICD-10" value={code} onChange={(e) => set({ concept: { text: q.concept?.text ?? '', codings: e.target.value ? [{ system: 'icd10', code: e.target.value.toUpperCase(), display: q.concept?.text ?? '' }] : [] } })} placeholder="C50.4" className={cn(small, 'w-20 font-mono')} /></Pick>
    <Pick k="Site"><Input aria-label="Site" value={w.site ?? ''} onChange={(e) => put({ site: e.target.value.toLowerCase() })} placeholder="breast" className={cn(small, 'w-32')} />
      {(['left', 'right', 'both'] as const).map((s) => <Chip key={s} on={w.side === s} onClick={() => { put({ side: w.side === s ? undefined : s }); set({ laterality: w.side === s ? undefined : s }) }}>{s}</Chip>)}</Pick>
    <Pick k="Morphology"><Input aria-label="Morphology" value={w.morphology?.text ?? ''} onChange={(e) => put({ morphology: { text: e.target.value, codings: w.morphology?.codings ?? [] } })} placeholder="Invasive carcinoma NST" className={cn(small, 'w-56')} />
      <Input aria-label="ICD-O-3" value={w.morphology?.codings?.[0]?.code ?? ''} onChange={(e) => put({ morphology: { text: w.morphology?.text ?? '', codings: e.target.value ? [{ system: 'oncology.icdo3', code: e.target.value }] : [] } })} placeholder="8500/3" className={cn(small, 'w-20 font-mono')} />
      <Label>Grade</Label>{['1', '2', '3', 'X'].map((g) => <Chip key={g} on={w.grade === g} onClick={() => put({ grade: w.grade === g ? undefined : g })}>{g}</Chip>)}</Pick>
    <Pick k="TNM">{(['t', 'n', 'm'] as const).map((k) => <Input key={k} aria-label={k.toUpperCase()} value={w.tnm?.[k] ?? ''} onChange={(e) => put({ tnm: { ...w.tnm, [k]: e.target.value } })} placeholder={k === 't' ? 'pT2' : k === 'n' ? 'pN1a' : 'M0'} className={cn(small, 'w-24')} />)}
      <Input aria-label="Edition" value={w.tnm?.edition ?? 'AJCC 8th'} onChange={(e) => put({ tnm: { ...w.tnm, edition: e.target.value } })} className={cn(small, 'w-24')} /></Pick>
    <Pick k="Stage" hint="the oncologist's choice, the TNM beside it">{STAGES.map((s) => <Chip key={s} on={w.stage === s} onClick={() => put({ stage: w.stage === s ? undefined : s })}>{s}</Chip>)}</Pick>
    <Pick k="Markers">{MARKERS.map((m) => <label key={m} className="flex items-center gap-1 text-12 text-muted">{m}<Input aria-label={m} value={marker(m)} className={cn(small, 'w-20')}
      onChange={(e) => put({ markers: [...(w.markers ?? []).filter((x) => x.name !== m), ...(e.target.value ? [{ name: m, value: e.target.value }] : [])] })} /></label>)}</Pick>
    <Pick k="Intent">{(['curative', 'palliative'] as const).map((s) => <Chip key={s} on={w.intent === s} onClick={() => put({ intent: s })}>{s === 'curative' ? 'Curative' : 'Palliative'}</Chip>)}</Pick>
    <Pick k="The plan" hint="click: to come → now → done">{PLAN_STEPS.map(([k, l]) => { const st = w.plan?.find((p) => p.step === k)?.status
      const next = st === undefined ? 'todo' : st === 'todo' ? 'now' : st === 'now' ? 'done' : undefined
      return <Chip key={k} on={!!st} onClick={() => put({ plan: [...(w.plan ?? []).filter((p) => p.step !== k), ...(next ? [{ step: k, status: next }] : [])] as CancerWords['plan'] })}>{l}{st === 'done' ? ' ✓' : st === 'now' ? ' · now' : ''}</Chip> })}</Pick>
    <Pick k="Regimen" hint="the clinic's list">{plans.map((p) => <Chip key={p.name} on={w.regimen === p.name} onClick={() => put({ regimen: w.regimen === p.name ? undefined : p.name })}>{p.name}</Chip>)}</Pick>
  </div>
}
export const cancerCardLine = (p: Record<string, unknown>) => { const w = (p.oncology ?? {}) as CancerWords; const c = p.concept as { text?: string } | undefined
  return ['Cancer', c?.text, w.stage, w.intent].filter(Boolean).join(' · ') }

/** under the line: the cancer on record, today only ECOG changing (its chips rewrite the line) */
export function CancerNote({ items, ctx }: { items: Parsed[]; ctx: Ctx }) {
  const pid = ctx.record?.patient?.id; const on = cancersOf(seenEntries(pid)).find((c) => c.active)
  const ecog = items.find((p) => p.function === 'observation'); const n = ecog ? Number((ecog.params.value as { quantity: { value: string } }).quantity.value) : null
  const chips = <span className="flex flex-wrap items-center gap-1.5"><Label className="w-28">ECOG</Label>{[0, 1, 2, 3, 4].map((g) => <Chip key={g} on={n === g} onClick={() => compose({ text: `/cancer ecog ${g} ` })}>{g}</Chip>)}</span>
  if (!on) return <span className="grid gap-1">{chips}</span>
  const w = on.words; const now = w.plan?.find((p) => p.status === 'now')
  return <span className="grid gap-1.5">
    <span className="text-13"><b className="font-semibold text-fg">The cancer · {on.name}</b> <span className="text-muted">the card that wrote the section on {day(on.entry.occurred_at)}; today only ECOG changes</span></span>
    {chips}
    <span className="flex flex-wrap items-center gap-1.5"><Label className="w-28">Intent</Label><Tag>{w.intent ?? '—'}</Tag><Label className="ms-2">Stage</Label><Tag>{w.stage ?? '—'}</Tag>
      <span className="text-faint">{[w.tnm?.t, w.tnm?.n, w.tnm?.m].filter(Boolean).join(' ')}</span></span>
    <span className="flex flex-wrap items-center gap-1.5"><Label className="w-28">Plan now</Label><Tag>{now ? PLAN_STEPS.find(([k]) => k === now.step)?.[1] ?? now.step : '—'}</Tag>
      <Label className="ms-2">Regimen</Label><Tag>{w.regimen ?? '—'}</Tag><span className="text-faint">the TNM, markers, plan and regimen are changed by correcting the cancer's entry</span></span>
  </span>
}
