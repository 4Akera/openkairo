import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { CornerDownLeft } from 'lucide-react'
import { useDepartment, worksFor } from '../../hooks/organization'
import { sendTarget } from './send'
import { useDrafts, useDraftsFor } from '../../hooks/drafts'
import { useComposer, type Seed } from '../../hooks/composer'
import type { Allergy, Medication, RecordView } from '../../db/types'
import { Button, Callout, Card, Chip, Input, Kbd, cn, ymd } from '../../ui'
import { ALLERGENS, DRUGS, PROBLEMS, allergyWarnings, doseWarnings, drugWarnings, duplicateMedication, duplicateProblem, type Warning } from './catalog'
import { expand, suggest, type Expanded, type Suggestion } from './expand'
import { SlashList } from './SlashList'
import { CardItem, WarningItem } from './Card'
import { lineOf, splitCommand, type Ctx, type Parsed } from './parse'
import { commandNamed, commandsFor } from './commands'
import { factMissing, standingOf } from './facts'
import { scoreMissing, tableOf, type ScoreParams } from './score'
import { useFacts } from '../../hooks/chart'
import { replyFormFor } from '../../renderers'

const FN_ACTION: Record<string, string> = { write_vitals: 'write:vitals', write_prescription: 'write:medication', write_request: 'write:order', write_problem: 'write:problem', write_allergy: 'write:allergy', write_note: 'write:note', write_list_review: 'write:list_review' }
type Q = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** focus the line; flush adds what is in it before Done (false: it could not — the card says why) */
export interface ComposerHandle { focus: () => void; flush: () => boolean; slash: () => void }

/** One composer (spec 05): type first; the card under the line shows what it will write and lets you change any field.
 *  The record panel, the draft blocks and the shortcuts open the same card. Nothing is written until Done. The drafts are drawn as
 *  blocks under it and the long note opens inline under the line (the chart's DraftBlocks and LongNote, chart-plan.md §2 #28–29). */
