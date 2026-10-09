// The vaccination room's walk-in (spec/openCare.md §5.8, Q26; picture #vax-room): the bench's two steps side by side. First who — one
// search by name, phone or record number, or New patient (the desk's card, here). Then what for — what is due today by the schedule as
// chips (national, then the parents' choice), and the earlier doses on the mother's MOHP card, ticked with the card's dates to copy them
// first; Start checks the child in here and opens the visit with each dose drafted, to be given with its lot and site, and Done.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { usePatientSearch } from '@core/hooks/reads'
import { useWrite } from '@core/hooks/writes'
import { useDrafts } from '@core/hooks/drafts'
import { checkIn, oneSet } from '@core/db/entries'
import type { Department, Identity, PatientHit } from '@core/db/types'
import { NewPatient } from '@core/shell/NewPatient'
import { Button, Card, Chip, Input, Kbd, cn, errorText, shortDate, ymd } from '@core/ui'
import { doseDraft, seriesOf } from './line'
import { ageWords, whatFor, type Dose, type RowState, type Schedule } from './schedule'

const LABEL = 'text-11 font-semibold uppercase tracking-[0.06em] text-faint'
const fullName = (p: Pick<PatientHit, 'given_name' | 'family_name'>) => `${p.given_name} ${p.family_name}`

export function VaxWalkIn({ dept, schedule, known, onClose, onStarted }: { dept: Department; schedule: Schedule; known: Map<string, { doses: Dose[]; identity: Identity | null }>
  onClose: () => void; onStarted: (visitId: string) => void }) {
  const w = useWrite()
  const [q, setQ] = useState(''); const [d, setD] = useState(''); const [cursor, setCursor] = useState(0)
  useEffect(() => { const t = setTimeout(() => setD(q), 120); return () => clearTimeout(t) }, [q])
  const hits = usePatientSearch(null, d)
  const [who, setWho] = useState<PatientHit | null>(null); const [creating, setCreating] = useState(false)
  const box = useRef<HTMLInputElement>(null)
  const list = d.trim().length >= 2 ? hits.data ?? [] : []
  const c = Math.min(cursor, Math.max(0, list.length - 1))
  const settled = q === d && !hits.isPlaceholderData
  const nobody = settled && d.trim().length >= 2 && hits.isSuccess && !list.length
  const choose = (p: PatientHit) => { setWho(p); setCreating(false); w.reset() }
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!list.length) return; e.preventDefault(); setCursor(Math.max(0, Math.min(list.length - 1, c + (e.key === 'ArrowDown' ? 1 : -1)))) }
    else if (e.key === 'Enter') { e.preventDefault(); if (!settled) return; if (list[c]) choose(list[c]); else if (nobody) setCreating(true) }
    else if (e.key === 'Escape' && q) { e.preventDefault(); e.stopPropagation(); setQ(''); setD('') }
  }
  return <div role="group" aria-label="New walk-in" className="grid gap-3 md:grid-cols-2 md:items-start" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); if (creating) setCreating(false); else onClose() } }}>
    <Card className="grid content-start gap-2 p-4 ring-1 ring-accent-line">
      <div className="flex items-center gap-2"><p className={LABEL}>First · who</p><span className="text-12 text-faint">name, phone or record number</span>
        <button type="button" onClick={onClose} aria-label="Close the walk-in" className="ms-auto inline-flex items-center gap-1 rounded-md px-1 text-faint hover:text-fg focus-ring"><Kbd>esc</Kbd><X className="size-3.5" /></button></div>
      {creating ? <NewPatient seed={q} orgId="" submitLabel="Register" onDone={choose} onCancel={() => { setCreating(false); box.current?.focus() }} />
        : who ? <p className="flex flex-wrap items-baseline gap-2 rounded-lg bg-accent-soft px-3 py-2 text-14"><span className="font-mono text-12 text-faint">#{who.record_number}</span>
            <span className="font-medium text-fg">{fullName(who)}</span><span className="text-12 text-muted">{ageWords(who.born_on, ymd(new Date().toISOString()))} {who.sex?.[0]?.toUpperCase()}{who.phone_text ? ` · ${who.phone_text}` : ''}</span>
            <button type="button" onClick={() => { setWho(null); requestAnimationFrame(() => box.current?.focus()) }} className="ms-auto rounded-sm text-12 text-accent hover:underline focus-ring">change</button></p>
        : <>
          <Input ref={box} autoFocus value={q} onChange={(e) => { setQ(e.target.value); setCursor(0) }} onKeyDown={onSearchKey} aria-label="Find the child — ↑↓ choose · ↵ pick" className="h-11 text-16" />
          <ul role="listbox" aria-label="Patients found" className="grid">
            {list.map((p, i) => <li key={p.id} role="option" aria-selected={i === c}>
              <button type="button" tabIndex={-1} onClick={() => choose(p)} className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2 text-start focus-ring', i === c ? 'rail bg-hover' : 'hover:bg-hover')}>
                <span className="font-mono text-12 text-faint">{p.record_number}</span><span className="text-14 font-medium text-fg">{fullName(p)}</span>
                <span className="text-12 text-muted">{ageWords(p.born_on, ymd(new Date().toISOString()))} {p.sex?.[0]?.toUpperCase()}{p.phone_text ? ` · ${p.phone_text}` : ''}</span>
                <span className="ms-auto text-12 text-faint">{known.has(p.id) ? 'known here' : 'never here'}</span>{i === c && <Kbd className="text-accent">↵</Kbd>}</button></li>)}
            {d.trim().length >= 2 && <li><button type="button" tabIndex={-1} onClick={() => setCreating(true)} className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-13 text-accent focus-ring', nobody ? 'bg-accent-soft font-medium' : 'hover:bg-hover')}>
              <Plus className="size-4" />New patient “{q.trim()}”<span className="text-12 text-faint"> — the desk&apos;s card, here</span>{nobody && <Kbd className="ms-auto">↵</Kbd>}</button></li>}
          </ul>
          {nobody && <p className="px-1 text-13 text-faint">Nobody found for “{d.trim()}”.</p>}
          {hits.error && <p className="px-1 text-13 text-danger">{errorText(hits.error)}</p>}
        </>}
    </Card>
    <Card className={cn('grid content-start gap-3 p-4 ring-1', who ? 'ring-accent-line' : 'ring-line')}>
      <div className="flex items-center gap-2"><p className={LABEL}>Then · what for</p>{who && <span className="ms-auto text-13 text-fg">{fullName(who)}</span>}</div>
      {who ? <WhatFor key={who.id} who={who} dept={dept} schedule={schedule} doses={known.get(who.id)?.doses ?? []} busy={w.isPending} error={w.error}
        onStart={(drafts) => { const e = checkIn(who.id, dept.id, dept.id, { reason: 'vaccines' })
          w.mutate(oneSet([e]), { onSuccess: () => { const st = useDrafts.getState(); for (const x of drafts) st.add(who.id, { function: x.function, params: x.params, line: x.line, kind: x.kind }); onStarted(e.id) } }) }} />
        : <p className="text-13 text-faint">Pick the child first.</p>}
    </Card>
  </div>
}

