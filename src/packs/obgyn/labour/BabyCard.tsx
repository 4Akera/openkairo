// One baby's part of the birth card (spec/openCare.md §5.6; the picture src/pictures/labour.tsx, "The baby"): sex, weight in grams,
// Apgar at 1 and at 5 minutes — each of the five signs a row of chips in the table's words, then the server's total and band (asked
// as the score card asks, once all five are chosen; the card never adds them up) — breathing at birth, the doses (vitamin K's dose
// follows the weight), and where: the ward's free cots by name, or no cot here. What blocks Sign is said under its field.
import { useEffect, useRef, type ReactNode } from 'react'
import { read } from '@core/db/rpc'
import type { Place } from '@core/db/types'
import { previewer, toneOf, type ScoreResult } from '@core/screens/visit/score'
import { Badge, Button, Chip, NumberInput, errorText } from '@core/ui'
import { APGAR, APGAR_SIGNS, apgarComplete, type ApgarInputs } from './apgar'
import { BREATHING, SEXES, apgarKey, vitaminKOf, type BabyDraft } from './birth'

export type Answer = ScoreResult | { failed: string }
export const Label = ({ children }: { children: ReactNode }) => <p className="text-11 font-semibold uppercase tracking-[0.06em] text-faint">{children}</p>
export const Row = ({ label, children }: { label: string; children: ReactNode }) =>
  <div className="flex flex-wrap items-center gap-1.5 text-13"><span className="w-32 shrink-0 text-muted">{label}</span>{children}</div>
export const Problem = ({ text }: { text?: string }) => text ? <p role="alert" className="text-12 text-warn">{text}</p> : null

/** an Apgar at 1 or 5 minutes: the five signs as chips; once all five are chosen the server is asked (debounced) for the total */
function ApgarBlock({ title, inputs, set, version, answer, onAnswer }: { title: string; inputs: ApgarInputs; set: (i: ApgarInputs) => void; version: string
  answer: Answer | undefined; onAnswer: (key: string, a: Answer) => void }) {
  const live = useRef(onAnswer)
  useEffect(() => { live.current = onAnswer })
  const pv = useRef<{ request: (i: ApgarInputs) => void; cancel: () => void } | null>(null)
  useEffect(() => {
    const p = previewer((i: ApgarInputs) => read<ScoreResult>({ shape: 'score', score: APGAR, version, inputs: i }),
      (i, r) => live.current(apgarKey(version, i), r), (i, e) => live.current(apgarKey(version, i), { failed: errorText(e) || 'The server could not add it up' }))
    pv.current = p; return () => { p.cancel(); pv.current = null }
  }, [version])
  const complete = apgarComplete(inputs); const key = apgarKey(version, inputs)
  useEffect(() => { if (complete && !answer) pv.current?.request(inputs) }, [key, complete, answer, inputs])
  const r = answer && 'score' in answer && answer.complete ? answer : null
  return <div className="grid gap-1">
    <p className="flex flex-wrap items-center gap-2 text-13"><span className="w-32 shrink-0 text-muted">{title}</span>
      {r ? <><span className="font-medium text-fg tnum">Apgar {r.total}</span>{r.band && <Badge tone={toneOf(r.band)}>{r.band.labels.en ?? r.band.key}</Badge>}</>
        : <span className="text-12 text-faint">{complete && !answer ? 'Adding up Apgar…' : 'the five signs; the server adds them up'}</span>}</p>
    {APGAR_SIGNS.map((s) => <div key={s.key} className="flex flex-wrap items-center gap-1.5 ps-4 text-13"><span className="w-28 shrink-0 text-12 text-muted">{s.label}</span>
      {s.words.map((w, v) => { const val = String(v) as '0' | '1' | '2'; const on = inputs[s.key] === val
        return <Chip key={v} on={on} onClick={() => { const n = { ...inputs }; if (on) delete n[s.key]; else n[s.key] = val; set(n) }}>{w}<span className="tnum opacity-70">{v}</span></Chip> })}</div>)}
    {answer && 'failed' in answer && <p role="alert" className="flex flex-wrap items-center gap-2 text-12 text-danger">{answer.failed}
      <Button size="xs" variant="outline" onClick={() => pv.current?.request(inputs)}>Try again</Button></p>}
  </div>
}

export function BabyCard({ b, title, set, onRemove, cots, taken, version, answers, onAnswer, problem }: { b: BabyDraft; title: string; set: (b: BabyDraft) => void
  onRemove?: () => void; cots: readonly Place[]; taken: readonly (string | null)[]; version: string | null; answers: Record<string, Answer>
  onAnswer: (key: string, a: Answer) => void; problem: (field: string) => string | undefined }) {
  const k = vitaminKOf(b.grams)
  const dose = (key: keyof BabyDraft['doses'], label: string) =>
    <Chip variant="check" on={b.doses[key]} onClick={() => set({ ...b, doses: { ...b.doses, [key]: !b.doses[key] } })}>{label}</Chip>
  return <div className="grid gap-2 rounded-lg border border-line bg-sunken p-3">
    <div className="flex items-center gap-2"><Label>{title}</Label>{onRemove && <Button size="xs" variant="ghost" className="ms-auto" onClick={onRemove}>Remove this baby</Button>}</div>
    <Row label="Sex">{SEXES.map(([v, w]) => <Chip key={v} on={b.sex === v} onClick={() => set({ ...b, sex: b.sex === v ? undefined : v })}>{w}</Chip>)}</Row>
    <Problem text={problem('sex')} />
    <Row label="Weight"><NumberInput label="Weight in grams" integer value={b.grams} onValue={(n) => set({ ...b, grams: n ?? undefined })} className="h-8 w-24" />
      <span className="text-muted">g</span></Row>
    <Problem text={problem('grams')} />
    {version ? <>
      <ApgarBlock title="Apgar · 1 minute" inputs={b.apgar1} set={(apgar1) => set({ ...b, apgar1 })} version={version} answer={answers[apgarKey(version, b.apgar1)]} onAnswer={onAnswer} />
      <Problem text={problem('apgar1')} />
      <ApgarBlock title="Apgar · 5 minutes" inputs={b.apgar5} set={(apgar5) => set({ ...b, apgar5 })} version={version} answer={answers[apgarKey(version, b.apgar5)]} onAnswer={onAnswer} />
      <Problem text={problem('apgar5')} />
    </> : <Row label="Apgar"><span className="text-12 text-faint">No Apgar table is declared here</span></Row>}
    <Row label="Breathing">{BREATHING.map(([v, w]) => <Chip key={v} on={b.breathing === v} onClick={() => set({ ...b, breathing: b.breathing === v ? undefined : v })}>{w}</Chip>)}</Row>
    <Row label="Given">{dose('vitamin_k', `Vitamin K ${k.words}`)}{dose('eye', 'Eye ointment')}{dose('hep_b', 'Hepatitis B · first 24 h')}</Row>
    <Row label="Where">{cots.map((c) => <Chip key={c.id} on={b.cot === c.id} disabled={b.cot !== c.id && taken.includes(c.id)} onClick={() => set({ ...b, cot: c.id })}>{c.name}</Chip>)}
      <Chip on={b.cot === null} onClick={() => set({ ...b, cot: null })}>No cot here</Chip></Row>
  </div>
}
