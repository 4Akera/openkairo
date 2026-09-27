import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CornerDownLeft, Pencil, X } from 'lucide-react'
import { useDepartment, worksFor } from '../../hooks/organization'
import { canSendPrescriptions } from './send'
import { useDrafts, useDraftsFor, type Draft } from '../../hooks/drafts'
import { useComposer, type Seed } from '../../hooks/composer'
import type { Allergy, Medication, RecordView } from '../../db/types'
import { Badge, Button, Card, Heading, IconButton, Input, Kbd, Select, cn } from '../../ui'
import { ALLERGENS, DRUGS, PROBLEMS, allergyWarnings, doseWarnings, drugWarnings, duplicateMedication, duplicateProblem, type Warning } from './catalog'
import { expand, suggest, type Expanded, type Suggestion } from './expand'
import { CardItem, WarningItem } from './Card'
import { KIND_TONE, NOTE_KINDS } from './kinds'
import { lineOf, type Ctx, type Parsed } from './parse'
import { commandsFor } from './commands'
import { replyFormFor } from '../../renderers'

const FN_ACTION: Record<string, string> = { write_vitals: 'write:vitals', write_prescription: 'write:medication', write_request: 'write:order', write_problem: 'write:problem', write_allergy: 'write:allergy', write_note: 'write:note', write_list_review: 'write:list_review' }
type Q = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** focus the line; flush adds what is in it before Done (false: it could not — the card says why) */
export interface ComposerHandle { focus: () => void; flush: () => boolean; slash: () => void }

/** One composer (spec 05): type first; the card under the line shows what it will write and lets you change any field.
 *  The side lists, the drafts and the shortcuts open the same card. Nothing is written until Done. */
