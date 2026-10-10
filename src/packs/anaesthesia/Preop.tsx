// The pre-op assessment under the line (spec/openCare.md §5.8, Q43; the picture #anaes-preop): /preop in the Pre-op clinic (or on a
// ward, the evening before). What matters from the history, the airway (Mallampati, mouth opening, thyromental, neck), ASA (a class the
// anaesthetist chooses, not a score), RCRI and STOP-BANG as typed on the lines before (/score rcri, /score stopbang: the base's scores,
// the server adds them up), the patient's medicines against the clinic's list of what to stop (shown, never a stop; the anaesthetist
// changes any line), the plan, Fit or Not yet, the anaesthetic's risks told. The patient's sheet in Arabic, from the lines as they stand,
// is shown and printed (Print the patient's sheet, built 2026-10-10: printout.tsx).
import { useEffect } from 'react'
import { useDepartment } from '@core/hooks/organization'
import { useDraftsFor } from '@core/hooks/drafts'
import type { CardEditorProps } from '@core/screens/visit/commands'
import { Chip, Input, Tag, cn } from '@core/ui'
import { ASA, HISTORY, PLANS, RISKS, arabicSheet, stopLines, stopRulesOf, type Plan, type StopLine } from './model'
import { sentences, sheetThing, stopOf } from './printout'
import { PrintSheet } from './PrintSheet'

