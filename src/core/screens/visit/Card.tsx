// The composer's card (spec 05): the fields of what the line says, editable, with the catalog's help.
// Every change goes back through lineOf, so the draft's line always says what its fields say.
import { useState, type ReactNode } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Badge, Chip, FormRow, IconButton, Input, NumberInput, Segmented, Select, TONE, Textarea, cn } from '../../ui'
import { REACTIONS, findAllergen, findDrug, findProblem, classOfDrug, resolveDrug, type Warning } from './catalog'
import { KIND_TONE, NOTE_KINDS } from './kinds'
import { lineOf, partialDate, type Ctx, type Parsed } from './parse'
import { cardFor } from './commands'
import { FactCard } from './FactCards'
import { ScoreCard } from './ScoreCard'

const FREQS = ['OD', 'BD', 'TDS', 'QDS', 'q6h', 'q8h', 'q12h', 'weekly', 'monthly', 'once', 'stat']
const ROUTES = ['oral', 'sc', 'im', 'iv', 'sl', 'topical', 'inhaled', 'nasal', 'pr', 'pv']
const DAYS = [3, 5, 7, 14, 30, 90]
const STOP_REASONS = ['Side effect', 'Not effective', 'Course complete', 'Patient’s choice', 'Changed to another drug', 'No longer needed']
const VITALS: [string, string, string][] = [['systolic', 'Sys', 'mmHg'], ['diastolic', 'Dia', 'mmHg'], ['pulse', 'Pulse', 'bpm'], ['temperature', 'Temp', '°C'], ['weight', 'Wt', 'kg'], ['spo2', 'SpO₂', '%'], ['respiratory_rate', 'RR', '/min'], ['height', 'Ht', 'cm']]

type Q = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const FACTS = new Set(['pregnancy', 'breastfeeding', 'alert'])
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
    : FACTS.has(item.function) ? <FactCard fn={item.function} q={q} set={set} />
    : item.function === 'score' ? <ScoreCard q={q} set={set} ctx={ctx} />
    : null
  const compact = item.function === 'order' && !!q.service_id || item.function === 'list_review'
  if (compact) return <div className="flex items-center gap-2 px-3 py-1.5 text-13">
    <Badge tone={KIND_TONE[item.kind] ?? 'neutral'} className="w-20 justify-center">{item.kind}</Badge>
    <span className="min-w-0 flex-1 font-medium text-fg">{item.line}</span>{editor}
    {onRemove && <IconButton title="Leave this one out" onClick={onRemove}><X className="h-3.5 w-3.5" /></IconButton>}
  </div>
  return <div className="px-3 py-2.5">
    <div className="mb-2 flex items-start gap-2 text-13">
      <Badge tone={KIND_TONE[item.kind] ?? 'neutral'} className="mt-0.5 w-20 justify-center">{item.kind}</Badge>
      <span className="min-w-0 flex-1 font-medium text-fg">{item.function === 'note' ? `${NOTE_KINDS.find(([k]) => k === q.kind)?.[1] ?? 'Progress'} note` : item.line || '—'}</span>
      {onRemove && <IconButton title="Leave this one out" onClick={onRemove}><X className="h-3.5 w-3.5" /></IconButton>}
    </div>
    {warnings.length > 0 && <ul className="mb-2 grid gap-1">{warnings.map((w, i) => <WarningItem key={i} w={w} />)}</ul>}
    {extra}
    {editor}
  </div>
}

/** a warning in the card, Callout-style: a block in danger, a caution in warn, always with its icon (colour is never alone) */
export function WarningItem({ w }: { w: Warning }) {
  const t = TONE[w.level === 'block' ? 'danger' : 'warn']
  return <li className={cn('flex items-start gap-1.5 rounded-md px-2 py-1 text-12 ring-1 ring-inset', t.soft, t.text, t.line)}><AlertTriangle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />{w.text}</li>
}
const small = 'h-7 text-13'

