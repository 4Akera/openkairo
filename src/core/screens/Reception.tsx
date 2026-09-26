import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { usePatientSearch } from '../hooks/reads'
import { useDepartment } from '../hooks/organization'
import { useVisitActions } from '../hooks/writes'
import { rememberPatient } from '../hooks/recent'
import type { PatientHit } from '../db/types'
import { Card, Input, Kbd, cn, errorText, movedMouse } from '../ui'
import { NewPatient } from '../shell/NewPatient'
import { Clinics, LastSent, NeedsYou, Today } from './reception/Lists'
import { PatientCard, type CardHandle } from './reception/PatientCard'
import { ageSex, fullName, readLastClinic, useClinicRows, useDoneToday, writeLastClinic } from './reception/words'

/** Reception (spec 05). Left: find, then act on one patient card (already here → where, Move · Urgent · Left · Edit;
 *  not here → Send, ↵ the clinic this desk used last, a letter for another, ⇧↵ urgent; not found → register and send).
 *  Idle, the left shows Today's five numbers. Right: clinics, what needs you (only when something does), the last few
 *  sent with Undo. */
export function ReceptionScreen({ departmentId }: { departmentId: string }) {
  const orgId = null
  const { org, can } = useDepartment()
  const visits = useVisitActions()
  const [q, setQ] = useState(''); const [d, setD] = useState(''); const [cursor, setCursor] = useState(0)
  const [creating, setCreating] = useState(false); const [said, setSaid] = useState<string | null>(null)
  const [kbd, setKbd] = useState(true)   // the keys are in use: the chips do not shade under the mouse until it really moves
  const [sent, setSent] = useState(() => ({ desk: departmentId, clinic: readLastClinic(departmentId) }))
  useEffect(() => { const t = setTimeout(() => setD(q), 120); return () => clearTimeout(t) }, [q])
  const hits = usePatientSearch(orgId, d)
  const box = useRef<HTMLInputElement>(null); const card = useRef<CardHandle>(null)
  // ⌘K on reception focuses this box: it is the one search on this screen
  useEffect(() => { const f = () => box.current?.focus(); window.addEventListener('opencare:search', f); return () => window.removeEventListener('opencare:search', f) }, [])
  // typing anywhere on the screen types into the box, except on the patient card, whose letters are its actions
  useEffect(() => {
    if (creating) return
    const k = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key.length !== 1 || e.key === ' ' || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || t.closest('input, textarea, select, [data-card]') || t.isContentEditable) return
      box.current?.focus()
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [creating])

  const desk = org?.departments.find((r) => r.id === departmentId)
  const served = (org?.departments ?? []).filter((x) => x.work === 'visits' && (desk?.checks_in_for ?? [null]).some((s) => s === null || s === x.id))
  const clinics = served.length ? served : (org?.departments ?? []).filter((x) => x.work === 'visits')
  // the usual clinic: the last one this desk sent someone to, else the first it serves
  const lastId = sent.desk === departmentId ? sent.clinic : readLastClinic(departmentId)
  const usual = clinics.find((c) => c.id === lastId) ?? clinics[0] ?? null
  const remember = (clinicId: string) => { writeLastClinic(departmentId, clinicId); setSent({ desk: departmentId, clinic: clinicId }) }
  const rows = useClinicRows(clinics); const doneToday = useDoneToday(clinics)
  const canCreate = can('manage:patients'), canSend = can('write:checked_in')

  const searching = !creating && d.trim().length >= 2
  const list = searching ? hits.data ?? [] : []
  const c = Math.min(cursor, Math.max(0, list.length - 1))
  const picked: PatientHit | undefined = list[c]
  // ↵ acts only on the hits for what is typed now, never on the last search's
  const settled = q === d && !hits.isPlaceholderData
  const nobody = settled && searching && hits.isSuccess && !list.length

  const reset = () => { setQ(''); setD(''); setCursor(0); box.current?.focus() }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!list.length) return
      e.preventDefault(); setKbd(true); setCursor(Math.max(0, Math.min(list.length - 1, c + (e.key === 'ArrowDown' ? 1 : -1))))
    } else if (e.key === 'Enter') {
      e.preventDefault(); if (!settled) return
      if (picked) card.current?.enter(e.shiftKey)
      else if (nobody && canCreate && !q.trim().startsWith('#')) setCreating(true)
    } else if (e.key === 'Tab' && !e.shiftKey && picked) { e.preventDefault(); card.current?.focus() }
    else if (e.key === 'Escape' && q) { e.preventDefault(); e.stopPropagation(); reset() }
  }
  async function registered(p: PatientHit) {
    setCreating(false); setQ(''); setD('')
    if (!usual || !canSend) { setSaid(`${fullName(p)} registered`); return }
    try {
      await visits.open.mutateAsync({ patient_id: p.id, department_id: usual.id, priority: 'routine' })
      rememberPatient(p); remember(usual.id); setSaid(`${fullName(p)} → ${usual.name}`)
    } catch { /* shown under the search */ }
    box.current?.focus()
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start">
      <div className="grid min-w-0 content-start gap-3">
        {said && <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900 ring-1 ring-teal-200" role="status">✓ {said}</p>}
        {!creating && <Card className="p-3">
          <div className="relative"><SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input ref={box} autoFocus value={q} onChange={(e) => { setQ(e.target.value); setCursor(0); setKbd(true) }} onKeyDown={onKey} aria-label="Find a patient"
              placeholder="Name, phone, national ID or number" className="h-11 pl-9 text-[15px]" /></div>
          {searching && <div className="mt-2 flex flex-wrap gap-1.5" role="listbox" aria-label="Patients found" onMouseMove={(e) => kbd && movedMouse(e) && setKbd(false)}>
            {list.map((p, i) => <button key={p.id} type="button" tabIndex={-1} role="option" aria-selected={i === c} onClick={() => { setCursor(i); card.current?.focus() }}
              className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] ring-1 transition-colors',
                i === c ? 'bg-teal-50 text-teal-900 ring-teal-700' : cn('text-neutral-700 ring-neutral-200', !kbd && 'hover:ring-neutral-400'))}>
              {fullName(p)}<span className="text-neutral-500">· {ageSex(p.age, p.sex)}</span>
              {p.open_visits.some((v) => v.present) && <span className="h-1.5 w-1.5 rounded-full bg-teal-600" aria-label="here now" />}
              {p.died_on && <span className="text-neutral-400">†</span>}</button>)}
            {canCreate && !q.trim().startsWith('#') && <button type="button" tabIndex={-1} onClick={() => setCreating(true)}
              className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] ring-1', nobody ? 'bg-teal-50 font-medium text-teal-900 ring-teal-700' : cn('text-teal-800 ring-neutral-200', !kbd && 'hover:ring-neutral-400'))}>
              + New patient “{q.trim()}”{nobody && <Kbd>↵</Kbd>}</button>}
          </div>}
          {nobody && <p className="mt-2 px-1 text-sm text-neutral-500">Nobody found for “{d.trim()}”.</p>}
          {hits.error && <p className="mt-2 px-1 text-sm text-red-700">{errorText(hits.error)}</p>}
          {list.length > 0 && <p className="mt-2 flex flex-wrap items-center gap-1 px-1 text-[11px] text-neutral-400"><Kbd>↑</Kbd><Kbd>↓</Kbd> choose
            {canSend && <> · <Kbd>↵</Kbd> send · <Kbd>⇧↵</Kbd> urgent</>} · <Kbd>Tab</Kbd> the card · <Kbd>Esc</Kbd> clear</p>}
        </Card>}

        {picked && <PatientCard key={picked.id} handle={card} p={picked} clinics={clinics} usual={usual} rows={rows} canSend={canSend} canEdit={canCreate} orgId={orgId ?? ''}
          onSaid={setSaid} onSent={remember} onDone={reset} onEscape={() => box.current?.focus()} />}

        {creating && <div onKeyDown={(e) => { if (e.key === 'Escape') { setCreating(false); box.current?.focus() } }}>
          <NewPatient seed={q} orgId={orgId ?? ''} submitLabel={usual && canSend ? `Register and send to ${usual.name}` : 'Register'}
            onRegisterOnly={usual && canSend ? (p) => { setCreating(false); reset(); setSaid(`${fullName(p)} registered`) } : undefined}
            onCancel={() => setCreating(false)} onDone={(p) => void registered(p)} /></div>}
        {visits.open.error && <p className="text-sm text-red-700">{errorText(visits.open.error)}</p>}

        {!searching && !creating && <>
          {usual && canSend && <p className="px-1 text-[12px] text-neutral-500">Type a name, phone, national ID or number; <Kbd>↵</Kbd> sends to <span className="font-medium text-neutral-700">{usual.name}</span>, the clinic this desk used last.</p>}
          <Today rows={rows} doneToday={doneToday} /></>}
      </div>

      <div className="grid min-w-0 content-start gap-3">
        <Clinics clinics={clinics} />
        <NeedsYou rows={rows} onDone={setSaid} />
        <LastSent rows={rows} onDone={setSaid} />
      </div>
    </div>
  )
}