export const Composer = forwardRef<ComposerHandle, { r: RecordView; patientId: string; departmentId: string; can: (a: string) => boolean }>(function Composer({ r, patientId, departmentId, can }, ref) {
  const { org } = useDepartment()
  const drafts = useDraftsFor(patientId)
  const input = useRef<HTMLInputElement>(null); const card = useRef<HTMLDivElement>(null)
  const [text, setText] = useState(''); const [seed, setSeed] = useState<Seed | null>(null); const [seedN, setSeedN] = useState(0)
  const [edited, setEdited] = useState<{ key: string; items: Parsed[] } | null>(null)
  const [armed, setArmed] = useState<string | null>(null); const [pick, setPick] = useState(-1)
  const [history, setHistory] = useState<string[]>([]); const [hi, setHi] = useState(-1); const [help, setHelp] = useState(false)
  const [drawer, setDrawer] = useState<{ kind: string; text: string; draftId?: string } | null>(null)

  const presets = useMemo(() => (org?.templates ?? []).filter((t) => !t.department_id || t.department_id === departmentId), [org, departmentId])
  const ctx: Ctx = useMemo(() => ({
    // a service another write creates (a pack's dispensing, from a prescription) is not ordered by hand
    // …and one whose department does not work for this one is refused (not_served), so it is not offered
    services: (org?.services ?? []).filter((x) => !replyFormFor(x.reply_type)?.automatic && worksFor(org, x.department_id, departmentId)), templates: presets, departments: org?.departments ?? [], departmentId,
    can, packs: (org?.packs ?? []).filter((p) => p.enabled).map((p) => p.key),
    noteKind: can('write:medication') ? 'progress' : can('write:vitals') ? 'nurse' : 'progress',   // a nurse's lines are nurse notes
    canSend: canSendPrescriptions(org, departmentId) && can('write:medication'),   // a pharmacy answers prescriptions here
    departmentType: org?.departments.find((x) => x.id === departmentId)?.type, packCards: org?.departments.find((x) => x.id === departmentId)?.pack_cards ?? true,
    problems: [...r.problems.map((p) => ({ id: p.id, name: p.name })), ...drafts.filter((d) => d.function === 'problem' && d.params.action === 'add').map((d) => ({ id: d.id, name: String(d.params.name) }))],
  }), [org, presets, departmentId, r.problems, drafts, can])

  // what the lists hold once this visit's drafts are signed: warnings check against these
  const allergies: Allergy[] = useMemo(() => [...r.allergies.filter((a) => a.status === 'active' && !drafts.some((d) => d.function === 'allergy' && d.params.action === 'refute' && d.params.allergy_id === a.id)),
    ...drafts.filter((d) => d.function === 'allergy' && d.params.action === 'add').map((d) => { const q = d.params as Q; return { id: d.id, substance_name: q.substance?.name, class_code: q.substance?.class_code ?? null, kind: q.kind, reactions_text: q.reactions_text, severity: q.severity, status: 'active' } })], [r.allergies, drafts])
  const pendingOn = (id: string) => drafts.some((d) => d.function === 'medication' && d.params.medication_id === id)
  const meds: Medication[] = useMemo(() => [...r.medications.filter((m) => m.status === 'active' && !drafts.some((d) => d.function === 'medication' && d.params.action === 'stop' && d.params.medication_id === m.id)),
    ...drafts.filter((d) => d.function === 'medication' && d.params.action === 'start').map((d) => { const q = d.params as Q; return { id: d.id, drug_code: q.drug?.code ?? null, drug_name: q.drug?.name, dose_number: q.dose_number, dose_unit: q.dose_unit, route: q.route, frequency: q.frequency, prn: !!q.prn, problem_id: null, status: 'active', started_on: '' } })], [r.medications, drafts])

  /** open the card on an item; every opening is new, so an abandoned edit never comes back */
  const openSeed = (s: Seed) => { setText(''); setSeed(s); setEdited(null); setArmed(null); setSeedN((n) => n + 1); requestAnimationFrame(() => card.current?.querySelector<HTMLElement>('input, select, textarea')?.focus()) }
  // commands from the side lists and the keyboard: only ones sent while this patient is open
  useEffect(() => useComposer.subscribe((st, prev) => {
    const c = st.command; if (!c || c === prev.command) return
    if ('text' in c) { setSeed(null); setEdited(null); setText(c.text); setPick(-1); requestAnimationFrame(() => { const el = input.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } }) }
    else if ('seed' in c) openSeed(c.seed)
    else setDrawer(c.drawer)
  }), [])

  const key = seed ? `seed:${seedN}` : text
  const base: Expanded | null = useMemo(() => seed ? { items: seed.items, errors: [], label: seed.label } : expand(text, ctx, presets), [seed, text, ctx, presets])
  const items = edited?.key === key ? edited.items : base?.items ?? []
  const setItems = (next: Parsed[]) => { setEdited({ key, items: next }); setArmed(null) }
  const sugg = seed ? null : suggest(text, ctx, presets, new Set(r.problems.map((p) => p.name.toLowerCase())))
  const warningsOf = (p: Parsed): Warning[] => {
    const q = p.params as Q
    if (p.function === 'medication' && q.action !== 'stop' && q.drug?.name) return [...doseWarnings(q.drug.name, q.dose_number, q.dose_unit), ...drugWarnings(q.drug.name, allergies, meds, q.medication_id ?? seed?.draftId ?? null)]
    if (p.function === 'allergy' && q.action === 'add' && q.substance?.name) return allergyWarnings(q.substance.name, meds, q.substance.class_code)
    if (p.function === 'problem' && q.action === 'add' && q.name) { const d = duplicateProblem(q.name, r.problems); return d ? [{ level: 'caution', text: `${d.name} is already on the list — update it instead of adding it again.` }] : [] }
    return []
  }
  /** what a draft still needs before it can be added: the server would refuse it at Done, and the whole set with it */
  const missing = (p: Parsed): string | null => {
    const q = p.params as Q
    switch (p.function) {
      case 'vitals': return (q.systolic != null) !== (q.diastolic != null) ? 'Type both sides of the blood pressure' : Object.values(q).some((v) => v != null) ? null : 'Type at least one vital'
      case 'medication':
        if (q.action === 'stop') return null
        if (q.action === 'start' && !String(q.drug?.name ?? '').trim()) return 'Name the drug'
        if (q.send && !ctx.canSend) return 'There is no pharmacy here to send it to — leave out send'
        if (q.prn && !q.prn_reason_text) return 'Say what PRN is for'
        if (!q.frequency) return 'How often? — od, bd, tds, qds, prn …'
        if (q.dose_number != null && !q.dose_unit) return 'Say the unit — mg, units, ml, tab …'
        if (!q.route) return 'Say the route — po, iv, sc, im, inh …'
        return q.duration_days != null && !Number.isInteger(q.duration_days) ? 'Days are whole days' : null
      case 'problem': return q.action === 'add' && !String(q.name ?? '').trim() ? 'Name the problem' : null
      case 'allergy': return q.action === 'add' && !String(q.substance?.name ?? '').trim() ? 'Name the substance' : null
      case 'order': return q.service_id ? null : !q.to_department_id ? 'Choose the department' : !String(q.question_text ?? '').trim() ? 'Type the question' : null
      case 'note': return String(q.text ?? '').trim() ? null : 'The note is empty'
      case 'list_review': return q.list === 'allergies' && q.outcome === 'none_known' && allergies.length ? `Allergies are recorded (${allergies.map((a) => a.substance_name).join(', ')}), so not “no known allergies”` : null
    }
    return null
  }
  const warnings = items.flatMap(warningsOf)
  const blocking = warnings.filter((w) => w.level === 'block')
  const refused = items.find((p) => !can(p.action ?? FN_ACTION[p.function] ?? 'write:note')) ?? (base?.drawer && !can('write:note') ? { kind: 'note' } : undefined)
  const incomplete = items.map(missing).find(Boolean) ?? null
  const open = !!(seed || text.trim())

  function clear() { setText(''); setSeed(null); setEdited(null); setArmed(null); setPick(-1); setHi(-1) }
  function focusCard() { card.current?.querySelector<HTMLElement>('input, select, textarea')?.focus() }
  function accept(s: Suggestion) { setText(s.insert); setPick(-1); input.current?.focus() }
  const tagOf = (p: Parsed) => p.function === 'note' ? `note:${p.params.kind ?? 'progress'}` : p.tag     // a note joins the note of its kind
  /** add what the card holds; true when it was added (or there was nothing to add) */
  function commit(): boolean {
    if (!open) return true
    if (/^\/\s*$/.test(text) && !seed) { clear(); return true }                        // a stray "/" holds up nothing
    if (refused) return false
    if (base?.drawer && !items.length) { setDrawer({ ...base.drawer }); clear(); return false }
    if (!base || base.errors.length || !items.length || incomplete) return false
    if (blocking.length && armed !== key) { setArmed(key); return false }
    const st = useDrafts.getState()
    if (seed?.draftId) { const [p] = items; st.replace(patientId, seed.draftId, { function: p.function, params: p.params, line: p.line, kind: p.kind, tag: tagOf(p) }) }
    else for (const p of items) {
      if (p.function === 'allergy' && p.params.action === 'add') drafts.filter((d) => d.function === 'list_review' && d.params.list === 'allergies' && d.params.outcome === 'none_known').forEach((d) => st.remove(patientId, d.id))
      st.add(patientId, { id: p.id, function: p.function, params: p.params, line: p.line, kind: p.kind, tag: tagOf(p), append: p.append })
    }
    if (text.trim()) setHistory((h) => [text, ...h.filter((x) => x !== text)].slice(0, 30))
    clear(); input.current?.focus(); return true
  }
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus(), flush: () => { const ok = commit(); if (!ok) input.current?.focus(); return ok },
    slash: () => { if (!open) setText('/'); input.current?.focus() } }))   // "/" from anywhere: the command list, unless a line is under way
  function keyInput(e: React.KeyboardEvent<HTMLInputElement>) {
    const list = sugg?.items ?? []
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (pick >= 0 && list[pick]) accept(list[pick]); else commit() }
    else if (e.key === 'Tab' && !e.shiftKey && list.length) { e.preventDefault(); accept(list[Math.max(0, pick)]) }
    else if (e.key === 'Tab' && !e.shiftKey && items.length) { e.preventDefault(); focusCard() }
    else if (e.key === 'ArrowDown' && list.length) { e.preventDefault(); setPick((p) => Math.min(p + 1, list.length - 1)) }
    else if (e.key === 'ArrowUp' && list.length && pick >= 0) { e.preventDefault(); setPick((p) => p - 1) }
    else if (e.key === 'ArrowUp' && (text === '' || hi >= 0) && history.length) { e.preventDefault(); const n = Math.min(hi + 1, history.length - 1); setHi(n); setText(history[n]) }
    else if (e.key === 'ArrowDown' && hi >= 0) { e.preventDefault(); const n = hi - 1; setHi(n); setText(n >= 0 ? history[n] : '') }
    else if (e.key === 'Escape') { if (open) clear(); else input.current?.blur() }
  }
  function keyCard(e: React.KeyboardEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement
    if (e.key === 'Escape') { e.stopPropagation(); input.current?.focus() }
    else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || 'chip' in t.dataset || t.getAttribute('role') === 'radio' || (t.tagName === 'TEXTAREA' && !e.shiftKey))) { e.preventDefault(); commit() }  // a chip is clicked, not pressed: Enter adds
  }
  const editDraft = (d: Draft) => {
    if (d.function === 'note' && String(d.params.text ?? '').length > 120) { setDrawer({ kind: String(d.params.kind ?? 'progress'), text: String(d.params.text ?? ''), draftId: d.id }); return }
    openSeed({ label: 'Edit', items: [{ function: d.function, params: d.params, line: d.line, kind: d.kind ?? 'note', tag: d.tag }], draftId: d.id })
  }
  // the same drug or problem already on the list: offer to repeat, change or update it instead (never one already being changed or stopped)
  const one = items.length === 1 ? items[0] : null; const oq = (one?.params ?? {}) as Q; const typed = new Set(one?.typed ?? [])
  const dup = one?.function === 'medication' && oq.action === 'start' && can('write:medication') ? duplicateMedication(String(oq.drug?.name ?? ''), meds.filter((m) => m.started_on && !pendingOn(m.id))) : undefined
  const dupProblem = one?.function === 'problem' && oq.action === 'add' && can('write:problem') ? duplicateProblem(String(oq.name ?? ''), r.problems.filter((p) => !drafts.some((d) => d.params.problem_id === p.id))) : undefined
  const pickTyped = <T,>(k: string, typedValue: T, existing: T) => typed.has(k) ? typedValue : existing    // what the line said, else what is on the list
  function repeatDup(m: Medication) {
    const d = { function: 'medication', kind: 'prescription', params: { action: 'repeat', medication_id: m.id, drug: { code: m.drug_code, name: m.drug_name }, dose_number: m.dose_number, dose_unit: m.dose_unit, route: m.route, frequency: m.frequency }, line: `Repeat ${m.drug_name}` }
    if (seed?.draftId) useDrafts.getState().replace(patientId, seed.draftId, d); else useDrafts.getState().add(patientId, d)
    clear(); input.current?.focus()
  }
  function changeDup(m: Medication) {
    const prn = pickTyped('prn', !!oq.prn, m.prn)
    const s: Parsed = { function: 'medication', kind: 'prescription', line: '', params: { action: 'change', medication_id: m.id, drug: { code: m.drug_code, name: m.drug_name },
      dose_number: pickTyped('dose_number', oq.dose_number, m.dose_number), dose_unit: typed.has('dose_unit') ? oq.dose_unit : m.dose_unit ?? oq.dose_unit,
      route: pickTyped('route', oq.route, m.route), frequency: pickTyped('frequency', oq.frequency, m.frequency), prn, prn_reason_text: prn ? pickTyped('prn', oq.prn_reason_text, m.prn_reason_text ?? null) : null,
      instructions_text: pickTyped('instructions_text', oq.instructions_text, m.instructions_text ?? null) } }
    openSeed({ label: `Change ${m.drug_name}`, items: [{ ...s, line: lineOf(s) }], draftId: seed?.draftId })
  }
  function updateDup(p: NonNullable<typeof dupProblem>) {
    const s: Parsed = { function: 'problem', kind: 'problem', line: '', params: { action: 'update', problem_id: p.id, name: p.name, status: 'active',
      certainty: pickTyped('certainty', oq.certainty, p.certainty), onset_on: pickTyped('onset_on', oq.onset_on, p.onset_on), text: pickTyped('text', oq.text, p.note_text) } }
    openSeed({ label: `Update ${p.name}`, items: [{ ...s, line: lineOf(s) }], draftId: seed?.draftId })
  }
  const footer = blocking.length > 0 ? <span className="font-medium text-danger">{armed === key ? 'Enter again to go ahead despite the warning' : '↵ ↵ — twice, against the warning'}</span>
    : incomplete ? <span className="text-warn">{incomplete}</span> : null

  return <Card>
    <datalist id="oc-drugs">{DRUGS.map((d) => <option key={d.name} value={d.name} />)}</datalist>
    <datalist id="oc-problems">{PROBLEMS.map((p) => <option key={p.name} value={p.name}>{p.icd10}</option>)}</datalist>
    <datalist id="oc-allergens">{ALLERGENS.map((a) => <option key={a.name} value={a.name} />)}{DRUGS.map((d) => <option key={`d${d.name}`} value={d.name} />)}</datalist>
    <div className={cn('p-3', drafts.length > 0 && 'border-b border-line')}>
      <div className="relative">
        {seed && <span className="absolute start-2 top-1/2 z-raised -translate-y-1/2 rounded-md bg-accent-soft px-2 py-0.5 text-12 font-medium text-accent ring-1 ring-accent-line">{seed.label}</span>}
        <Input ref={input} value={seed ? '' : text} onChange={(e) => { setSeed(null); setEdited(null); setText(e.target.value); setHi(-1); setPick(-1) }} onKeyDown={keyInput} autoFocus spellCheck={false} aria-label="Composer"
          placeholder={seed ? '' : 'Type the note (hx: · ex: · plan:) — / for a command: /v /rx /dx /al /order /note — # for a preset'} className={cn('h-11 pe-24 font-mono text-14 placeholder:font-sans', seed && 'ps-40')} />
        <span className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-faint"><button onClick={() => setHelp(!help)} className={cn('rounded-sm px-1.5 text-12 hover:text-muted focus-ring', help && 'text-accent')} aria-label="Help">?</button><Kbd>/</Kbd></span>
      </div>
      {open && <div ref={card} onKeyDown={keyCard} className="mt-2 overflow-hidden rounded-xl bg-raised shadow-sm ring-1 ring-line">
        {sugg && <div className="grid gap-1.5 border-b border-line bg-sunken p-2 sm:grid-cols-2">{sugg.items.map((s, i) => { const on = pick === i || (pick < 0 && i === 0); const chosen = pick === i
          return <button key={s.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => accept(s)}
            className={cn('flex min-w-0 flex-col items-start rounded-lg bg-surface px-2.5 py-1.5 text-start ring-1 transition-colors', chosen ? 'ring-2 ring-accent' : on ? 'ring-accent-line' : 'ring-line hover:ring-line-strong')}>
            <span className="flex w-full items-center gap-2"><span className="truncate text-13 font-medium text-fg">{s.label}</span>{on && <Kbd className="ms-auto shrink-0 text-accent">{chosen ? '↵' : 'tab'}</Kbd>}</span>
            {s.detail && <span className="w-full truncate text-11 text-faint">{s.detail}</span>}</button> })}
          {items.length > 0 && pick < 0 && <p className="text-11 text-faint sm:col-span-2"><Kbd>tab</Kbd> takes the first · <Kbd>↓</Kbd> chooses · <Kbd>↵</Kbd> adds as typed: <span className="text-muted">{items.map((x) => x.line).join(' · ')}</span></p>}
          {/* what Enter would add as typed is still checked: its warnings show here too */}
          {pick < 0 && warnings.length > 0 && <ul className="grid gap-1 sm:col-span-2">{warnings.map((w, i) => <WarningItem key={i} w={w} />)}</ul>}
          {pick < 0 && footer && <p className="text-11 sm:col-span-2">{footer}</p>}</div>}
        {base?.errors.map((e) => <p key={e} className="px-3 pt-2 text-13 text-danger">{e}</p>)}
        {base?.skipped?.map((e) => <p key={e} className="px-3 pt-2 text-12 text-warn">Left out {e}</p>)}
        {refused && <p className="px-3 pt-2 text-13 text-danger">Your role cannot write a {refused.kind}.</p>}
        {base?.label && !seed && <p className="px-3 pt-2 text-12 font-medium text-faint">{base.label}{base.drawer && ' — Enter opens it beside the record'}</p>}
        {!sugg && <div className="divide-y divide-line">{items.map((p, i) => <CardItem key={`${key}:${i}`} item={p} ctx={ctx} warnings={warningsOf(p)}
          onChange={(n) => setItems(items.map((x, j) => j === i ? n : x))} onRemove={items.length > 1 ? () => setItems(items.filter((_, j) => j !== i)) : undefined}
          onLongNote={(kind, t) => { setDrawer({ kind, text: t, draftId: seed?.draftId }); clear() }}
          extra={i === 0 && (dup || dupProblem) ? <div className="mb-2 flex flex-wrap gap-1.5">
            {dup && <Button size="sm" variant="outline" onClick={() => repeatDup(dup)}>Repeat {dup.drug_name} as it is</Button>}
            {dup && <Button size="sm" variant="outline" onClick={() => changeDup(dup)}>Change its dose instead</Button>}
            {dupProblem && <Button size="sm" variant="outline" onClick={() => updateDup(dupProblem)}>Update {dupProblem.name}</Button>}
          </div> : undefined} />)}</div>}
        {!sugg && !items.length && !base?.drawer && !base?.errors.length && <p className="px-3 py-2 text-12 text-warn">{base?.label ?? 'Type a command after /, or write the note without it'}</p>}
        {!sugg && (items.length > 0 || base?.drawer) && <div className="flex items-center gap-3 border-t border-line px-3 py-2 text-11 text-faint">
          {footer ?? <span className="inline-flex items-center gap-1"><CornerDownLeft className="h-3 w-3" />{seed?.draftId ? 'save' : base?.drawer && !items.length ? 'open' : `add${items.length > 1 ? ` ${items.length}` : ''}`}</span>}
          <span><Kbd>tab</Kbd> edit fields</span><span><Kbd>esc</Kbd> {seed ? 'cancel' : 'clear'}</span>
          <span className="ms-auto">⌘↵ adds it and signs</span></div>}
      </div>}
      {help && !open && <table className="mt-3 w-full text-12"><tbody>{commandsFor(ctx).map((c) => <tr key={c.name}><td className="py-0.5 pe-4 font-mono text-fg">{c.example}</td><td className="text-muted">{c.label}</td></tr>)}
        <tr><td className="py-0.5 pe-4 font-mono text-fg">#dm · #soap …</td><td className="text-muted">a preset (Settings → Presets)</td></tr>
        <tr><td className="py-0.5 pe-4 font-mono text-fg">hx: … · ex: … · plan: …</td><td className="text-muted">a note line under that heading</td></tr>
        <tr><td className="py-0.5 pe-4 font-mono text-fg">anything else</td><td className="text-muted">today’s note</td></tr>
        <tr><td colSpan={2} className="pt-1.5 text-faint">A command alone (/rx, /v, /note) opens its card or the note beside the record · Tab takes a suggestion or moves into the card · ↑ recalls earlier lines · Alt+P / M / A · ⌘↵ adds and signs</td></tr></tbody></table>}
    </div>

    {drafts.length > 0 && <div className="px-3 py-2">
      <Heading count={drafts.length} tone="accent" className="mb-1">{r.visit?.kind === 'stay' ? 'This stay · signed on Sign' : 'This visit · signed on Done'}</Heading>
      <ul>{drafts.map((d) => { const q = d.params as Q
        // a drafted prescription is checked again against allergies recorded after it
        const clash = d.function === 'medication' && q.action !== 'stop' && q.drug?.name ? drugWarnings(q.drug.name, allergies, [], null).find((w) => w.level === 'block') : undefined
        return <li key={d.id} className="group flex items-start gap-2 py-1 text-13">
          <Badge tone={KIND_TONE[d.kind ?? ''] ?? 'neutral'} className="mt-0.5 w-20 justify-center">{d.kind ?? d.function.replace('write_', '')}</Badge>
          <button onClick={() => editDraft(d)} className="min-w-0 flex-1 whitespace-pre-wrap text-start hover:text-accent">{d.function === 'note' ? String(d.params.text) : d.line}
            {clash && <span className="mt-0.5 flex items-start gap-1 text-12 text-danger"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />{clash.text}</span>}</button>
          <span className="flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"><IconButton title="Edit" onClick={() => editDraft(d)}><Pencil className="h-3.5 w-3.5" /></IconButton>
            <IconButton title="Remove" onClick={() => useDrafts.getState().remove(patientId, d.id)}><X className="h-3.5 w-3.5" /></IconButton></span></li> })}</ul>
    </div>}

    {drawer && <NoteDrawer key={`${drawer.draftId ?? ''}|${drawer.kind}|${drawer.text}`} value={drawer} onClose={() => { setDrawer(null); input.current?.focus() }} onAdd={(kind, t) => {
      if (drawer.draftId) useDrafts.getState().replace(patientId, drawer.draftId, { function: 'note', kind: 'note', tag: `note:${kind}`, params: { kind, text: t }, line: t })
      else useDrafts.getState().add(patientId, { function: 'note', kind: 'note', tag: `note:${kind}`, append: true, params: { kind, text: t }, line: t })
      setDrawer(null); input.current?.focus()
    }} />}
  </Card>
})