export const Composer = forwardRef<ComposerHandle, { r: RecordView; patientId: string; departmentId: string; can: (a: string) => boolean }>(function Composer({ r, patientId, departmentId, can }, ref) {
  const { org } = useDepartment()
  const drafts = useDraftsFor(patientId)
  const facts = useFacts(patientId)   // the standing pregnancy, breastfeeding and alerts: /preg, /bf and /alert change or end them
  const input = useRef<HTMLInputElement>(null); const card = useRef<HTMLDivElement>(null)
  const [text, setText] = useState(''); const [seed, setSeed] = useState<Seed | null>(null); const [seedN, setSeedN] = useState(0)
  const [edited, setEdited] = useState<{ key: string; items: Parsed[] } | null>(null)
  const [armed, setArmed] = useState<string | null>(null); const [pick, setPick] = useState(-1)
  const [history, setHistory] = useState<string[]>([]); const [hi, setHi] = useState(-1); const [help, setHelp] = useState(false)
  const openLongNote = useComposer((s) => s.openLongNote)

  const presets = useMemo(() => (org?.templates ?? []).filter((t) => !t.department_id || t.department_id === departmentId), [org, departmentId])
  const ctx: Ctx = useMemo(() => ({
    // a service another write creates (a pack's answer to a prescription sent on) is not ordered by hand
    // …and one whose department does not work for this one is refused (not_served), so it is not offered
    services: (org?.services ?? []).filter((x) => !replyFormFor(x.reply_type)?.automatic && worksFor(org, x.department_id, departmentId)), templates: presets, departments: org?.departments ?? [], departmentId,
    // a pack's commands only where this department uses the pack; typed elsewhere, the card says where (§5.1 rule 1)
    can, packs: org?.departments.find((x) => x.id === departmentId)?.packs ?? [], usedIn: (pack: string) => (org?.departments ?? []).filter((x) => x.packs.includes(pack)).map((x) => x.name),
    noteKind: can('write:medication') ? 'progress' : can('write:vitals') ? 'nurse' : 'progress',   // a nurse's lines are nurse notes
    send: can('write:medication') ? sendTarget(org, departmentId)?.words ?? null : null,   // a pack answers prescriptions from here: its words
    departmentType: org?.departments.find((x) => x.id === departmentId)?.type, packCards: org?.departments.find((x) => x.id === departmentId)?.pack_cards ?? true,
    problems: [...r.problems.map((p) => ({ id: p.id, name: p.name })), ...drafts.filter((d) => d.function === 'problem' && d.params.action === 'add').map((d) => ({ id: d.id, name: String(d.params.name) }))],
    facts: standingOf(facts.data, org?.types, ymd(new Date().toISOString())), scores: org?.scores ?? [],
    record: { patient: r.patient, values: r.values, medications: r.medications, allergies: r.allergies, allergy_review: r.allergy_review },   // what the chart already shows, for a pack's order card
    org,   // the clinic's settings, for a pack's line under the /rx and /v cards (C1)
    // the departments that work for this one: a pack's command that is not an order is offered by works for (C3, /transfuse)
    servedBy: (org?.allDepartments ?? []).filter((x) => x.id !== departmentId && worksFor(org, x.id, departmentId)).map((x) => x.id),
  }), [org, presets, departmentId, r.problems, r.patient, r.values, r.medications, r.allergies, r.allergy_review, drafts, can, facts.data])

  // what the lists hold once this visit's drafts are signed: warnings check against these
  const allergies: Allergy[] = useMemo(() => [...r.allergies.filter((a) => a.status === 'active' && !drafts.some((d) => d.function === 'allergy' && d.params.action === 'refute' && d.params.allergy_id === a.id)),
    ...drafts.filter((d) => d.function === 'allergy' && d.params.action === 'add').map((d) => { const q = d.params as Q; return { id: d.id, substance_name: q.substance?.name, class_code: q.substance?.class_code ?? null, kind: q.kind, reactions_text: q.reactions_text, severity: q.severity, status: 'active' } })], [r.allergies, drafts])
  const pendingOn = (id: string) => drafts.some((d) => d.function === 'medication' && d.params.medication_id === id)
  const meds: Medication[] = useMemo(() => [...r.medications.filter((m) => m.status === 'active' && !drafts.some((d) => d.function === 'medication' && d.params.action === 'stop' && d.params.medication_id === m.id)),
    ...drafts.filter((d) => d.function === 'medication' && d.params.action === 'start').map((d) => { const q = d.params as Q; return { id: d.id, drug_code: q.drug?.code ?? null, drug_name: q.drug?.name, dose_number: q.dose_number, dose_unit: q.dose_unit, route: q.route, frequency: q.frequency, prn: !!q.prn, problem_id: null, status: 'active', started_on: '' } })], [r.medications, drafts])

  /** open the card on an item; every opening is new, so an abandoned edit never comes back */
  const openSeed = (s: Seed) => { setText(''); setSeed(s); setEdited(null); setArmed(null); setSeedN((n) => n + 1); requestAnimationFrame(() => card.current?.querySelector<HTMLElement>('input, select, textarea')?.focus()) }
  // commands from the record panel, the drafts and the keyboard: only ones sent while this patient is open (the long note has its own slot)
  useEffect(() => useComposer.subscribe((st, prev) => {
    const c = st.command; if (!c || c === prev.command) return
    if ('text' in c) { setSeed(null); setEdited(null); setText(c.text); setPick(-1); requestAnimationFrame(() => { const el = input.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } }) }
    else if ('seed' in c) openSeed(c.seed)
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
        if (q.send && !ctx.send) return 'Nothing here answers prescriptions — leave out send'
        if (q.prn && !q.prn_reason_text) return 'Say what PRN is for'
        if (!q.frequency) return 'How often? — od, bd, tds, qds, prn …'
        if (q.dose_number != null && !q.dose_unit) return 'Say the unit — mg, units, ml, tab …'
        if (!q.route) return 'Say the route — po, iv, sc, im, inh …'
        return q.duration_days != null && !Number.isInteger(q.duration_days) ? 'Days are whole days' : null
      case 'problem': return q.action === 'add' && !String(q.name ?? '').trim() ? 'Name the problem' : null
      case 'allergy': return q.action === 'add' && !String(q.substance?.name ?? '').trim() ? 'Name the substance' : null
      case 'order': return q.service_id ? null : Array.isArray(q.choices) ? `Choose which “${q.word}” you mean` : !q.to_department_id ? 'Choose the department' : !String(q.question_text ?? '').trim() ? 'Type the question' : null
      case 'note': return String(q.text ?? '').trim() ? null : 'The note is empty'
      case 'pregnancy': case 'breastfeeding': case 'alert': return factMissing(p, ymd(new Date().toISOString()))
      case 'score': return scoreMissing(q as ScoreParams, tableOf(ctx.scores, q.score, q.version))
      case 'list_review': return q.list === 'allergies' && q.outcome === 'none_known' && allergies.length ? `Allergies are recorded (${allergies.map((a) => a.substance_name).join(', ')}), so not “no known allergies”` : null
    }
    return null
  }
  const warnings = items.flatMap(warningsOf)
  // the command's own line under what the card holds (the lab's tubes and fasting)
  const typedCmd = !seed && text.trimStart().startsWith('/') ? commandNamed(splitCommand(text)[0], ctx) : undefined
  const note = typedCmd?.note && items.length ? typedCmd.note(items, ctx) : null
  // a word that fits more than one test (never guessed): its choices; one chosen puts its code in the line
  const asks = items.filter((p) => p.function === 'order' && !p.params.service_id && Array.isArray(p.params.choices))
  // the word still being typed is not asked about while its suggestions show: only a finished word is
  const typing = sugg ? (text.split(/[,\s]+/).pop() ?? '').toLowerCase() : ''
  const typingAsk = (p: Parsed) => !!typing && asks.includes(p) && String(p.params.word ?? '').toLowerCase() === typing
  const settled = items.filter((p) => !typingAsk(p))
  function choose(p: Parsed, id: string) {
    const code = ctx.services.find((x) => x.id === id)?.code; const w = String(p.params.word ?? ''); const i = text.toLowerCase().lastIndexOf(w.toLowerCase())
    if (!code || !w || i < 0) return
    setText(text.slice(0, i) + code + text.slice(i + w.length)); setEdited(null); setPick(-1); input.current?.focus()
  }
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
    if (base?.drawer && !items.length) { openLongNote({ ...base.drawer }); clear(); return false }
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
  // under the suggestions: the same, less what the word still being typed would ask
  const settledMissing = settled.map(missing).find(Boolean) ?? null
  const suggFooter = blocking.length > 0 ? footer : settledMissing ? <span className="text-warn">{settledMissing}</span> : null

  return <Card>
    <datalist id="oc-drugs">{DRUGS.map((d) => <option key={d.name} value={d.name} />)}</datalist>
    <datalist id="oc-problems">{PROBLEMS.map((p) => <option key={p.name} value={p.name}>{p.icd10}</option>)}</datalist>
    <datalist id="oc-allergens">{ALLERGENS.map((a) => <option key={a.name} value={a.name} />)}{DRUGS.map((d) => <option key={`d${d.name}`} value={d.name} />)}</datalist>
    <div className="p-3">
      <div className="relative">
        {seed && <span className="absolute start-2 top-1/2 z-raised -translate-y-1/2 rounded-md bg-accent-soft px-2 py-0.5 text-12 font-medium text-accent ring-1 ring-accent-line">{seed.label}</span>}
        <Input ref={input} value={seed ? '' : text} onChange={(e) => { setSeed(null); setEdited(null); setText(e.target.value); setHi(-1); setPick(-1) }} onKeyDown={keyInput} autoFocus spellCheck={false} aria-label="Composer"
          placeholder={seed ? '' : 'Write a note · / commands · # presets'} className={cn('h-11 pe-24 font-mono text-14 placeholder:font-sans', seed && 'ps-40')} />
        <span className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-faint"><button onClick={() => setHelp(!help)} className={cn('rounded-sm px-1.5 text-12 hover:text-muted focus-ring', help && 'text-accent')} aria-label="Help">?</button><Kbd>/</Kbd></span>
      </div>
      {open && <div ref={card} onKeyDown={keyCard} className="mt-2 overflow-hidden rounded-xl bg-raised shadow-sm ring-1 ring-line">
        {sugg && sugg.items[0]?.group && <SlashList items={sugg.items} pick={pick} onAccept={accept} />}
        {sugg && !sugg.items[0]?.group && <div className={cn('border-b border-line bg-sunken', sugg.list ? 'flex flex-col gap-0.5 p-1.5' : 'grid gap-1.5 p-2 sm:grid-cols-2')}>{sugg.items.map((s, i) => { const on = pick === i || (pick < 0 && i === 0); const chosen = pick === i
          // an order's tests: one per row, as the picture (the list narrows as it is typed; tab takes the first)
          if (sugg.list) return <button key={s.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => accept(s)}
            className={cn('flex w-full min-w-0 items-center gap-3 rounded-md px-2.5 py-1 text-start transition-colors focus-ring', chosen ? 'bg-surface ring-2 ring-accent' : on ? 'bg-surface ring-1 ring-accent-line' : 'hover:bg-hover')}>
            <span className="grid min-w-0 flex-1"><span className="truncate text-13 text-fg">{s.label}</span>{s.detail && <span className="truncate text-11 text-faint">{s.detail}</span>}</span>
            {s.swatch && <span aria-hidden className="inline-block h-3.5 w-2.5 shrink-0 rounded-sm ring-1 ring-inset ring-line-strong" style={{ background: s.swatch }} />}
            {on ? <Kbd className="shrink-0 text-accent">{chosen ? '↵' : 'tab'}</Kbd> : <span className="w-7 shrink-0" />}</button>
          return <button key={s.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => accept(s)}
            className={cn('flex min-w-0 flex-col items-start rounded-lg bg-surface px-2.5 py-1.5 text-start ring-1 transition-colors', chosen ? 'ring-2 ring-accent' : on ? 'ring-accent-line' : 'ring-line hover:ring-line-strong')}>
            <span className="flex w-full items-center gap-2"><span className="truncate text-13 font-medium text-fg">{s.label}</span>{on && <Kbd className="ms-auto shrink-0 text-accent">{chosen ? '↵' : 'tab'}</Kbd>}</span>
            {s.detail && <span className="w-full truncate text-11 text-faint">{s.detail}</span>}</button> })}
          {settled.length > 0 && pick < 0 && <p className="text-11 text-faint sm:col-span-2"><Kbd>tab</Kbd> takes the first · <Kbd>↓</Kbd> chooses · <Kbd>↵</Kbd> adds as typed: <span className="text-muted">{settled.map((x) => x.line).join(' · ')}</span></p>}
          {pick < 0 && asks.filter((p) => !typingAsk(p)).map((p) => <div key={String(p.params.word)} role="group" aria-label={`Which “${String(p.params.word)}”`} className="flex flex-wrap items-center gap-1.5 sm:col-span-2">
            <span className="text-12 text-warn">“{String(p.params.word)}” fits {(p.params.choices as string[]).length}: which?</span>
            {(p.params.choices as string[]).map((id) => <Chip key={id} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p, id)}>{ctx.services.find((x) => x.id === id)?.name ?? id}</Chip>)}</div>)}
          {pick < 0 && note && <div className="text-12 text-muted sm:col-span-2">{note}</div>}
          {/* what Enter would add as typed is still checked: its warnings show here too */}
          {pick < 0 && warnings.length > 0 && <ul className="grid gap-1 sm:col-span-2">{warnings.map((w, i) => <WarningItem key={i} w={w} />)}</ul>}
          {pick < 0 && suggFooter && <p className="text-11 sm:col-span-2">{suggFooter}</p>}</div>}
        {base?.errors.map((e) => <p key={e} className="px-3 pt-2 text-13 text-danger">{e}</p>)}
        {base?.skipped?.map((e) => <p key={e} className="px-3 pt-2 text-12 text-warn">Left out {e}</p>)}
        {refused && <p className="px-3 pt-2 text-13 text-danger">Your role cannot write a {refused.kind}.</p>}
        {base?.hint && <Callout tone="info" className="mx-3 mt-2">{base.hint}</Callout>}
        {base?.label && !seed && <p className="px-3 pt-2 text-12 font-medium text-faint">{base.label}{base.drawer && ' — Enter opens it under the line'}</p>}
        {!sugg && <div className="divide-y divide-line">{items.map((p, i) => <CardItem key={`${key}:${i}`} item={p} ctx={ctx} warnings={warningsOf(p)}
          onChange={(n) => setItems(items.map((x, j) => j === i ? n : x))} onRemove={items.length > 1 ? () => setItems(items.filter((_, j) => j !== i)) : undefined}
          onLongNote={(kind, t) => { openLongNote({ kind, text: t, draftId: seed?.draftId }); clear() }}
          extra={i === 0 && (dup || dupProblem) ? <div className="mb-2 flex flex-wrap gap-1.5">
            {dup && <Button size="sm" variant="outline" onClick={() => repeatDup(dup)}>Repeat {dup.drug_name} as it is</Button>}
            {dup && <Button size="sm" variant="outline" onClick={() => changeDup(dup)}>Change its dose instead</Button>}
            {dupProblem && <Button size="sm" variant="outline" onClick={() => updateDup(dupProblem)}>Update {dupProblem.name}</Button>}
          </div> : undefined} />)}</div>}
        {!sugg && note && <div className="border-t border-line px-3 py-2 text-12 text-muted">{note}</div>}
        {!sugg && !items.length && !base?.drawer && !base?.errors.length && !base?.hint && !base?.label && <p className="px-3 py-2 text-12 text-warn">{base?.label ?? 'Type a command after /, or write the note without it'}</p>}
        {!sugg && (items.length > 0 || base?.drawer) && <div className="flex items-center gap-3 border-t border-line px-3 py-2 text-11 text-faint">
          {footer ?? <span className="inline-flex items-center gap-1"><CornerDownLeft className="h-3 w-3" />{seed?.draftId ? 'save' : base?.drawer && !items.length ? 'open' : `add${items.length > 1 ? ` ${items.length}` : ''}`}</span>}
          <span><Kbd>tab</Kbd> edit fields</span><span><Kbd>esc</Kbd> {seed ? 'cancel' : 'clear'}</span>
          <span className="ms-auto">⌘↵ adds it and signs</span></div>}
      </div>}
      {help && !open && <table className="mt-3 w-full text-12"><tbody>{commandsFor(ctx).map((c) => <tr key={c.name}><td className="py-0.5 pe-4 font-mono text-fg">{c.example}</td><td className="text-muted">{c.label}</td></tr>)}
        <tr><td className="py-0.5 pe-4 font-mono text-fg">#dm · #soap …</td><td className="text-muted">a preset (Settings → Presets)</td></tr>
        <tr><td className="py-0.5 pe-4 font-mono text-fg">hx: … · ex: … · plan: …</td><td className="text-muted">a note line under that heading</td></tr>
        <tr><td className="py-0.5 pe-4 font-mono text-fg">anything else</td><td className="text-muted">today’s note</td></tr>
        <tr><td colSpan={2} className="pt-1.5 text-faint">A command alone (/rx, /v, /note) opens its card, or the long note under the line · Tab takes a suggestion or moves into the card · ↑ recalls earlier lines · Alt+P / M / A · ⌘↵ adds and signs</td></tr></tbody></table>}
    </div>
  </Card>
})