function WhatFor({ who, schedule, doses, busy, error, onStart }: { who: PatientHit; dept: Department; schedule: Schedule; doses: Dose[]; busy: boolean; error: unknown
  onStart: (drafts: ReturnType<typeof doseDraft>[]) => void }) {
  const today = ymd(new Date().toISOString())
  const w = useMemo(() => whatFor(schedule, who.born_on, doses, today), [schedule, who.born_on, doses, today])
  const national = w.now.filter((x) => x.row.national); const optional = w.now.filter((x) => !x.row.national)
  const [on, setOn] = useState<Set<string>>(() => new Set(national.map((x) => x.row.key)))
  const [card, setCard] = useState<Set<string>>(() => new Set())
  const toggle = (set: Set<string>, put: (s: Set<string>) => void, k: string) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); put(n) }
  const draftOf = (x: RowState, fromCard: boolean) => { const s = seriesOf(x.row.vaccine) ?? { key: x.row.vaccine, name: x.row.name, aliases: [], route: x.row.route, site: x.row.site }
    return doseDraft({ ...s, route: x.row.route ?? s.route, site: x.row.site ?? s.site }, x.row.dose, fromCard ? { source: 'card', given_on: x.dueOn } : {}) }
  const chosen = w.now.filter((x) => on.has(x.row.key)); const copies = w.earlier.filter((x) => card.has(x.row.key))
  const start = () => { if (chosen.length && !busy) onStart([...copies.map((x) => draftOf(x, true)), ...chosen.map((x) => draftOf(x, false))]) }
  const ageLabel = ageWords(who.born_on, today)
  if (!schedule.rows.length) return <p className="text-13 text-warn">No schedule is loaded yet.</p>
  return <div className="grid gap-2" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); start() } }}>
    <p className={LABEL}>Due today · {ageLabel} · national</p>
    <div className="flex flex-wrap gap-1.5">{national.length ? national.map((x) => <Chip key={x.row.key} variant="check" on={on.has(x.row.key)} onClick={() => toggle(on, setOn, x.row.key)}>{x.row.name}</Chip>)
      : <span className="text-13 text-faint">nothing national due today</span>}</div>
    {(optional.length > 0 || w.tooLate.length > 0) && <><p className={LABEL}>Optional · the parents&apos; choice</p>
      <div className="flex flex-wrap items-center gap-1.5">{optional.map((x) => <Chip key={x.row.key} variant="check" on={on.has(x.row.key)} onClick={() => toggle(on, setOn, x.row.key)}>{x.row.name} {x.row.dose}</Chip>)}
        {w.tooLate.map((x) => <span key={x.row.key} className="text-12 text-faint">{x.row.name.toLowerCase()} {x.row.dose}: past the age for it</span>)}</div></>}
    {w.earlier.length > 0 && <><p className={LABEL}>Earlier doses · from the MOHP card</p>
      <div className="flex flex-wrap items-center gap-1.5">{w.earlier.map((x) => <Chip key={x.row.key} variant="check" on={card.has(x.row.key)} onClick={() => toggle(card, setCard, x.row.key)}>{x.row.age} · {x.row.name} · {shortDate(x.dueOn)}</Chip>)}
        <span className="text-12 text-faint">ticked as the card shows them; its dates can be changed in the visit</span></div></>}
    <p className="text-12 text-muted">Ask first: fever today, a reaction last time.</p>
    {!!error && <p className="text-13 text-danger">{errorText(error)}</p>}
    <div className="flex flex-wrap items-center gap-2"><Button onClick={start} disabled={!chosen.length} loading={busy}>Start · {chosen.length} {chosen.length === 1 ? 'vaccine' : 'vaccines'}<Kbd className="ms-1 max-sm:hidden">⌘↵</Kbd></Button>
      <span className="text-12 text-faint">The visit opens with each dose drafted, to give with its lot and site; it stays in the record.</span></div>
  </div>
}
