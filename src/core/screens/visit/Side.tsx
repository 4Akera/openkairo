import { useState, type ReactNode } from 'react'
import { Plus, Check, X, RotateCw } from 'lucide-react'
import { useDrafts, useDraftsFor, type NewDraft } from '../../hooks/drafts'
import type { RecordView, ListReview } from '../../db/types'
import { Badge, Button, Card, Heading, IconButton, Input, Kbd, Select, cn } from '../../ui'
import { partialDate } from './parse'

export type SideForm = 'problem' | 'medication' | 'allergy' | null
const FREQS = ['OD', 'BD', 'TDS', 'QDS', 'q8h', 'q12h', 'weekly', 'monthly', 'PRN', 'once', 'stat']
const ROUTES = ['oral', 'sc', 'im', 'iv', 'sl', 'topical', 'inhaled', 'pr', 'pv']

/** how long ago a partial date was: "7 y" · "4 mo" */
function since(on: string | null | undefined) {
  if (!on) return null
  const [y, m = 1] = on.split('-').map(Number); const n = new Date(); const months = (n.getFullYear() - y) * 12 + (n.getMonth() + 1 - m)
  return months >= 24 ? `${Math.floor(months / 12)} y` : months >= 1 ? `${months} mo` : 'this month'
}

/** The record's lists beside the visit (spec 05): problems, then medications, then allergies; each adds its own drafts. */
export function Side({ r, patientId, can, form, setForm }: { r: RecordView; patientId: string; can: (a: string) => boolean; form: SideForm; setForm: (f: SideForm) => void }) {
  const drafts = useDraftsFor(patientId)
  const add = (d: NewDraft) => useDrafts.getState().add(patientId, d)
  const remove = (id: string) => useDrafts.getState().remove(patientId, id)
  const drafted = (fn: string, action: string) => drafts.filter((d) => d.function === fn && d.params.action === action)
  const pending = (fn: string, key: string, id: string) => drafts.find((d) => d.function === fn && d.params[key] === id)
  const newProblems = drafted('write_problem', 'add')
  const allProblems = [...r.problems.map((p) => ({ id: p.id, name: p.name })), ...newProblems.map((d) => ({ id: d.id, name: String(d.params.name) }))]
  const medsFor = (pid: string) => [...r.medications.filter((m) => m.problem_id === pid).map((m) => m.drug_name),
    ...drafted('write_prescription', 'start').filter((d) => (d.params.problems as { id: string }[] | undefined)?.[0]?.id === pid).map((d) => String((d.params.drug as { name: string }).name))]
  const review = (list: 'problems' | 'medications' | 'allergies', at: ListReview | null) => {
    if (!can('write:list_review')) return null
    const d = drafts.find((x) => x.function === 'write_list_review' && x.params.list === list)
    return <button title="Mark this list reviewed today" onClick={() => d ? remove(d.id) : add({ function: 'write_list_review', params: { list, outcome: 'reviewed' }, line: `${list} reviewed`, kind: 'review' })}
      className={cn('text-[10.5px]', d ? 'font-medium text-teal-700' : at ? 'text-neutral-400 hover:text-neutral-700' : 'text-amber-700 hover:text-amber-900')}>
      {d ? '✓ reviewed now' : at ? `✓ ${at.reviewed_at.slice(0, 10)}` : 'not reviewed'}</button>
  }
  const plus = (f: SideForm, key: string, action: string) => can(action) && <IconButton title={`Add (Alt+${key})`} onClick={() => setForm(form === f ? null : f)} className={form === f ? 'bg-teal-50 text-teal-800' : ''}><Plus className="h-3.5 w-3.5" /></IconButton>

  return <aside className="grid content-start gap-3">
    <Section title="Problems" count={r.problems.length + newProblems.length} right={<>{review('problems', r.problem_review)}{plus('problem', 'P', 'write:problem')}</>}>
      {form === 'problem' && <ProblemForm onAdd={(d) => { add(d); setForm(null) }} onClose={() => setForm(null)} />}
      {r.problems.length + newProblems.length === 0 && form !== 'problem' && <Empty>No problems recorded</Empty>}
      <ul className="divide-y divide-neutral-100">
        {r.problems.map((p) => { const res = pending('write_problem', 'problem_id', p.id); const meds = medsFor(p.id); return <li key={p.id} className={cn('group py-2', res && 'opacity-50')}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className={cn('text-[13.5px] font-medium leading-snug text-neutral-900', res && 'line-through')}>{p.name}{p.certainty === 'suspected' && <Badge tone="amber" className="ml-1.5 align-middle">suspected</Badge>}</p>
              {(p.onset_on || p.note_text) && <p className="mt-0.5 text-xs text-neutral-500">{p.onset_on && <span className="tnum">since {p.onset_on} · {since(p.onset_on)}</span>}{p.onset_on && p.note_text && ' — '}{p.note_text}</p>}
              {meds.length > 0 && <p className="mt-0.5 text-xs text-teal-800">℞ {meds.join(', ')}</p>}
            </div>
            {can('write:problem') && (res ? <IconButton title="Undo" onClick={() => remove(res.id)}><X className="h-3.5 w-3.5" /></IconButton> : <span className="flex opacity-0 transition-opacity group-hover:opacity-100">
              <IconButton title="Resolve" onClick={() => add({ function: 'write_problem', params: { action: 'resolve', problem_id: p.id, name: p.name }, line: `Resolved: ${p.name}`, kind: 'problem' })}><Check className="h-3.5 w-3.5" /></IconButton></span>)}
          </div></li> })}
        {newProblems.map((d) => <DraftRow key={d.id} onUndo={() => remove(d.id)}>{String(d.params.name)}{d.params.certainty === 'suspected' && <Badge tone="amber" className="ml-1.5">suspected</Badge>}
          {(d.params.onset_on || d.params.text) ? <span className="block text-xs font-normal text-neutral-500">{d.params.onset_on ? `since ${d.params.onset_on}` : ''}{d.params.onset_on && d.params.text ? ' — ' : ''}{String(d.params.text ?? '')}</span> : null}
          {medsFor(d.id).length > 0 && <span className="block text-xs font-normal text-teal-800">℞ {medsFor(d.id).join(', ')}</span>}</DraftRow>)}
      </ul>
    </Section>

    <Section title="Medications" count={r.medications.length + drafted('write_prescription', 'start').length} right={<>{review('medications', r.medication_review)}{plus('medication', 'M', 'write:prescription')}</>}>
      {form === 'medication' && <MedicationForm problems={allProblems} onAdd={(d) => { add(d); setForm(null) }} onClose={() => setForm(null)} />}
      {r.medications.length + drafted('write_prescription', 'start').length === 0 && form !== 'medication' && <Empty>No active medications</Empty>}
      <ul className="divide-y divide-neutral-100">
        {r.medications.map((m) => { const p = pending('write_prescription', 'medication_id', m.id); const forP = r.problems.find((x) => x.id === m.problem_id); return <li key={m.id} className="group flex items-start gap-2 py-2">
          <div className="min-w-0 flex-1">
            <p className={cn('text-[13.5px] font-medium text-neutral-900', p?.params.action === 'stop' && 'line-through opacity-50')}>{m.drug_name} <span className="font-normal text-neutral-600 tnum">{m.dose_number}{m.dose_unit ? ` ${m.dose_unit}` : ''}{m.route && m.route !== 'oral' ? ` ${m.route}` : ''} {m.frequency}{m.prn && m.frequency !== 'PRN' ? ' PRN' : ''}</span></p>
            <p className="text-xs text-neutral-500">{forP && <span className="text-teal-800">for {forP.name} · </span>}since {m.started_on}{p && <b className="ml-1 font-medium text-teal-700">{p.params.action === 'stop' ? 'stopping' : 'repeat'}</b>}</p>
          </div>
          {can('write:prescription') && (p ? <IconButton title="Undo" onClick={() => remove(p.id)}><X className="h-3.5 w-3.5" /></IconButton> : <span className="flex opacity-0 transition-opacity group-hover:opacity-100">
            <IconButton title="Repeat" onClick={() => add({ function: 'write_prescription', params: { action: 'repeat', medication_id: m.id, drug: { code: m.drug_code, name: m.drug_name }, dose_number: m.dose_number, dose_unit: m.dose_unit, route: m.route, frequency: m.frequency }, line: `Repeat ${m.drug_name}`, kind: 'prescription' })}><RotateCw className="h-3.5 w-3.5" /></IconButton>
            <IconButton title="Stop" className="hover:text-red-700" onClick={() => add({ function: 'write_prescription', params: { action: 'stop', medication_id: m.id, drug: { code: m.drug_code, name: m.drug_name } }, line: `Stop ${m.drug_name}`, kind: 'prescription' })}><X className="h-3.5 w-3.5" /></IconButton></span>)}
        </li> })}
        {drafted('write_prescription', 'start').map((d) => <DraftRow key={d.id} onUndo={() => remove(d.id)}>{d.line}</DraftRow>)}
      </ul>
    </Section>

    <Section title="Allergies" count={r.allergies.filter((a) => a.status === 'active').length + drafted('write_allergy', 'add').length} right={<>{review('allergies', r.allergy_review)}{plus('allergy', 'A', 'write:allergy')}</>}>
      {form === 'allergy' && <AllergyForm onAdd={(d) => { add(d); setForm(null) }} onClose={() => setForm(null)} />}
      {r.allergies.length + drafted('write_allergy', 'add').length === 0 && form !== 'allergy' && <Empty>No known allergies</Empty>}
      <ul className="divide-y divide-neutral-100">
        {r.allergies.filter((a) => a.status === 'active').map((a) => { const p = pending('write_allergy', 'allergy_id', a.id); return <li key={a.id} className="group flex items-start gap-2 py-2">
          <div className={cn('min-w-0 flex-1', p && 'line-through opacity-50')}>
            <p className="text-[13.5px] font-medium text-red-800">{a.substance_name}{a.kind === 'intolerance' && <Badge className="ml-1.5">intolerance</Badge>}{a.severity && <Badge tone={a.severity === 'severe' ? 'red' : 'amber'} className="ml-1.5">{a.severity}</Badge>}</p>
            {a.reactions_text && <p className="text-xs text-neutral-500">{a.reactions_text}</p>}
          </div>
          {can('write:allergy') && (p ? <IconButton title="Undo" onClick={() => remove(p.id)}><X className="h-3.5 w-3.5" /></IconButton> : <span className="opacity-0 transition-opacity group-hover:opacity-100"><IconButton title="Not an allergy (refute)" className="hover:text-red-700" onClick={() => add({ function: 'write_allergy', params: { action: 'refute', allergy_id: a.id, substance: { name: a.substance_name } }, line: `Refuted: ${a.substance_name}`, kind: 'allergy' })}><X className="h-3.5 w-3.5" /></IconButton></span>)}
        </li> })}
        {drafted('write_allergy', 'add').map((d) => <DraftRow key={d.id} onUndo={() => remove(d.id)}>{d.line.replace(/^(Allergy|Intolerance): /, '')}</DraftRow>)}
      </ul>
    </Section>

    {r.open_requests.length > 0 && <Section title="Open requests" count={r.open_requests.length}>
      <ul className="divide-y divide-neutral-100">{r.open_requests.map((c) => <li key={c.id} className="flex items-baseline justify-between gap-2 py-1.5 text-[13px]"><span className="truncate">{c.display_line}</span><Badge tone="amber">{c.request?.step}</Badge></li>)}</ul>
    </Section>}
  </aside>
}

