// Going home's card under the composer's line and its draft's block (spec/openCare.md §5.6, W3b): where to, the diagnoses, what was done,
// each medicine to continue, stop or change and new ones as /rx reads them (the catalog's allergy and duplicate words beside a new one,
// facts, never a stop), the follow-up and the words for the patient (the ward's Arabic phrases as chips, the box right-to-left). Sign
// writes it as one set (homesave.ts). Kit parts only; inputs inside the card.
import { useEffect, useState, type KeyboardEvent } from 'react'
import { TriangleAlert, X } from 'lucide-react'
import { useDepartment } from '@core/hooks/organization'
import type { BlockProps } from '@core/renderers'
import { drugWarnings } from '@core/screens/visit/catalog'
import type { CardEditorProps } from '@core/screens/visit/commands'
import { sendTarget } from '@core/screens/visit/send'
import { Chip, Field, FormRow, Input, Tag, Textarea } from '@core/ui'
import { addMed, addWords, changeOf, daysLeft, homeLine, phrasesIn, toDecide, TO, type HomeMed, type HomeNew, type HomeParams, type Keep } from './home'

const KEEP: [Keep, string][] = [['continue', 'Continue'], ['stop', 'Stop'], ['change', 'Change']]
/** a medicine's state in words, each with its colour (the words always say it) */
const tagOf = (m: HomeMed) => m.keep === 'continue' ? <Tag>continue</Tag> : m.keep === 'stop' ? <Tag tone="danger">stop</Tag>
  : m.keep === 'change' && m.change ? <Tag tone="warn">changed</Tag> : <Tag tone="warn">decide</Tag>
/** a ward course's days still to take (what Continue signs again) */
const Left = ({ n }: { n: number | null }) => n == null ? null : <span className="text-12 text-muted">{n} day{n === 1 ? '' : 's'} left</span>
/** Enter on a field the card handles itself, when it has words: not the composer's Enter */
const onEnter = (text: string, go: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && text.trim()) { e.preventDefault(); e.stopPropagation(); go() } }

