// A department's Bookings settings (spec/openCare.md §5.7; picture 9), drawn in the department's card by the pack's own editors
// (§5.1 rule 7, registerSettingEditor) with the core's Save, checks and history: the sessions — name, days, hours, by time (every N
// minutes) or by number (N places), a doctor or anyone, a room, overbooking and places kept for walk-ins, what a bench's session books —
// and the leave and closed days (a doctor's sessions, or the whole department's); what to tell the patient when booked, per service.
// Book ahead and Same doctor first are the automatic form's.
import { useState, type ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useDepartment } from '@core/hooks/organization'
import type { SettingEditorProps } from '@core/screens/settings/form/registry'
import { Button, Chip, IconButton, Input, NumberInput, Segmented, Select, cn } from '@core/ui'
import { todayOf, type Session } from './api'

const DAYS: [string, string][] = [['sat', 'Sat'], ['sun', 'Sun'], ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri']]
interface Leave { from: string; to: string; doctor_id?: string; reason?: string }
const uid = () => crypto.randomUUID()
const Field = ({ label, children, error, className }: { label: string; children: ReactNode; error?: string; className?: string }) =>
  <label className={cn('grid gap-1 text-12 text-muted', className)}><span>{label}</span>{children}{error && <span className="text-danger">{error}</span>}</label>
/** a value with keys left out when empty (the shape takes no empty string or null) */
const tidy = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null)) as T