function Section({ title, count, right, children }: { title: string; count?: number; right?: ReactNode; children: ReactNode }) {
  return <Card className="px-3.5 py-3"><Heading count={count} right={right} className="mb-1">{title}</Heading>{children}</Card>
}
const Empty = ({ children }: { children: ReactNode }) => <p className="py-1.5 text-xs text-neutral-400">{children}</p>
function DraftRow({ children, onUndo }: { children: ReactNode; onUndo: () => void }) {
  return <li className="flex items-start gap-2 py-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" title="new, signed on Done" /><span className="min-w-0 flex-1 text-[13.5px] font-medium text-teal-900">{children}</span><IconButton title="Remove" onClick={onUndo}><X className="h-3.5 w-3.5" /></IconButton></li>
}

/** inline forms: Enter adds, Esc closes */
function MiniForm({ onSubmit, onClose, children, ok = true }: { onSubmit: () => void; onClose: () => void; children: ReactNode; ok?: boolean }) {
  return <form onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit() }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); if (ok) onSubmit() } }} className="my-2 grid gap-2 rounded-lg bg-neutral-50 p-2.5 ring-1 ring-neutral-200">
    {children}
    <div className="flex items-center justify-end gap-1.5"><span className="mr-auto text-[10.5px] text-neutral-400"><Kbd>↵</Kbd> add · <Kbd>esc</Kbd> close</span><Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" size="sm" disabled={!ok}>Add</Button></div>
  </form>
}
function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-neutral-200">{options.map(([v, l]) => <button type="button" key={v} onClick={() => onChange(v)} className={cn('rounded-md px-2 py-0.5 text-xs', value === v ? 'bg-teal-800 text-white' : 'text-neutral-600 hover:text-neutral-900')}>{l}</button>)}</div>
}