export function HomeCard({ q, set, ctx }: CardEditorProps) {
  const p = q as Partial<HomeParams>; const meds = p.meds ?? []; const added = p.added ?? []
  const { org } = useDepartment()
  // where /rx sends from this ward, resolved once into the draft (plain JSON): the save has no directory of its own
  useEffect(() => { if (p.send_to === undefined && org) set({ send_to: sendTarget(org, ctx.departmentId)?.service ?? null }) }, [org, p.send_to, ctx.departmentId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [dose, setDose] = useState<Record<string, string>>({}); const [err, setErr] = useState<Record<string, string>>({})
  const [text, setText] = useState(''); const [addErr, setAddErr] = useState(''); const [now] = useState(() => Date.now())
  const putMed = (id: string, patch: Partial<HomeMed>) => set({ meds: meds.map((m) => m.id === id ? { ...m, ...patch } : m) })
  const change = (m: HomeMed) => { const r = changeOf(m, dose[m.id] ?? '', ctx)
    if ('error' in r) setErr({ ...err, [m.id]: r.error }); else { setErr({ ...err, [m.id]: '' }); set({ meds: meds.map((x) => x.id === m.id ? r : x) }) } }
  const add = () => { const r = addMed(text, ctx); if ('error' in r) { setAddErr(r.error); return } setAddErr(''); setText(''); set({ added: [...added, r.ok] }) }
  const drop = (a: HomeNew) => set({ added: added.filter((x) => x !== a) })
  const phrases = phrasesIn(ctx.org, ctx.departmentId); const decide = toDecide(p)
  return <div className="grid gap-3 p-3">
    <FormRow label="To" inline><div className="flex flex-wrap gap-1.5">{TO.map(([k, l]) => <Chip key={k} on={(p.to ?? 'home') === k} onClick={() => set({ to: k })}>{l}</Chip>)}</div></FormRow>
    <Field label="Diagnoses this stay"><Input value={p.diagnoses ?? ''} onChange={(e) => set({ diagnoses: e.target.value })} /></Field>
    <Field label="What was done"><Textarea autoGrow minRows={2} value={p.done ?? ''} onChange={(e) => set({ done: e.target.value })} /></Field>
    <div className="grid gap-1.5">
      <p className="text-12 font-medium text-muted">Medicines for home{decide > 0 && <span className="ms-2 text-warn">{decide} to decide</span>}</p>
      {meds.length === 0 && added.length === 0 && <p className="text-13 text-faint">No medicines on the list.</p>}
      {meds.map((m) => <div key={m.id} className="grid gap-1 rounded-lg px-2 py-1.5 ring-1 ring-line">
        <div className="flex flex-wrap items-center gap-2 text-13">{tagOf(m)}{m.reported && <span className="text-12 text-faint">reported</span>}
          <span className="font-medium text-fg">{m.name}</span><span className="text-muted">{m.how}</span><Left n={daysLeft(m, now)} />
          <span className="ms-auto flex gap-1">{KEEP.map(([k, l]) => <Chip key={k} on={m.keep === k} onClick={() => putMed(m.id, { keep: k })}>{l}</Chip>)}</span></div>
        {m.keep === 'stop' && <Input dense value={m.reason ?? ''} placeholder="Why (optional)" aria-label={`Why stop ${m.name}`} onChange={(e) => putMed(m.id, { reason: e.target.value })} />}
        {m.keep === 'change' && <>
          <Input dense value={dose[m.id] ?? ''} placeholder="The new dose, as /rx reads it: 20 mg od 3d" aria-label={`The new dose of ${m.name}`}
            onChange={(e) => { setDose({ ...dose, [m.id]: e.target.value }); if (m.change) putMed(m.id, { change: undefined, change_line: undefined }) }} onKeyDown={onEnter(dose[m.id] ?? '', () => change(m))} />
          {err[m.id] && <p className="text-12 text-danger">{err[m.id]}</p>}
          {m.change_line && <p className="text-12 text-muted">→ {m.change_line}</p>}</>}
      </div>)}
      {added.map((a, i) => <div key={i} className="grid gap-0.5 rounded-lg px-2 py-1.5 ring-1 ring-line">
        <div className="flex items-center gap-2 text-13"><Tag tone="ok">new</Tag><span className="text-fg">{a.line}</span>
          <button type="button" aria-label={`Take out ${a.line}`} onClick={() => drop(a)} className="ms-auto rounded-sm text-faint hover:text-fg focus-ring"><X aria-hidden className="size-3.5" /></button></div>
        {drugWarnings(String((a.params.drug as { name?: string } | undefined)?.name ?? ''), ctx.record?.allergies ?? [], ctx.record?.medications ?? [], null).map((w, k) =>
          <p key={k} className="flex items-start gap-1 text-12 text-warn"><TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />{w.text}</p>)}
      </div>)}
      <Input dense value={text} placeholder="New medicine, as /rx reads it: amoxicillin clavulanate 1g bd 5d" aria-label="New medicine"
        onChange={(e) => setText(e.target.value)} onKeyDown={onEnter(text, add)} />
      {addErr && <p className="text-12 text-danger">{addErr}</p>}
    </div>
    <Field label="Follow-up"><Input value={p.follow ?? ''} onChange={(e) => set({ follow: e.target.value })} /></Field>
    <div className="grid gap-1.5">
      <p className="text-12 font-medium text-muted">For the patient (Arabic)</p>
      {phrases.length > 0 && <div className="flex flex-wrap gap-1.5">{phrases.map((x) => <Chip key={x.label} onClick={() => set({ words: addWords(p.words ?? '', x.ar) })}>{x.label}</Chip>)}</div>}
      <Textarea dir="rtl" lang="ar" autoGrow minRows={2} value={p.words ?? ''} aria-label="For the patient, in Arabic" onChange={(e) => set({ words: e.target.value })} />
    </div>
    <p className="text-12 text-faint">Sign writes the letter (the record’s discharge summary), the medicine changes and the discharge in one set; the bed is free at once. No printout yet.</p>
  </div>
}

/** the draft among the drafts before Sign: "Going home · Home · 3 kept · 1 stopped", the medicines still to decide in amber */
export function HomeBlock({ data }: BlockProps) {
  const q = data as Partial<HomeParams>; const line = homeLine(q); const n = toDecide(q); const tail = ` · ${n} to decide`
  return <p className="text-14 text-fg">{n > 0 && line.endsWith(tail) ? <>{line.slice(0, -tail.length)} · <span className="text-warn">{n} to decide</span></> : line}
    <span className="ms-2 text-12 text-faint">the letter, the medicines and the discharge, signed as one set</span></p>
}