export function SessionsEditor({ value, onChange, errors, disabled }: SettingEditorProps) {
  const { org } = useDepartment()
  const sessions = (value.sessions as Session[] | undefined) ?? []; const leave = (value.leave as Leave[] | undefined) ?? []
  const doctors = (org?.users ?? []).filter((u) => !u.retired_at && u.kind === 'person' && u.roles.some((r) => r.role_key === 'doctor' || r.role_key.endsWith('doctor')))
  const people = doctors.length ? doctors : (org?.users ?? []).filter((u) => !u.retired_at)
  const rooms = (org?.places ?? []).filter((p) => p.label === 'room' || p.label === 'chair')
  const benchServices = (org?.services ?? []).filter((s) => org?.allDepartments.find((d) => d.id === s.department_id)?.work === 'bench')
  const deptName = (id: string | null) => org?.allDepartments.find((d) => d.id === id)?.name ?? ''
  const setS = (i: number, patch: Partial<Session>) => onChange({ ...value, sessions: sessions.map((s, j) => j === i ? tidy({ ...s, ...patch }) : s) })
  const setL = (i: number, patch: Partial<Leave>) => onChange({ ...value, leave: leave.map((l, j) => j === i ? tidy({ ...l, ...patch }) : l) })
  const err = (path: string) => errors[path]
  const [openBooks, setOpenBooks] = useState<string[]>([])   // the sessions whose "what it books" is unfolded (a bench's)
  return <div className="grid gap-4">
    <div className="grid gap-2">
      <p className="text-13 font-semibold text-fg">Sessions</p>
      {sessions.map((s, i) => <div key={s.id} className="grid gap-2 rounded-lg border border-line bg-surface p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Name" error={err(`sessions.${i}.name`)}><Input value={s.name} disabled={disabled} onChange={(e) => setS(i, { name: e.target.value })} className="w-36" /></Field>
          <Field label="From" error={err(`sessions.${i}.from`)}><Input type="time" value={s.from} disabled={disabled} onChange={(e) => setS(i, { from: e.target.value })} className="w-36" /></Field>
          <Field label="To" error={err(`sessions.${i}.to`)}><Input type="time" value={s.to} disabled={disabled} onChange={(e) => setS(i, { to: e.target.value })} className="w-36" /></Field>
          <Field label="How"><Segmented aria-label="How it books" size="sm" value={s.how} options={[['time', 'By time'], ['number', 'By number']]}
            onChange={(v) => setS(i, v === 'number' ? { how: 'number', every: undefined, places: s.places ?? 20 } : { how: 'time', places: undefined, every: s.every ?? 15 })} /></Field>
          {s.how === 'time' ? <Field label="Every (min)" error={err(`sessions.${i}.every`)}><NumberInput integer label="Every how many minutes" value={s.every ?? null} onValue={(n) => setS(i, { every: n ?? undefined })} className="w-20" /></Field>
            : <Field label="Places" error={err(`sessions.${i}.places`)}><NumberInput integer label="Places" value={s.places ?? null} onValue={(n) => setS(i, { places: n ?? undefined })} className="w-20" /></Field>}
          {!disabled && <IconButton title="Remove this session" className="ms-auto" onClick={() => onChange({ ...value, sessions: sessions.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></IconButton>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5"><span className="text-12 text-muted">Days</span>
          {DAYS.map(([k, w]) => <Chip key={k} on={s.days.includes(k)} onClick={() => !disabled && setS(i, { days: s.days.includes(k) ? s.days.filter((d) => d !== k) : [...s.days, k] })}>{w}</Chip>)}
          {err(`sessions.${i}.days`) && <span className="text-12 text-danger">{err(`sessions.${i}.days`)}</span>}</div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Doctor"><Select value={s.doctor_id ?? ''} disabled={disabled} onChange={(e) => setS(i, { doctor_id: e.target.value || undefined })} className="w-48">
            <option value="">Anyone in the session</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
          <Field label="Room"><Select value={s.place_id ?? ''} disabled={disabled} onChange={(e) => setS(i, { place_id: e.target.value || undefined })} className="w-48">
            <option value="">—</option>{rooms.map((p) => <option key={p.id} value={p.id}>{deptName(p.department_id)} · {p.name}</option>)}</Select></Field>
          <Field label="Overbook"><NumberInput integer label="Overbook" value={s.overbook ?? 0} onValue={(n) => setS(i, { overbook: n ?? 0 })} className="w-20" /></Field>
          <Field label="Kept for walk-ins"><NumberInput integer label="Kept for walk-ins" value={s.walk_ins ?? 0} onValue={(n) => setS(i, { walk_ins: n ?? 0 })} className="w-20" /></Field>
        </div>
        {benchServices.length > 0 && (s.services?.length || openBooks.includes(s.id)
          ? <div className="flex flex-wrap items-center gap-1.5"><span className="text-12 text-muted">What it books (a bench's services; none: any)</span>
            {benchServices.map((sv) => { const on = (s.services ?? []).includes(sv.id)
              return <Chip key={sv.id} on={on} onClick={() => !disabled && setS(i, { services: on ? (s.services ?? []).filter((x) => x !== sv.id) : [...(s.services ?? []), sv.id] })}>{deptName(sv.department_id)} · {sv.name}</Chip> })}</div>
          : !disabled && <button type="button" onClick={() => setOpenBooks([...openBooks, s.id])} className="justify-self-start rounded-sm text-12 text-accent hover:underline focus-ring">+ What it books (a bench's services)</button>)}
      </div>)}
      {!disabled && <Button type="button" size="sm" variant="ghost" className="justify-self-start" onClick={() => onChange({ ...value, sessions: [...sessions,
        { id: uid(), name: sessions.length ? 'Evening' : 'Morning', days: ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'], from: '09:00', to: '13:00', how: 'number', places: 20, overbook: 0, walk_ins: 0 }] })}><Plus />Add a session</Button>}
      <p className="text-12 text-faint">By time (every N minutes) or by number (N places), chosen per session. A doctor, or anyone in the session. Overbook and Kept for walk-ins are numbers
        per session, 0 by default. Ramadan hours are their own sessions.</p>
    </div>
    <div className="grid gap-2">
      <p className="text-13 font-semibold text-fg">Leave and closed days</p>
      {leave.map((l, i) => <div key={i} className="flex flex-wrap items-end gap-2">
        <Field label="From"><Input type="date" value={l.from} disabled={disabled} onChange={(e) => setL(i, { from: e.target.value })} className="w-40" /></Field>
        <Field label="To" error={err(`leave.${i}.to`)}><Input type="date" value={l.to} disabled={disabled} onChange={(e) => setL(i, { to: e.target.value })} className="w-40" /></Field>
        <Field label="Whose"><Select value={l.doctor_id ?? ''} disabled={disabled} onChange={(e) => setL(i, { doctor_id: e.target.value || undefined })} className="w-48">
          <option value="">The whole department</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <Field label="Reason"><Input value={l.reason ?? ''} disabled={disabled} maxLength={60} onChange={(e) => setL(i, { reason: e.target.value })} className="w-48" placeholder="conference, holiday" /></Field>
        {!disabled && <IconButton title="Remove" onClick={() => onChange({ ...value, leave: leave.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></IconButton>}
      </div>)}
      {!disabled && <Button type="button" size="sm" variant="ghost" className="justify-self-start" onClick={() => { const d = todayOf(org?.organization.time_zone); onChange({ ...value, leave: [...leave, { from: d, to: d }] }) }}><Plus />Add leave or a closed day</Button>}
      <p className="text-12 text-faint">A doctor's leave closes their sessions; the whole department's closes every session. Bookings already made stay on the Diary to move.</p>
    </div>
  </div>
}

interface Line { service_id?: string; en: string; ar?: string }
export function TellEditor({ value, onChange, disabled }: SettingEditorProps) {
  const { org } = useDepartment(); const lines = (value.lines as Line[] | undefined) ?? []
  const services = (org?.services ?? []).filter((s) => !!s.department_id)
  const deptName = (id: string | null) => org?.allDepartments.find((d) => d.id === id)?.name ?? ''
  const set = (i: number, patch: Partial<Line>) => onChange({ ...value, lines: lines.map((l, j) => j === i ? tidy({ ...l, ...patch }) : l) })
  return <div className="grid gap-2">
    {lines.map((l, i) => <div key={i} className="flex flex-wrap items-end gap-2">
      <Field label="For"><Select value={l.service_id ?? ''} disabled={disabled} onChange={(e) => set(i, { service_id: e.target.value || undefined })} className="w-56">
        <option value="">A visit here</option>{services.map((s) => <option key={s.id} value={s.id}>{deptName(s.department_id)} · {s.name}</option>)}</Select></Field>
      <Field label="English" className="min-w-64 flex-1"><Input value={l.en} disabled={disabled} maxLength={200} onChange={(e) => set(i, { en: e.target.value })} /></Field>
      <Field label="Arabic" className="min-w-64 flex-1"><Input dir="rtl" lang="ar" value={l.ar ?? ''} disabled={disabled} maxLength={200} onChange={(e) => set(i, { ar: e.target.value })} /></Field>
      {!disabled && <IconButton title="Remove" onClick={() => onChange({ ...value, lines: lines.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></IconButton>}
    </div>)}
    {!disabled && <Button type="button" size="sm" variant="ghost" className="justify-self-start" onClick={() => onChange({ ...value, lines: [...lines, { en: '' }] })}><Plus />Add a line</Button>}
    <p className="text-12 text-faint">Said on the booking card and the calls list.</p>
  </div>
}
