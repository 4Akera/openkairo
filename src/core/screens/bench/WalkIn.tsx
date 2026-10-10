// The walk-in card (spec/openCare.md §5.3; the owner chose this shape, C, from pictures on 2026-10-07): two steps side by side, inline
// above the list (never over it). First who — one search by name, phone or record number; ↑↓ ↵ picks, or New patient (the desk's
// card, here). Then what for (WhatFor.tsx, the same in the desk's patient card) — the bench's own services as big buttons, any number;
// who asked folded and optional. Start writes one order per service for this bench (walkins.ts); the patient joins To do. Esc closes.
import { createElement, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { usePatientSearch } from '../../hooks/reads'
import { useWrite } from '../../hooks/writes'
import { oneSet } from '../../db/entries'
import { ageWords } from '../../db/views'
import type { Department, PatientHit, Service } from '../../db/types'
import { Card, Input, Kbd, cn, errorText } from '../../ui'
import { NewPatient } from '../../shell/NewPatient'
import { walkInOrders } from './walkins'
import { useWalkInPart, walkInStepFor } from './WhatFor'

const LABEL = 'text-11 font-semibold uppercase tracking-[0.06em] text-faint'
const fullName = (p: Pick<PatientHit, 'given_name' | 'family_name'>) => `${p.given_name} ${p.family_name}`

export function WalkIn({ dept, onClose, onStarted }: { dept: Department; onClose: () => void; onStarted: (said: string) => void }) {
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
  const part = useWalkInPart(dept, who?.id ?? null)   // a pack's part after what for (a diary's when), core change (j)
  const [starting, setStarting] = useState(false)   // from Start until the part has done its own (a second Start never writes twice)
  const start = (services: Service[], askedBy?: string) => {
    if (!who || starting) return
    const es = walkInOrders({ patientId: who.id, from: dept.id, to: dept.id, services, askedBy }); setStarting(true)
    w.mutate(oneSet(es), { onError: () => setStarting(false), onSuccess: async () => {
      const more = await part.after({ from: dept.id, orders: es.map((e, i) => ({ id: e.id!, service: services[i] })) }).catch((x: unknown) => `not booked: ${errorText(x)}`)
      setStarting(false); onStarted(`${fullName(who)} · ${services.map((s) => s.name).join(', ')}${more ? ` · ${more}` : ''}`) } })
  }
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!list.length) return; e.preventDefault(); setCursor(Math.max(0, Math.min(list.length - 1, c + (e.key === 'ArrowDown' ? 1 : -1)))) }
    else if (e.key === 'Enter') { e.preventDefault(); if (!settled) return; if (list[c]) choose(list[c]); else if (nobody) setCreating(true) }
    else if (e.key === 'Escape' && q) { e.preventDefault(); e.stopPropagation(); setQ(''); setD('') }
  }
  const onCardKey = (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Escape') { e.stopPropagation(); if (creating) setCreating(false); else onClose() } }

  return <div role="group" aria-label="New walk-in" className="grid gap-3 md:grid-cols-2 md:items-start" onKeyDown={onCardKey}>
    <Card className="grid content-start gap-2 p-4 ring-1 ring-accent-line">
      <div className="flex items-center gap-2"><p className={LABEL}>First · who</p><span className="text-12 text-faint">name, phone or record number</span>
        <button type="button" onClick={onClose} aria-label="Close the walk-in" className="ms-auto inline-flex items-center gap-1 rounded-md px-1 text-faint hover:text-fg focus-ring"><Kbd>esc</Kbd><X className="size-3.5" /></button></div>
      {creating ? <NewPatient seed={q} orgId="" submitLabel="Register" onDone={choose} onCancel={() => { setCreating(false); box.current?.focus() }} />
        : who ? <p className="flex flex-wrap items-baseline gap-2 rounded-lg bg-accent-soft px-3 py-2 text-14"><span className="font-mono text-12 text-faint">#{who.record_number}</span>
            <span className="font-medium text-fg">{fullName(who)}</span><span className="text-12 text-muted">{ageWords(who.born_on) || who.age} {who.sex?.[0]?.toUpperCase()}{who.phone_text ? ` · ${who.phone_text}` : ''}</span>
            <button type="button" onClick={() => { setWho(null); requestAnimationFrame(() => box.current?.focus()) }} className="ms-auto rounded-sm text-12 text-accent hover:underline focus-ring">change</button></p>
        : <>
          <Input ref={box} autoFocus value={q} onChange={(e) => { setQ(e.target.value); setCursor(0) }} onKeyDown={onSearchKey} aria-label="Find the patient — ↑↓ choose · ↵ pick" className="h-11 text-16" />
          <ul role="listbox" aria-label="Patients found" className="grid">
            {list.map((p, i) => <li key={p.id} role="option" aria-selected={i === c}>
              <button type="button" tabIndex={-1} onClick={() => choose(p)} className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2 text-start focus-ring', i === c ? 'rail bg-hover' : 'hover:bg-hover')}>
                <span className="font-mono text-12 text-faint">{p.record_number}</span><span className="text-14 font-medium text-fg">{fullName(p)}</span>
                <span className="text-12 text-muted">{ageWords(p.born_on) || p.age} {p.sex?.[0]?.toUpperCase()}{p.phone_text ? ` · ${p.phone_text}` : ''}</span>
                {i === c && <Kbd className="ms-auto text-accent">↵</Kbd>}</button></li>)}
            {d.trim().length >= 2 && <li><button type="button" tabIndex={-1} onClick={() => setCreating(true)} className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-13 text-accent focus-ring', nobody ? 'bg-accent-soft font-medium' : 'hover:bg-hover')}>
              <Plus className="size-4" />New patient “{q.trim()}”{nobody && <Kbd className="ms-auto">↵</Kbd>}</button></li>}
          </ul>
          {nobody && <p className="px-1 text-13 text-faint">Nobody found for “{d.trim()}”.</p>}
          {hits.error && <p className="px-1 text-13 text-danger">{errorText(hits.error)}</p>}
        </>}
    </Card>
    <Card className={cn('grid content-start gap-3 p-4 ring-1', who ? 'ring-accent-line' : 'ring-line')}>
      <p className={LABEL}>Then · what for</p>
      {/* the bench's packs may give their own step (the registry's, so drawn by createElement, never defined here) */}
      {who ? createElement(walkInStepFor(dept.packs), { key: who.id, bench: dept, busy: w.isPending || starting, error: w.error, onStart: start, note: 'They join To do like any order; it stays in the record.',
          extra: part.extra, start: part.start })
        : <p className="text-13 text-faint">Pick the patient first.</p>}
    </Card>
  </div>
}