function Rx({ q, set, ctx }: { q: Q; set: (p: Q) => void; ctx: Ctx }) {
  const drug = findDrug(q.drug?.name ?? '')
  if (q.action === 'stop') return <div className="grid gap-1.5">
    <FormRow inline label="Why">{STOP_REASONS.map((r) => <Chip data-chip key={r} on={q.stop_reason_text === r} onClick={() => set({ stop_reason_text: q.stop_reason_text === r ? null : r })}>{r}</Chip>)}</FormRow>
    <FormRow inline label=""><Input aria-label="Reason for stopping" value={q.stop_reason_text ?? ''} onChange={(e) => set({ stop_reason_text: e.target.value || null })} placeholder="Or type the reason" className={cn(small, 'max-w-sm')} /></FormRow>
  </div>
  return <div className="grid gap-1.5">
    {q.action === 'start' && <FormRow inline label="Drug">
      <Input aria-label="Drug" list="oc-drugs" value={q.drug?.name ?? ''} onChange={(e) => { const d = findDrug(e.target.value)
        // another drug: its own route and unit; a dose that is not one of its strengths is cleared
        set({ drug: d ? { name: d.name, code: `atc:${d.atc}` } : { name: e.target.value }, ...(d && d.name !== drug?.name ? { route: d.route, dose_unit: d.unit, dose_number: d.strengths.includes(q.dose_number) ? q.dose_number : null } : {}) }) }} className={cn(small, 'w-56')} />
      {drug ? <span className="text-11 text-faint">{drug.group}{drug.allergy_class ? ` · ${drug.allergy_class.replace(/_/g, ' ')}` : ''}</span>
        : q.drug?.name && <span className="text-11 text-warn">not in the drug list{resolveDrug(q.drug.name) ? ` — checked as ${resolveDrug(q.drug.name)!.name}` : ' — say the unit and route'}</span>}
    </FormRow>}
    {drug && drug.strengths.length > 0 && <FormRow inline label="Strength">{drug.strengths.map((n) => <Chip data-chip key={n} on={q.dose_number === n && q.dose_unit === drug.unit} onClick={() => set({ dose_number: n, dose_unit: drug.unit })}>{n} {drug.unit}</Chip>)}</FormRow>}
    <FormRow inline label="Dose">
      <NumberInput label="Dose" value={q.dose_number} onValue={(n) => set({ dose_number: n, dose_unit: q.dose_unit ?? drug?.unit ?? null })} className={cn(small, 'w-20')} />
      <Input aria-label="Dose unit" list="oc-units" value={q.dose_unit ?? ''} onChange={(e) => set({ dose_unit: e.target.value || null })} placeholder="unit" className={cn(small, 'w-20', q.dose_number != null && !q.dose_unit && 'border-warn')} />
      <Select aria-label="Route" value={q.route ?? ''} onChange={(e) => set({ route: e.target.value || null })} className={cn(small, 'w-28', !q.route && 'border-warn')}>{!q.route && <option value="">route…</option>}{ROUTES.map((r) => <option key={r}>{r}</option>)}</Select>
      <datalist id="oc-units">{['mg', 'g', 'mcg', 'units', 'ml', 'tab', 'cap', 'puff', 'drop', 'sachet'].map((u) => <option key={u} value={u} />)}</datalist>
    </FormRow>
    <FormRow inline label="How often">
      {FREQS.map((f) => <Chip data-chip key={f} on={q.frequency === f} dot={drug?.frequency === f} title={drug?.frequency === f ? 'usual' : undefined} onClick={() => set({ frequency: q.frequency === f ? null : f })}>{f}</Chip>)}
      <Chip data-chip on={!!q.prn} onClick={() => set(q.prn ? { prn: false, prn_reason_text: null, frequency: q.frequency === 'PRN' ? null : q.frequency } : { prn: true, frequency: q.frequency ?? 'PRN' })}>PRN</Chip>
      {q.prn && <Input aria-label="PRN for" value={q.prn_reason_text ?? ''} onChange={(e) => set({ prn_reason_text: e.target.value || null })} placeholder="PRN for — pain, fever…" className={cn(small, 'w-40', !q.prn_reason_text && 'border-warn')} />}
    </FormRow>
    {q.action !== 'change' && <FormRow inline label="For">
      <NumberInput label="Days" integer value={q.duration_days} onValue={(n) => set({ duration_days: n })} placeholder="days" className={cn(small, 'w-16')} />
      {DAYS.map((d) => <Chip data-chip key={d} on={q.duration_days === d} onClick={() => set({ duration_days: q.duration_days === d ? null : d })}>{d}d</Chip>)}
      {q.action === 'start' && <Select aria-label="For problem" value={q.problems?.[0]?.id ?? ''} onChange={(e) => { const p = ctx.problems.find((x) => x.id === e.target.value); set({ problems: p ? [{ id: p.id, name: p.name }] : [] }) }} className={cn(small, 'ms-2 w-52')}>
        <option value="">For problem…</option>{ctx.problems.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
    </FormRow>}
    {ctx.send && <FormRow inline label={ctx.send.field}><Chip data-chip on={!!q.send} onClick={() => set({ send: !q.send })}>{q.send ? `${ctx.send.chip} ✓` : ctx.send.chip}</Chip>
      <span className="text-11 text-faint">{q.send ? ctx.send.sends : ctx.send.keeps}</span></FormRow>}
    <FormRow inline label="Instructions"><Input aria-label="Instructions" value={q.instructions_text ?? ''} onChange={(e) => set({ instructions_text: e.target.value || (q.action === 'change' ? '' : null) })} placeholder="after food, at night…" className={cn(small, 'max-w-md flex-1')} /></FormRow>
  </div>
}

function Since({ value, set }: { value: string | null; set: (v: string | null) => void }) {
  const [raw, setRaw] = useState(value ?? ''); const d = raw.trim() ? partialDate(raw) : null; const bad = !!raw.trim() && !d
  const shown = bad || (d ?? '') === (value ?? '') ? raw : value ?? ''                  // changed from the line: show that
  return <Input aria-label="Since" value={shown} onChange={(e) => { setRaw(e.target.value); const p = partialDate(e.target.value); if (p || !e.target.value.trim()) set(p) }} placeholder="since 2019 · 3y" title={value ?? 'since 2019 · 2019-03 · 3y · 6m'} className={cn(small, 'w-32', bad && shown === raw && 'border-danger')} />
}
function Dx({ q, set }: { q: Q; set: (p: Q) => void }) {
  const term = q.action === 'add' ? findProblem(q.name ?? '') : null
  return <div className="grid gap-1.5">
    {q.action === 'add' && <FormRow inline label="Problem"><Input aria-label="Problem" list="oc-problems" value={q.name ?? ''} onChange={(e) => { const t = findProblem(e.target.value); set({ name: t?.name ?? e.target.value, code: t ? `icd10:${t.icd10}` : null }) }} className={cn(small, 'w-72')} />
      {term ? <Badge tone="accent">ICD-10 {term.icd10}{term.chronic ? ' · chronic' : ''}</Badge> : q.name && <span className="text-11 text-faint">free text — no code</span>}</FormRow>}
    {q.action !== 'resolve' && <FormRow inline label="Certainty"><Segmented size="sm" aria-label="Certainty" value={q.certainty ?? 'confirmed'} onChange={(v) => set({ certainty: v })} options={[['confirmed', 'Confirmed'], ['suspected', 'Suspected']]} /><Since value={q.onset_on || null} set={(v) => set({ onset_on: v ?? (q.action === 'update' ? '' : null) })} /></FormRow>}
    <FormRow inline label="Note"><Input aria-label="Note" value={q.text ?? ''} onChange={(e) => set({ text: e.target.value || (q.action === 'update' ? '' : null) })} placeholder={q.action === 'resolve' ? 'How it resolved' : 'Control, complications, plan…'} className={cn(small, 'max-w-md flex-1')} /></FormRow>
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
    <FormRow inline label="Substance"><Input aria-label="Substance" list="oc-allergens" value={q.substance?.name ?? ''} onChange={(e) => { const a = findAllergen(e.target.value); const c = a?.allergy_class ?? classOfDrug(e.target.value); set({ substance: c ? { name: a?.name ?? e.target.value, class_code: c } : { name: e.target.value } }) }} className={cn(small, 'w-56')} />
      {cls && <Badge tone="danger">class: {cls.replace(/_/g, ' ')}</Badge>}<Segmented size="sm" aria-label="Allergy or intolerance" value={q.kind ?? 'allergy'} onChange={(v) => set({ kind: v })} options={[['allergy', 'Allergy'], ['intolerance', 'Intolerance']]} /></FormRow>
    <FormRow inline label="Reaction">{REACTIONS.map((r) => <Chip data-chip key={r} on={has(r)} onClick={() => toggle(r)}>{r}</Chip>)}</FormRow>
    <FormRow inline label=""><Input aria-label="Reaction" value={q.reactions_text ?? ''} onChange={(e) => set({ reactions_text: e.target.value || null })} placeholder="or type the reaction" className={cn(small, 'max-w-sm flex-1')} /></FormRow>
    <FormRow inline label="Severity"><Segmented size="sm" aria-label="Severity" value={q.severity} onChange={(v) => set({ severity: v })} options={[['mild', 'Mild'], ['moderate', 'Moderate'], ['severe', 'Severe']]} /></FormRow>
  </div>
}

function Vitals({ q, set }: { q: Q; set: (p: Q) => void }) {
  return <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">{VITALS.map(([k, l, u]) => <label key={k} className="text-11 text-muted">{l} <span className="text-faint">{u}</span>
    <NumberInput label={l} value={q[k]} onValue={(n) => set({ [k]: n ?? undefined })} className={cn(small, 'mt-0.5')} /></label>)}</div>
}

