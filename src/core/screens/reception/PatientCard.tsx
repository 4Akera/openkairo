import { useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MapPin } from 'lucide-react'
import { savePatient } from '../../db/rpc'
import { useDepartment } from '../../hooks/organization'
import { useVisitActions } from '../../hooks/writes'
import { rememberPatient } from '../../hooks/recent'
import type { Department, PatientHit } from '../../db/types'
import { Button, Input, Kbd, Select, Tag, cn, errorText, minutesSince } from '../../ui'
import { ageSex, duration, fullName, type ClinicRow } from './words'

/** a key for each clinic: its first free letter ("P" Psychiatry); M U L G E ↵ are the card's own */
function clinicKeys(clinics: Department[]) {
  const taken = new Set(['m', 'u', 'l', 'g', 'e']); const keys = new Map<string, string>()
  for (const c of clinics) { const k = [...c.name.toLowerCase()].find((ch) => /[a-z]/.test(ch) && !taken.has(ch)); if (k) { taken.add(k); keys.set(c.id, k) } }
  return keys
}
const nth = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`

/** what the search box asks of the card: ↵ there is the card's first action; Tab or ↵ with nothing to send lands on the card */
export type CardHandle = { enter: (urgent: boolean) => void; focus: () => void }

/** One patient, and what the desk can do for him now (spec 05): already here → where, and Move · Urgent · Left/Gone · Edit;
 *  away → back to his clinic; not here → send (↵ the usual clinic, a letter for another, ⇧↵ urgent). Keys work when the card has focus. */
export function PatientCard({ handle, p, clinics, usual, rows, canSend, canEdit, orgId, onSaid, onSent, onDone, onEscape }: {
  handle?: Ref<CardHandle>
  p: PatientHit; clinics: Department[]; usual: Department | null; rows: ClinicRow[]; canSend: boolean; canEdit: boolean; orgId: string
  onSaid: (s: string) => void; onSent: (clinicId: string) => void; onDone: () => void; onEscape: () => void
}) {
  const visits = useVisitActions(); const [moving, setMoving] = useState(false); const [editing, setEditing] = useState(false)
  const keys = clinicKeys(clinics)
  const open = p.open_visits.find((v) => clinics.some((c) => c.id === v.department_id))
  const row = open ? rows.find((r) => r.id === open.id) : undefined
  const clinic = open ? clinics.find((c) => c.id === open.department_id) : undefined
  const busy = visits.open.isPending || visits.transfer.isPending || visits.priority.isPending || visits.present.isPending || visits.left.isPending
  const nationalId = p.identifiers.find((i) => i.system === 'eg-national-id')?.value

  async function send(to: Department, isUrgent = false) {
    if (busy) return
    try {
      await visits.open.mutateAsync({ patient_id: p.id, department_id: to.id, priority: isUrgent ? 'urgent' : 'routine' })
      rememberPatient(p); onSent(to.id); onSaid(`${fullName(p)} → ${to.name}${isUrgent ? ' · urgent' : ''}`); onDone()
    } catch { /* shown on the card */ }
  }
  async function moveTo(to: Department) {
    if (!row || busy) return; setMoving(false)
    try {
      await visits.transfer.mutateAsync({ visit: row.visit, to: to.id })
      onSent(to.id); onSaid(`${fullName(p)} moved to ${to.name}`); onDone()
    } catch { /* shown on the card */ }
  }
  const act = (fn: () => Promise<unknown>, said: string) => { if (!busy) fn().then(() => { onSaid(said); onDone() }).catch(() => undefined) }

  // what can be done depends on where he is
  const waitingUnseen = !!row && row.status === 'waiting' && !row.seen_at
  const away = !!open && !open.present
  const target = !p.died_on && canSend && !open ? usual : null
  const others = !p.died_on && canSend && !open ? clinics.filter((c) => c.id !== usual?.id) : []
  const doMove = () => waitingUnseen && canSend && clinics.length > 1 && setMoving((m) => !m)
  const doUrgent = () => row && canSend && act(() => visits.priority.mutateAsync({ visit: row.visit, priority: row.priority === 'routine' ? 'urgent' : 'routine' }), `${fullName(p)}: ${row.priority === 'routine' ? 'urgent' : 'routine'}`)
  const doLeft = () => waitingUnseen && canSend && act(() => visits.left.mutateAsync({ visit: row!.visit }), `${fullName(p)} left ${clinic?.name ?? ''}`)
  const doGone = () => row?.status === 'pending' && open?.present && canSend && act(() => visits.present.mutateAsync({ visit: row.visit, is_present: false }), `${fullName(p)} gone — results go to the doctor`)

  const box = useRef<HTMLDivElement>(null)
  useImperativeHandle(handle, () => ({
    enter: (isUrgent) => { if (away && clinic && canSend) void send(clinic); else if (target) void send(target, isUrgent); else box.current?.focus() },
    focus: () => box.current?.focus(),
  }))

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('input, select, textarea')) return
    if (e.key === 'Enter' && e.target !== e.currentTarget) return   // ↵ on one of the card's buttons is that button
    const k = e.key.toLowerCase()
    if (e.key === 'Escape') { e.preventDefault(); if (moving) setMoving(false); else if (editing) setEditing(false); else onEscape(); return }
    if (e.key === 'Enter') { e.preventDefault(); if (away && clinic && canSend) void send(clinic); else if (target) void send(target, e.shiftKey); return }
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (moving) { const to = clinics.find((c) => keys.get(c.id) === k && c.id !== clinic?.id); if (to) { e.preventDefault(); void moveTo(to) } return }
    if (k === 'm') { e.preventDefault(); doMove() } else if (k === 'u') { e.preventDefault(); doUrgent() } else if (k === 'l') { e.preventDefault(); doLeft() }
    else if (k === 'g') { e.preventDefault(); doGone() } else if (k === 'e' && canEdit) { e.preventDefault(); setEditing(true) }
    else { const to = others.find((c) => keys.get(c.id) === k); if (to) { e.preventDefault(); void send(to) } }
  }

  // where he is, in words: "Waiting in General Practice · 3rd in line · 12 min"
  let where: string | null = null
  if (open && clinic) {
    const line = row ? rows.filter((r) => r.clinic.id === clinic.id && r.band === 'waiting').findIndex((r) => r.id === row.id) : -1
    where = away ? `Away from ${clinic.name}${open.status === 'pending' ? ' · results pending' : ''}`
      : row?.band === 'consult' ? `With ${row.assignee_name ?? 'a doctor'} in ${clinic.name}`
      : row?.band === 'back' ? `Back in ${clinic.name} · results in`
      : row?.band === 'pending' ? `Waiting for results in ${clinic.name}`
      : `Waiting in ${clinic.name}${line >= 0 ? ` · ${nth(line + 1)} in line` : ''} · ${duration(minutesSince(open.arrived_at))}`
  } else if (p.open_visits.length) where = p.open_visits.map((v) => `${v.department_name} · ${v.present ? v.status.replace('_', ' ') : 'away'}`).join('; ')

  return <div ref={box} data-card tabIndex={0} onKeyDown={onKey} aria-label={`${fullName(p)}: actions`} className="grid gap-3 rounded-xl border border-line bg-surface p-4 shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-accent/30">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-18 font-semibold tracking-tight text-fg">{fullName(p)}</span>
      <span className="text-14 text-faint tnum">{ageSex(p.age, p.sex)} · #{p.record_number}{p.phone_text && ` · ${p.phone_text}`}{nationalId && ` · ID ${nationalId}`}</span>
      {p.died_on && <Tag>deceased</Tag>}{row && row.priority !== 'routine' && <Tag tone="red">{row.priority}</Tag>}{row && row.missed_calls > 0 && <Tag tone="amber">not here ×{row.missed_calls}</Tag>}
    </div>
    {where && <p className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-14 text-fg"><MapPin className="h-4 w-4 text-faint" />{where}</p>}

    {editing ? <EditDetails p={p} orgId={orgId} onDone={(said) => { setEditing(false); onSaid(said) }} onCancel={() => setEditing(false)} />
      : <div className="flex flex-wrap items-center gap-1.5">
        {away && clinic && canSend && <Button size="sm" disabled={busy} onClick={() => void send(clinic)}>Back → {clinic.name} <Kbd className="ms-1">↵</Kbd></Button>}
        {target && <Button size="sm" disabled={busy} onClick={() => void send(target)}>Send to {target.name} <Kbd className="ms-1">↵</Kbd></Button>}
        {others.map((c) => <Button key={c.id} size="sm" variant="outline" disabled={busy} onClick={() => void send(c)}>{c.name}{keys.get(c.id) && <Kbd className="ms-1">{keys.get(c.id)!.toUpperCase()}</Kbd>}</Button>)}
        {target && <Button size="sm" variant="outline" className="text-danger" disabled={busy} onClick={() => void send(target, true)}>Urgent → {target.name} <Kbd className="ms-1">⇧↵</Kbd></Button>}
        {waitingUnseen && canSend && clinics.length > 1 && <Button size="sm" variant="outline" disabled={busy} onClick={doMove}>Move to… <Kbd className="ms-1">M</Kbd></Button>}
        {row && canSend && <Button size="sm" variant="outline" disabled={busy} onClick={doUrgent}>{row.priority === 'routine' ? 'Urgent' : 'Not urgent'} <Kbd className="ms-1">U</Kbd></Button>}
        {waitingUnseen && canSend && <Button size="sm" variant="outline" className="text-danger" disabled={busy} onClick={doLeft}>Left <Kbd className="ms-1">L</Kbd></Button>}
        {row?.status === 'pending' && open?.present && canSend && <Button size="sm" variant="outline" className="text-danger" disabled={busy} onClick={doGone}>Gone <Kbd className="ms-1">G</Kbd></Button>}
        {canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit details <Kbd className="ms-1">E</Kbd></Button>}
      </div>}
    {moving && <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-sunken p-2"><span className="text-12 text-faint">Move to</span>
      {clinics.filter((c) => c.id !== clinic?.id).map((c) => <Button key={c.id} size="sm" variant="outline" disabled={busy} onClick={() => void moveTo(c)}>{c.name}{keys.get(c.id) && <Kbd className="ms-1">{keys.get(c.id)!.toUpperCase()}</Kbd>}</Button>)}
      <Button size="sm" variant="ghost" onClick={() => setMoving(false)}>Keep</Button></div>}
    {(visits.open.error || visits.transfer.error || visits.priority.error || visits.present.error || visits.left.error) && <p className="text-14 text-danger">{errorText(visits.open.error ?? visits.transfer.error ?? visits.priority.error ?? visits.present.error ?? visits.left.error)}</p>}
  </div>
}

/** the patient's details, changed in place: register_patient with his own id keeps his record number and logs the change */
function EditDetails({ p, orgId, onDone, onCancel }: { p: PatientHit; orgId: string; onDone: (said: string) => void; onCancel: () => void }) {
  const qc = useQueryClient(); const { dept } = useDepartment(); void orgId
  const [given, setGiven] = useState(p.given_name); const [family, setFamily] = useState(p.family_name); const [sex, setSex] = useState(p.sex)
  const [born, setBorn] = useState(p.born_on); const [phone, setPhone] = useState(p.phone_text ?? ''); const [nid, setNid] = useState(p.identifiers.find((i) => i.system === 'eg-national-id')?.value ?? '')
  const save = useMutation({
    mutationFn: () => savePatient({ department_id: dept?.id, reason: 'details corrected at the desk', patient: { id: p.id, given: [given.trim(), ...p.identity.given.slice(1)], family: family.trim(), gender: sex,
      birth_date: born.length === 4 ? `${born}-01-01` : born.length === 7 ? `${born}-01` : born, birth_precision: born.length === 4 ? 'year' : born.length === 7 ? 'month' : 'day',
      telecom: [...p.identity.telecom.filter((t) => t.system !== 'phone'), ...(phone.trim() ? [{ system: 'phone', value: phone.trim() }] : [])],
      // every identifier he has goes back, the national ID as now typed (the door replaces the set)
      identifiers: [...p.identifiers.filter((i) => i.system !== 'eg-national-id'), ...(nid.trim() ? [{ system: 'eg-national-id', value: nid.trim() }] : [])] } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['patients'] }); qc.invalidateQueries({ queryKey: ['visit_queue'] }); onDone(`${given} ${family}: details saved`) },
  })
  const field = 'h-8 text-14'
  return <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="grid gap-2 rounded-lg bg-sunken p-3">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Input aria-label="Given name" value={given} onChange={(e) => setGiven(e.target.value)} required className={field} autoFocus />
      <Input aria-label="Family name" value={family} onChange={(e) => setFamily(e.target.value)} required className={field} />
      <Select aria-label="Sex" value={sex} onChange={(e) => setSex(e.target.value)} className={field}><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select>
      <Input aria-label="Born (2019, 2019-03 or a date)" value={born} onChange={(e) => setBorn(e.target.value)} required className={field} placeholder="1972 or 1972-03-14" />
      <Input aria-label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} placeholder="Phone" />
      <Input aria-label="National ID" value={nid} onChange={(e) => setNid(e.target.value)} className={cn(field, 'font-mono')} placeholder="National ID" />
    </div>
    {save.error && <p className="text-14 text-danger">{errorText(save.error)}</p>}
    <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" size="sm" disabled={save.isPending}>Save</Button></div>
  </form>
}