const Label = ({ children }: { children: React.ReactNode }) => <span className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">{children}</span>
const Box = ({ title, children }: { title: string; children: React.ReactNode }) => <div className="grid gap-1.5 rounded-lg border border-line bg-surface p-2.5"><Label>{title}</Label>{children}</div>
function Pick({ k, children, hint }: { k: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5 text-13"><span className="w-36 shrink-0 text-12 text-faint">{k}</span>{children}{hint && <span className="text-12 text-faint">{hint}</span>}</div>
}

export function PreopCard({ q, set, ctx }: CardEditorProps) {
  const { org } = useDepartment()
  const drafts = useDraftsFor(ctx.record?.patient?.id ?? null)
  const score = (key: string) => drafts.find((d) => d.function === 'score' && String(d.params.score) === key)
  const rcri = score('anaesthesia.rcri'); const sb = score('anaesthesia.stopbang')
  const lines: StopLine[] = stopLines((ctx.record?.medications ?? []) as never, stopRulesOf(org))
  // the medicines against the clinic's list, once for each draft (a new line is a new draft, with no list yet); then they are the
  // anaesthetist's to change
  useEffect(() => { if (q.stop !== undefined || !org) return
    set({ stop: lines.map((l) => ({ medicine: l.medicine, what: l.what, rule: l.rule, ...(l.days != null ? { days: l.days } : {}) })) }) }, [org, lines.length, q.stop === undefined]) // eslint-disable-line react-hooks/exhaustive-deps
  const h = (q.history ?? {}) as Record<string, string>; const a = (q.airway ?? {}) as Record<string, unknown>
  const stop = (q.stop ?? []) as { medicine: string; what: string; rule?: string }[]
  const plan = q.plan as Plan | undefined; const risks = plan ? RISKS[plan] : []
  // the patient's sheet: from the lines as the anaesthetist left them
  const sheet = arabicSheet(stopOf(stop)); const patient = ctx.record?.patient
  const small = 'h-7 text-13'
  const scoreBox = (title: string, d: typeof rcri, hint: string) => { const r = (d?.params.result ?? null) as { total: number | null; band: { labels?: Record<string, string>; tone?: string | null } | null } | null
    return <Box title={title}>{d && r ? <p className="flex items-baseline gap-2"><b className={cn('text-18 font-semibold tnum', r.band?.tone === 'warn' || r.band?.tone === 'danger' ? 'text-warn' : 'text-fg')}>{r.total ?? '…'}</b>
    <span className="text-13 text-fg">{r.band?.labels?.en ?? ''} {d.params.version ? `(${String(d.params.version)})` : ''}</span></p>
    : <p className="text-12 text-muted">Type <span className="font-mono">{hint}</span> on the line: the server adds it up.</p>}</Box> }
  return <div className="grid gap-2 text-13">
    <p className="flex flex-wrap items-center gap-2"><b className="text-14 font-semibold text-fg">Pre-op assessment{q.operation ? ` · ${q.operation}` : ''}</b>{!q.op && <span className="text-warn">no operation on the record yet</span>}</p>
    <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">{HISTORY.map(([k, l]) => <label key={k} className="flex items-center gap-2"><span className="w-24 shrink-0 text-12 text-faint">{l}</span>
      <Input value={h[k] ?? ''} onChange={(e) => set({ history: { ...h, [k]: e.target.value } })} className={small} /></label>)}</div>
    <Pick k="Airway · Mallampati" hint={<span className="flex flex-wrap items-center gap-1">mouth <Input aria-label="Mouth opening" value={String(a.mouth_cm ?? '')} onChange={(e) => set({ airway: { ...a, mouth_cm: Number(e.target.value) || undefined } })} className="h-6 w-12 text-12" /> cm ·
      thyromental <Input aria-label="Thyromental" value={String(a.tm_cm ?? '')} onChange={(e) => set({ airway: { ...a, tm_cm: Number(e.target.value) || undefined } })} className="h-6 w-12 text-12" /> cm ·
      neck <Input aria-label="Neck" value={String(a.neck_cm ?? '')} onChange={(e) => set({ airway: { ...a, neck_cm: Number(e.target.value) || undefined } })} className="h-6 w-12 text-12" /> cm</span>}>
      {['I', 'II', 'III', 'IV'].map((m) => <Chip key={m} on={a.mallampati === m} onClick={() => set({ airway: { ...a, mallampati: m } })}>{m}</Chip>)}</Pick>
    <Pick k="ASA" hint="a class the anaesthetist chooses, not a score">{ASA.map((x) => <Chip key={x} on={q.asa === x} onClick={() => set({ asa: x })}>{x}</Chip>)}
      <Chip on={!!q.emergency} onClick={() => set({ emergency: !q.emergency })}>E</Chip></Pick>
    <div className="grid gap-2 sm:grid-cols-2">{scoreBox('RCRI · /score rcri', rcri, '/score rcri')}{scoreBox('STOP-BANG · /score stopbang', sb, '/score stopbang')}</div>
    <Box title="Medicines before the operation · from the clinic's list">
      {stop.length ? <table className="w-full text-13"><thead><tr className="text-11 uppercase tracking-[0.06em] text-faint">{['Medicine', 'What to do', 'The rule'].map((x) => <th key={x} className="py-1 text-start font-semibold">{x}</th>)}</tr></thead>
        <tbody>{stop.map((s, i) => { const warn = lines.find((l) => l.medicine === s.medicine)?.warn
          return <tr key={i} className="border-t border-line"><td className="py-1 pe-2 text-fg">{s.medicine}</td>
            <td className="py-1 pe-2"><Input value={s.what} onChange={(e) => set({ stop: stop.map((x, j) => j === i ? { ...x, what: e.target.value } : x) })} className={cn('h-7 text-13', warn && 'font-medium text-warn')} /></td>
            <td className="py-1 text-12 text-muted">{s.rule}</td></tr> })}</tbody></table> : <p className="text-muted">No current medicines.</p>}
      <p className="text-12 text-faint">The list is the clinic's (Settings → Packs → Anaesthesia). The dates are written when the case is scheduled. Shown only; the anaesthetist changes any line.</p>
      {stop.length > 0 && <div className="grid gap-0.5"><p className="flex flex-wrap items-center gap-2"><span className="text-12 text-muted">For the patient, in Arabic:</span>
        {patient && <span className="ms-auto"><PrintSheet patientId={patient.id} sheet={{ name: [patient.given_name, patient.middle_name, patient.family_name].filter(Boolean).join(' '), record: patient.record_number,
          operation: q.operation ? String(q.operation) : null, lines: sentences(sheet), plan: plan ?? null, anaesthetist: org?.me.name ?? null, at: new Date().toISOString(),
          thing: sheetThing(patient.record_number, `${String(q.op ?? '')} ${sheet}`) }} /></span>}</p>
        <span dir="rtl" lang="ar" className="text-13 text-fg">{sheet}</span></div>}</Box>
    <Pick k="Plan">{PLANS.map(([k, l]) => <Chip key={k} on={plan === k} onClick={() => set({ plan: k, consent: RISKS[k] })}>{l}</Chip>)}
      <Input aria-label="Plan note" value={String(q.plan_note ?? '')} onChange={(e) => set({ plan_note: e.target.value })} placeholder="heavy bupivacaine 0.5 % 3 mL · LMA if it fails" className={`${small} w-72`} /></Pick>
    <Pick k="Verdict">{([['fit', 'Fit'], ['not_yet', 'Not yet']] as const).map(([k, l]) => <Chip key={k} on={q.verdict === k} onClick={() => set({ verdict: k })}>{l}</Chip>)}
      <Input aria-label="Verdict note" value={String(q.verdict_note ?? '')} onChange={(e) => set({ verdict_note: e.target.value })} placeholder={q.verdict === 'fit' ? 'fit for spinal as a day case' : 'not yet: Hb 9.8, iron first'} className={`${small} w-72`} /></Pick>
    {risks.length > 0 && <Pick k="Anaesthesia consent">{risks.map((r) => { const on = ((q.consent ?? []) as string[]).includes(r)
      return <Chip key={r} variant="check" on={on} onClick={() => set({ consent: on ? (q.consent as string[]).filter((x) => x !== r) : [...((q.consent ?? []) as string[]), r] })}>{r}</Chip> })}</Pick>}
    {q.verdict === 'fit' && <p className="text-12 text-faint">“Fit” fills the operating list's Pre-op column. <Tag>ASA {String(q.asa)}{q.emergency ? ' E' : ''}</Tag></p>}
  </div>
}