function ProblemForm({ onAdd, onClose }: { onAdd: (d: NewDraft) => void; onClose: () => void }) {
  const [name, setName] = useState(''); const [certainty, setCertainty] = useState<'confirmed' | 'suspected'>('confirmed'); const [onset, setOnset] = useState(''); const [note, setNote] = useState('')
  const onsetOn = onset.trim() ? partialDate(onset) : null; const bad = !!onset.trim() && !onsetOn
  return <MiniForm ok={!!name.trim() && !bad} onClose={onClose} onSubmit={() => onAdd({ function: 'write_problem', kind: 'problem', params: { action: 'add', name: name.trim(), status: 'active', certainty, onset_on: onsetOn, text: note.trim() || null }, line: `${name.trim()}${certainty === 'suspected' ? ' (suspected)' : ''}` })}>
    <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Problem — e.g. Type 2 diabetes mellitus" className="h-8" />
    <div className="flex flex-wrap items-center gap-2"><Segmented value={certainty} onChange={setCertainty} options={[['confirmed', 'Confirmed'], ['suspected', 'Suspected']]} />
      <Input value={onset} onChange={(e) => setOnset(e.target.value)} placeholder="Since: 2019 · 3y · 6m" className={cn('h-7 w-36 text-xs', bad && 'border-red-400')} /></div>
    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note — control, complications, plan…" className="h-8" />
  </MiniForm>
}
function MedicationForm({ problems, onAdd, onClose }: { problems: { id: string; name: string }[]; onAdd: (d: NewDraft) => void; onClose: () => void }) {
  const [drug, setDrug] = useState(''); const [dose, setDose] = useState(''); const [unit, setUnit] = useState('mg'); const [route, setRoute] = useState('oral'); const [freq, setFreq] = useState('OD')
  const [days, setDays] = useState(''); const [forP, setForP] = useState(problems.length === 1 ? problems[0].id : ''); const [instr, setInstr] = useState('')
  const p = problems.find((x) => x.id === forP)
  return <MiniForm ok={!!drug.trim()} onClose={onClose} onSubmit={() => onAdd({ function: 'write_prescription', kind: 'prescription',
    params: { action: 'start', drug: { name: drug.trim() }, dose_number: dose ? Number(dose) : null, dose_unit: dose ? unit : null, route, frequency: freq, prn: freq === 'PRN', duration_days: days ? Number(days) : null, instructions_text: instr.trim() || null, problems: p ? [{ id: p.id, name: p.name }] : [] },
    line: [drug.trim(), dose && `${dose} ${unit}`, route !== 'oral' && route, freq, days && `× ${days}d`, p && `for ${p.name}`].filter(Boolean).join(' ') })}>
    <Input autoFocus value={drug} onChange={(e) => setDrug(e.target.value)} placeholder="Drug — e.g. Metformin" className="h-8" />
    <div className="grid grid-cols-[1fr_4rem_5.5rem] gap-1.5"><Input type="number" step="any" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Dose" className="h-8" /><Input value={unit} onChange={(e) => setUnit(e.target.value)} className="h-8" /><Select value={route} onChange={(e) => setRoute(e.target.value)} className="h-8">{ROUTES.map((x) => <option key={x}>{x}</option>)}</Select></div>
    <div className="flex flex-wrap gap-1">{FREQS.map((f) => <button type="button" key={f} onClick={() => setFreq(f)} className={cn('rounded-md px-1.5 py-0.5 text-[11px] ring-1 ring-inset', freq === f ? 'bg-teal-800 text-white ring-teal-800' : 'bg-white text-neutral-600 ring-neutral-200 hover:ring-neutral-400')}>{f}</button>)}</div>
    <div className="grid grid-cols-[5rem_1fr] gap-1.5"><Input type="number" value={days} onChange={(e) => setDays(e.target.value)} placeholder="Days" className="h-8" />
      <Select value={forP} onChange={(e) => setForP(e.target.value)} className="h-8"><option value="">For problem…</option>{problems.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></div>
    <Input value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="Instructions — after food, at night…" className="h-8" />
  </MiniForm>
}
function AllergyForm({ onAdd, onClose }: { onAdd: (d: NewDraft) => void; onClose: () => void }) {
  const [sub, setSub] = useState(''); const [react, setReact] = useState(''); const [sev, setSev] = useState<'mild' | 'moderate' | 'severe'>('moderate'); const [kind, setKind] = useState<'allergy' | 'intolerance'>('allergy')
  return <MiniForm ok={!!sub.trim()} onClose={onClose} onSubmit={() => onAdd({ function: 'write_allergy', kind: 'allergy', params: { action: 'add', substance: { name: sub.trim() }, kind, reactions_text: react.trim() || null, severity: sev }, line: `${kind === 'intolerance' ? 'Intolerance' : 'Allergy'}: ${sub.trim()}${react.trim() ? ` — ${react.trim()}` : ''} (${sev})` })}>
    <Input autoFocus value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Substance — e.g. Penicillin" className="h-8" />
    <Input value={react} onChange={(e) => setReact(e.target.value)} placeholder="Reaction — rash, angioedema…" className="h-8" />
    <div className="flex flex-wrap gap-2"><Segmented value={sev} onChange={setSev} options={[['mild', 'Mild'], ['moderate', 'Moderate'], ['severe', 'Severe']]} /><Segmented value={kind} onChange={setKind} options={[['allergy', 'Allergy'], ['intolerance', 'Intolerance']]} /></div>
  </MiniForm>
}