function Req({ q, set, ctx }: { q: Q; set: (p: Q) => void; ctx: Ctx }) {
  if (!q.service_id) return <div className="grid gap-1.5">
    <FormRow inline label="To"><Select aria-label="Consult department" value={q.to_department_id ?? ''} onChange={(e) => set({ to_department_id: e.target.value })} className={cn(small, 'w-52')}>{ctx.departments.filter((d) => d.id !== ctx.departmentId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
      <Segmented size="sm" aria-label="Priority" value={q.priority ?? 'routine'} onChange={(v) => set({ priority: v })} options={[['routine', 'Routine'], ['urgent', 'Urgent'], ['stat', 'Stat']]} /></FormRow>
    <FormRow inline label="Question"><Input aria-label="Question" value={q.question_text ?? ''} onChange={(e) => set({ question_text: e.target.value })} className={cn(small, 'max-w-lg flex-1')} /></FormRow>
  </div>
  return <FormRow inline className="shrink-0"><Segmented size="sm" aria-label="Priority" value={q.priority ?? 'routine'} onChange={(v) => set({ priority: v })} options={[['routine', 'Routine'], ['urgent', 'Urgent'], ['stat', 'Stat']]} /></FormRow>
}

function Note({ q, set, onLong }: { q: Q; set: (p: Q) => void; onLong?: (kind: string, text: string) => void }) {
  return <div className="grid gap-1.5">
    <Textarea dense aria-label="Note" value={q.text ?? ''} onChange={(e) => set({ text: e.target.value })} rows={Math.min(8, Math.max(2, String(q.text ?? '').split('\n').length))} className="min-h-0" />
    <FormRow inline><Select aria-label="Note kind" value={q.kind ?? 'progress'} onChange={(e) => set({ kind: e.target.value })} className={cn(small, 'w-52')}>{NOTE_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      {onLong && <button type="button" onClick={() => onLong(q.kind ?? 'progress', q.text ?? '')} className="rounded-sm text-12 text-accent hover:underline focus-ring">Longer? open it under the line</button>}
      <span className="ms-auto text-11 text-faint">shift ↵ new line</span></FormRow>
  </div>
}
