import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Plus, Search as SearchIcon } from 'lucide-react'
import { usePatientSearch } from '../hooks/reads'
import { useDepartment } from '../hooks/organization'
import { useVisitActions } from '../hooks/writes'
import { rememberPatient } from '../hooks/recent'
import type { PatientHit } from '../db/types'
import { Button, Callout, Card, Input, Kbd, ScreenFrame, cn, errorText, movedMouse } from '../ui'
import type { ScreenProps } from './registry'
import { NewPatient } from '../shell/NewPatient'
import { Clinics, LastSent, NeedsYou, Today } from './reception/Lists'
import { PatientCard, type CardHandle } from './reception/PatientCard'
import { ageSex, fullName, readLastClinic, useClinicRows, useDoneToday, writeLastClinic } from './reception/words'

/** Reception (base.desk, spec 05). The search sits in the frame's toolbar, with New patient. Left: find, then act on one patient card (already here → where, Move · Urgent · Left · Edit;
 *  not here → Send, ↵ the clinic this desk used last, a letter for another, ⇧↵ urgent; not found → register and send).
 *  Idle, the left shows Today's five numbers. Right: clinics, what needs you (only when something does), the last few
 *  sent with Undo. */
export function ReceptionScreen({ dept }: ScreenProps) {
  const departmentId = dept.id
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

  const searchBox = <div className="relative w-full sm:w-96"><SearchIcon className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
    <Input ref={box} autoFocus value={q} onChange={(e) => { setQ(e.target.value); setCursor(0); setKbd(true) }} onKeyDown={onKey} aria-label="Find a patient"
      placeholder="Name, phone, national ID or number" className="ps-9" /></div>
  return (
    <ScreenFrame search={!creating && searchBox} action={canCreate && !creating && <Button variant="outline" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New patient</Button>}
      notice={said && <Callout key={said} tone="accent" icon={false} role="status">✓ {said}</Callout>}>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start">
      <div className="grid min-w-0 content-start gap-3">
        {searching && <Card className="p-3">
          <div className="flex flex-wrap gap-1.5" role="listbox" aria-label="Patients found" onMouseMove={(e) => kbd && movedMouse(e) && setKbd(false)}>
            {list.map((p, i) => <button key={p.id} type="button" tabIndex={-1} role="option" aria-selected={i === c} onClick={() => { setCursor(i); card.current?.focus() }}
              className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-13 ring-1 transition-colors',
                i === c ? 'bg-accent-soft text-accent ring-accent' : cn('text-muted ring-line', !kbd && 'hover:ring-line-strong'))}>
              {fullName(p)}<span className="text-faint">· {ageSex(p.age, p.sex)}</span>
              {p.open_visits.some((v) => v.present) && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="here now" />}
              {p.died_on && <span className="text-faint">†</span>}</button>)}
            {canCreate && !q.trim().startsWith('#') && <button type="button" tabIndex={-1} onClick={() => setCreating(true)}
              className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-13 ring-1', nobody ? 'bg-accent-soft font-medium text-accent ring-accent' : cn('text-accent ring-line', !kbd && 'hover:ring-line-strong'))}>
              + New patient “{q.trim()}”{nobody && <Kbd>↵</Kbd>}</button>}
          </div>
          {nobody && <p className="mt-2 px-1 text-14 text-faint">Nobody found for “{d.trim()}”.</p>}
          {hits.error && <p className="mt-2 px-1 text-14 text-danger">{errorText(hits.error)}</p>}
          {list.length > 0 && <p className="mt-2 flex flex-wrap items-center gap-1 px-1 text-11 text-faint"><Kbd>↑</Kbd><Kbd>↓</Kbd> choose
            {canSend && <> · <Kbd>↵</Kbd> send · <Kbd>⇧↵</Kbd> urgent</>} · <Kbd>Tab</Kbd> the card · <Kbd>Esc</Kbd> clear</p>}
        </Card>}

        {picked && <PatientCard key={picked.id} handle={card} p={picked} clinics={clinics} usual={usual} rows={rows} canSend={canSend} canEdit={canCreate} orgId={orgId ?? ''}
          onSaid={setSaid} onSent={remember} onDone={reset} onEscape={() => box.current?.focus()} />}

        {creating && <div onKeyDown={(e) => { if (e.key === 'Escape') { setCreating(false); box.current?.focus() } }}>
          <NewPatient seed={q} orgId={orgId ?? ''} submitLabel={usual && canSend ? `Register and send to ${usual.name}` : 'Register'}
            onRegisterOnly={usual && canSend ? (p) => { setCreating(false); reset(); setSaid(`${fullName(p)} registered`) } : undefined}
            onCancel={() => setCreating(false)} onDone={(p) => void registered(p)} /></div>}
        {visits.open.error && <p className="text-14 text-danger">{errorText(visits.open.error)}</p>}

        {!searching && !creating && <>
          {usual && canSend && <p className="px-1 text-12 text-faint">Type a name, phone, national ID or number; <Kbd>↵</Kbd> sends to <span className="font-medium text-muted">{usual.name}</span>, the clinic this desk used last.</p>}
          <Today rows={rows} doneToday={doneToday} /></>}
      </div>

      <div className="grid min-w-0 content-start gap-3">
        <Clinics clinics={clinics} />
        <NeedsYou rows={rows} onDone={setSaid} />
        <LastSent rows={rows} onDone={setSaid} />
      </div>
    </div>
    </ScreenFrame>
  )
}
