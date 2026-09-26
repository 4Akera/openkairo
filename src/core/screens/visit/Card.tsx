// The composer's card (spec 05): the fields of what the line says, editable, with the catalog's help.
// Every change goes back through lineOf, so the draft's line always says what its fields say.
import { useState, type ReactNode } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Badge, IconButton, Input, Select, cn } from '../../ui'
import { REACTIONS, findAllergen, findDrug, findProblem, classOfDrug, resolveDrug, type Warning } from './catalog'
import { KIND_TONE, NOTE_KINDS } from './kinds'
import { lineOf, partialDate, type Ctx, type Parsed } from './parse'
import { cardFor } from './commands'

const FREQS = ['OD', 'BD', 'TDS', 'QDS', 'q6h', 'q8h', 'q12h', 'weekly', 'monthly', 'once', 'stat']
const ROUTES = ['oral', 'sc', 'im', 'iv', 'sl', 'topical', 'inhaled', 'nasal', 'pr', 'pv']
const DAYS = [3, 5, 7, 14, 30, 90]
const STOP_REASONS = ['Side effect', 'Not effective', 'Course complete', 'Patient’s choice', 'Changed to another drug', 'No longer needed']
const VITALS: [string, string, string][] = [['systolic', 'Sys', 'mmHg'], ['diastolic', 'Dia', 'mmHg'], ['pulse', 'Pulse', 'bpm'], ['temperature', 'Temp', '°C'], ['weight', 'Wt', 'kg'], ['spo2', 'SpO₂', '%'], ['respiratory_rate', 'RR', '/min'], ['height', 'Ht', 'cm']]

type Q = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export interface CardProps { item: Parsed; ctx: Ctx; onChange: (p: Parsed) => void; onRemove?: () => void; onLongNote?: (kind: string, text: string) => void }

/** one item of the card: its kind, its live line, its fields */
export function CardItem({ item, ctx, onChange, onRemove, onLongNote, warnings, extra }: CardProps & { warnings: Warning[]; extra?: ReactNode }) {
  const q = item.params as Q
  const reg = cardFor(item.function, ctx)                                          // a pack's card for its own type, or its department's for a core one
  const set = (patch: Q) => { const next = { ...item, params: { ...q, ...patch } }
    onChange({ ...next, line: reg?.line ? reg.line(next.params) : lineOf(next, ctx), tag: item.function === 'note' ? `note:${next.params.kind ?? 'progress'}` : item.tag }) }   // a note joins the note of its kind
  const editor = reg ? <reg.Editor q={q} set={set} ctx={ctx} />
    : item.function === 'medication' ? <Rx q={q} set={set} ctx={ctx} />
    : item.function === 'problem' ? <Dx q={q} set={set} />
    : item.function === 'allergy' ? <Al q={q} set={set} />
    : item.function === 'vitals' ? <Vitals q={q} set={set} />
    : item.function === 'order' ? <Req q={q} set={set} ctx={ctx} />
    : item.function === 'note' ? <Note q={q} set={set} onLong={onLongNote} />
    : null
  const compact = item.function === 'order' && !!q.service_id || item.function === 'list_review'
  if (compact) return <div className="flex items-center gap-2 px-3 py-1.5 text-[13.5px]">
    <Badge tone={KIND_TONE[item.kind] ?? 'neutral'} className="w-20 justify-center">{item.kind}</Badge>
    <span className="min-w-0 flex-1 font-medium text-neutral-900">{item.line}</span>{editor}
    {onRemove && <IconButton title="Leave this one out" onClick={onRemove}><X className="h-3.5 w-3.5" /></IconButton>}
  </div>
  return <div className="px-3 py-2.5">
    <div className="mb-2 flex items-start gap-2 text-[13.5px]">
      <Badge tone={KIND_TONE[item.kind] ?? 'neutral'} className="mt-0.5 w-20 justify-center">{item.kind}</Badge>
      <span className="min-w-0 flex-1 font-medium text-neutral-900">{item.function === 'note' ? `${NOTE_KINDS.find(([k]) => k === q.kind)?.[1] ?? 'Progress'} note` : item.line || '—'}</span>
      {onRemove && <IconButton title="Leave this one out" onClick={onRemove}><X className="h-3.5 w-3.5" /></IconButton>}
    </div>
    {warnings.length > 0 && <ul className="mb-2 grid gap-1">{warnings.map((w, i) => <li key={i} className={cn('flex items-start gap-1.5 rounded-md px-2 py-1 text-xs', w.level === 'block' ? 'bg-red-50 text-red-800 ring-1 ring-red-200' : 'bg-amber-50 text-amber-900 ring-1 ring-amber-200')}>
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />{w.text}</li>)}</ul>}
    {extra}
    {editor}
  </div>
}