/** a template's headings left empty are not kept */
const tidy = (t: string) => t.replace(/^(S|O|A|P|History|Examination):[ \t]*$\n?/gm, '').trim()
/** a long note beside the record, not over it: the record stays readable on the left */
function NoteDrawer({ value, onClose, onAdd }: { value: { kind: string; text: string; draftId?: string }; onClose: () => void; onAdd: (kind: string, text: string) => void }) {
  const [kind, setKind] = useState(value.kind); const [text, setText] = useState(value.text); const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const el = area.current; if (el) { el.focus(); const at = el.value.indexOf(': '); el.setSelectionRange(at >= 0 && !value.draftId ? at + 2 : el.value.length, at >= 0 && !value.draftId ? at + 2 : el.value.length) } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const ok = !!tidy(text)
  return <aside className="fixed inset-y-0 right-0 z-popover flex w-full max-w-md flex-col border-l border-line bg-raised shadow-md" role="dialog" aria-label="Note"
    onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (ok) onAdd(kind, tidy(text)) } }}>
    <div className="flex items-center gap-2 border-b border-line px-4 py-3">
      <Select value={kind} onChange={(e) => setKind(e.target.value)} className="h-8 w-56">{NOTE_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      <IconButton title="Close (Esc)" onClick={onClose} className="ml-auto"><X className="h-4 w-4" /></IconButton>
    </div>
    <textarea ref={area} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write the note…" className="min-h-0 flex-1 resize-none px-4 py-3 text-14 leading-relaxed focus:outline-none" />
    <div className="flex items-center gap-2 border-t border-line px-4 py-3"><span className="text-11 text-faint"><Kbd>⌘↵</Kbd> add · <Kbd>esc</Kbd> close</span>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!ok} onClick={() => onAdd(kind, tidy(text))}>{value.draftId ? 'Save' : 'Add to this visit'}</Button></div>
  </aside>
}