function Row({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-1.5', className)}>{label && <span className="w-16 shrink-0 text-[11px] text-neutral-500">{label}</span>}{children}</div>
}
function Chip({ on, onClick, children, dot, title }: { on?: boolean; onClick: () => void; children: ReactNode; dot?: boolean; title?: string }) {
  return <button type="button" data-chip title={title} onClick={onClick} className={cn('relative rounded-md px-1.5 py-0.5 text-[11.5px] ring-1 ring-inset', on ? 'bg-teal-800 text-white ring-teal-800' : 'bg-white text-neutral-700 ring-neutral-200 hover:ring-neutral-400')}>
    {children}{dot && !on && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-teal-600" />}</button>
}
export function Segmented<T extends string>({ value, options, onChange }: { value: T | null | undefined; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-neutral-200">{options.map(([v, l]) => <button type="button" data-chip key={v} onClick={() => onChange(v)} className={cn('rounded-md px-2 py-0.5 text-xs', value === v ? 'bg-teal-800 text-white' : 'text-neutral-600 hover:text-neutral-900')}>{l}</button>)}</div>
}
const small = 'h-7 text-[13px]'
const toNum = (v: string, integer?: boolean) => { const t = v.trim(); return !t ? null : (integer ? /^\d+$/ : /^(\d+\.?\d*|\.\d+)$/).test(t) ? Number(t) : undefined }
/** a number field that keeps what is typed ("2." stays "2.", so 2.5 is not 25) and sends the number; what it cannot read is marked */
function NumInput({ value, onValue, integer, label, className, placeholder }: { value: number | null | undefined; onValue: (n: number | null) => void; integer?: boolean; label: string; className?: string; placeholder?: string }) {
  const [raw, setRaw] = useState(value == null ? '' : String(value)); const n = toNum(raw, integer)
  const shown = n === undefined || n === (value ?? null) ? raw : value == null ? '' : String(value)   // the value changed from outside (a chip): show it
  return <Input aria-label={label} inputMode={integer ? 'numeric' : 'decimal'} value={shown} placeholder={placeholder} onFocus={(e) => e.target.select()}
    onChange={(e) => { setRaw(e.target.value); const v = toNum(e.target.value, integer); onValue(v === undefined ? null : v) }} className={cn(className, toNum(shown, integer) === undefined && 'border-red-400')} />
}

function Rx({ q, set, ctx }: { q: Q; set: (p: Q) => void; ctx: Ctx }) {
  const drug = findDrug(q.drug?.name ?? '')
  if (q.action === 'stop') return <div className="grid gap-1.5">
    <Row label="Why">{STOP_REASONS.map((r) => <Chip key={r} on={q.stop_reason_text === r} onClick={() => set({ stop_reason_text: q.stop_reason_text === r ? null : r })}>{r}</Chip>)}</Row>
    <Row label=""><Input aria-label="Reason for stopping" value={q.stop_reason_text ?? ''} onChange={(e) => set({ stop_reason_text: e.target.value || null })} placeholder="Or type the reason" className={cn(small, 'max-w-sm')} /></Row>
  </div>
  return <div className="grid gap-1.5">
    {q.action === 'start' && <Row label="Drug">
      <Input aria-label="Drug" list="oc-drugs" value={q.drug?.name ?? ''} onChange={(e) => { const d = findDrug(e.target.value)
        // another drug: its own route and unit; a dose that is not one of its strengths is cleared
        set({ drug: d ? { name: d.name, code: `atc:${d.atc}` } : { name: e.target.value }, ...(d && d.name !== drug?.name ? { route: d.route, dose_unit: d.unit, dose_number: d.strengths.includes(q.dose_number) ? q.dose_number : null } : {}) }) }} className={cn(small, 'w-56')} />
      {drug ? <span className="text-[11px] text-neutral-500">{drug.group}{drug.allergy_class ? ` · ${drug.allergy_class.replace(/_/g, ' ')}` : ''}</span>
        : q.drug?.name && <span className="text-[11px] text-amber-700">not in the drug list{resolveDrug(q.drug.name) ? ` — checked as ${resolveDrug(q.drug.name)!.name}` : ' — say the unit and route'}</span>}
    </Row>}
    {drug && drug.strengths.length > 0 && <Row label="Strength">{drug.strengths.map((n) => <Chip key={n} on={q.dose_number === n && q.dose_unit === drug.unit} onClick={() => set({ dose_number: n, dose_unit: drug.unit })}>{n} {drug.unit}</Chip>)}</Row>}
    <Row label="Dose">
      <NumInput label="Dose" value={q.dose_number} onValue={(n) => set({ dose_number: n, dose_unit: q.dose_unit ?? drug?.unit ?? null })} className={cn(small, 'w-20 text-right')} />
      <Input aria-label="Dose unit" list="oc-units" value={q.dose_unit ?? ''} onChange={(e) => set({ dose_unit: e.target.value || null })} placeholder="unit" className={cn(small, 'w-20', q.dose_number != null && !q.dose_unit && 'border-amber-400')} />
      <Select aria-label="Route" value={q.route ?? ''} onChange={(e) => set({ route: e.target.value || null })} className={cn(small, 'w-28', !q.route && 'border-amber-400')}>{!q.route && <option value="">route…</option>}{ROUTES.map((r) => <option key={r}>{r}</option>)}</Select>
      <datalist id="oc-units">{['mg', 'g', 'mcg', 'units', 'ml', 'tab', 'cap', 'puff', 'drop', 'sachet'].map((u) => <option key={u} value={u} />)}</datalist>
    </Row>
    <Row label="How often">
      {FREQS.map((f) => <Chip key={f} on={q.frequency === f} dot={drug?.frequency === f} title={drug?.frequency === f ? 'usual' : undefined} onClick={() => set({ frequency: q.frequency === f ? null : f })}>{f}</Chip>)}
      <Chip on={!!q.prn} onClick={() => set(q.prn ? { prn: false, prn_reason_text: null, frequency: q.frequency === 'PRN' ? null : q.frequency } : { prn: true, frequency: q.frequency ?? 'PRN' })}>PRN</Chip>
      {q.prn && <Input aria-label="PRN for" value={q.prn_reason_text ?? ''} onChange={(e) => set({ prn_reason_text: e.target.value || null })} placeholder="PRN for — pain, fever…" className={cn(small, 'w-40', !q.prn_reason_text && 'border-amber-400')} />}
    </Row>
    {q.action !== 'change' && <Row label="For">
      <NumInput label="Days" integer value={q.duration_days} onValue={(n) => set({ duration_days: n })} placeholder="days" className={cn(small, 'w-16 text-right')} />
      {DAYS.map((d) => <Chip key={d} on={q.duration_days === d} onClick={() => set({ duration_days: q.duration_days === d ? null : d })}>{d}d</Chip>)}
      {q.action === 'start' && <Select aria-label="For problem" value={q.problems?.[0]?.id ?? ''} onChange={(e) => { const p = ctx.problems.find((x) => x.id === e.target.value); set({ problems: p ? [{ id: p.id, name: p.name }] : [] }) }} className={cn(small, 'ml-2 w-52')}>
        <option value="">For problem…</option>{ctx.problems.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
    </Row>}
    {ctx.canSend && <Row label="Pharmacy"><Chip on={!!q.send} onClick={() => set({ send: !q.send })}>{q.send ? 'Send to pharmacy ✓' : 'Send to pharmacy'}</Chip>
      <span className="text-[11px] text-neutral-500">{q.send ? 'The pharmacy gets it on Done' : 'Not sent — on the medication list only; the patient may buy it outside'}</span></Row>}
    <Row label="Instructions"><Input aria-label="Instructions" value={q.instructions_text ?? ''} onChange={(e) => set({ instructions_text: e.target.value || (q.action === 'change' ? '' : null) })} placeholder="after food, at night…" className={cn(small, 'max-w-md flex-1')} /></Row>
  </div>
}

function Since({ value, set }: { value: string | null; set: (v: string | null) => void }) {
  const [raw, setRaw] = useState(value ?? ''); const d = raw.trim() ? partialDate(raw) : null; const bad = !!raw.trim() && !d
  const shown = bad || (d ?? '') === (value ?? '') ? raw : value ?? ''                  // changed from the line: show that
  return <Input aria-label="Since" value={shown} onChange={(e) => { setRaw(e.target.value); const p = partialDate(e.target.value); if (p || !e.target.value.trim()) set(p) }} placeholder="since 2019 · 3y" title={value ?? 'since 2019 · 2019-03 · 3y · 6m'} className={cn(small, 'w-32', bad && shown === raw && 'border-red-400')} />
}
function Dx({ q, set }: { q: Q; set: (p: Q) => void }) {
  const term = q.action === 'add' ? findProblem(q.name ?? '') : null
  return <div className="grid gap-1.5">
    {q.action === 'add' && <Row label="Problem"><Input aria-label="Problem" list="oc-problems" value={q.name ?? ''} onChange={(e) => { const t = findProblem(e.target.value); set({ name: t?.name ?? e.target.value, code: t ? `icd10:${t.icd10}` : null }) }} className={cn(small, 'w-72')} />
      {term ? <Badge tone="brand">ICD-10 {term.icd10}{term.chronic ? ' · chronic' : ''}</Badge> : q.name && <span className="text-[11px] text-neutral-400">free text — no code</span>}</Row>}
    {q.action !== 'resolve' && <Row label="Certainty"><Segmented value={q.certainty ?? 'confirmed'} onChange={(v) => set({ certainty: v })} options={[['confirmed', 'Confirmed'], ['suspected', 'Suspected']]} /><Since value={q.onset_on || null} set={(v) => set({ onset_on: v ?? (q.action === 'update' ? '' : null) })} /></Row>}
    <Row label="Note"><Input aria-label="Note" value={q.text ?? ''} onChange={(e) => set({ text: e.target.value || (q.action === 'update' ? '' : null) })} placeholder={q.action === 'resolve' ? 'How it resolved' : 'Control, complications, plan…'} className={cn(small, 'max-w-md flex-1')} /></Row>
  </div>
}

function Al({ q, set }: { q: Q; set: (p: Q) => void }) {
  if (q.action === 'refute') return null
  const reactions: string[] = String(q.reactions_text ?? '').split(/,\s*/).filter(Boolean)
  const said = (r: string) => r.replace(/\s*\(.*\)$/, '').toLowerCase()      // "Urticaria (hives)" is written "urticaria"
  const has = (r: string) => reactions.some((x) => x.toLowerCase() === said(r))
  const toggle = (r: string) => { const next = has(r) ? reactions.filter((x) => x.toLowerCase() !== said(r)) : [...reactions, said(r)]; set({ reactions_text: next.join(', ') || null, ...(r === 'Anaphylaxis' && !has(r) ? { severity: 'severe' } : {}) }) }
  const cls = q.substance?.class_code as string | undefined
  return <div className="grid gap-1.5">
    <Row label="Substance"><Input aria-label="Substance" list="oc-allergens" value={q.substance?.name ?? ''} onChange={(e) => { const a = findAllergen(e.target.value); const c = a?.allergy_class ?? classOfDrug(e.target.value); set({ substance: c ? { name: a?.name ?? e.target.value, class_code: c } : { name: e.target.value } }) }} className={cn(small, 'w-56')} />
      {cls && <Badge tone="red">class: {cls.replace(/_/g, ' ')}</Badge>}<Segmented value={q.kind ?? 'allergy'} onChange={(v) => set({ kind: v })} options={[['allergy', 'Allergy'], ['intolerance', 'Intolerance']]} /></Row>
    <Row label="Reaction">{REACTIONS.map((r) => <Chip key={r} on={has(r)} onClick={() => toggle(r)}>{r}</Chip>)}</Row>
    <Row label=""><Input aria-label="Reaction" value={q.reactions_text ?? ''} onChange={(e) => set({ reactions_text: e.target.value || null })} placeholder="or type the reaction" className={cn(small, 'max-w-sm flex-1')} /></Row>
    <Row label="Severity"><Segmented value={q.severity} onChange={(v) => set({ severity: v })} options={[['mild', 'Mild'], ['moderate', 'Moderate'], ['severe', 'Severe']]} /></Row>
  </div>
}

function Vitals({ q, set }: { q: Q; set: (p: Q) => void }) {
  return <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">{VITALS.map(([k, l, u]) => <label key={k} className="text-[10.5px] text-neutral-500">{l} <span className="text-neutral-400">{u}</span>
    <NumInput label={l} value={q[k]} onValue={(n) => set({ [k]: n ?? undefined })} className={cn(small, 'mt-0.5 text-right tnum')} /></label>)}</div>
}

function Req({ q, set, ctx }: { q: Q; set: (p: Q) => void; ctx: Ctx }) {
  if (!q.service_id) return <div className="grid gap-1.5">
    <Row label="To"><Select aria-label="Consult department" value={q.to_department_id ?? ''} onChange={(e) => set({ to_department_id: e.target.value })} className={cn(small, 'w-52')}>{ctx.departments.filter((d) => d.id !== ctx.departmentId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
      <Segmented value={q.priority ?? 'routine'} onChange={(v) => set({ priority: v })} options={[['routine', 'Routine'], ['urgent', 'Urgent'], ['stat', 'Stat']]} /></Row>
    <Row label="Question"><Input aria-label="Question" value={q.question_text ?? ''} onChange={(e) => set({ question_text: e.target.value })} className={cn(small, 'max-w-lg flex-1')} /></Row>
  </div>
  return <Row className="shrink-0"><Segmented value={q.priority ?? 'routine'} onChange={(v) => set({ priority: v })} options={[['routine', 'Routine'], ['urgent', 'Urgent'], ['stat', 'Stat']]} /></Row>
}

function Note({ q, set, onLong }: { q: Q; set: (p: Q) => void; onLong?: (kind: string, text: string) => void }) {
  return <div className="grid gap-1.5">
    <textarea aria-label="Note" value={q.text ?? ''} onChange={(e) => set({ text: e.target.value })} rows={Math.min(8, Math.max(2, String(q.text ?? '').split('\n').length))}
      className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[13.5px] focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20" />
    <Row><Select aria-label="Note kind" value={q.kind ?? 'progress'} onChange={(e) => set({ kind: e.target.value })} className={cn(small, 'w-52')}>{NOTE_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      {onLong && <button type="button" onClick={() => onLong(q.kind ?? 'progress', q.text ?? '')} className="text-xs text-teal-800 hover:underline">Longer? open it beside the record</button>}
      <span className="ml-auto text-[10.5px] text-neutral-400">shift ↵ new line</span></Row>
  </div>
}
