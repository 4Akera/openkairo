import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FlaskConical, ScanLine } from 'lucide-react'
import { useRequestQueue } from '../../hooks/reads'
import { useRequestActions } from '../../hooks/writes'
import { Badge, Button, Card, Heading, Input, Kbd, Spinner, cn, minutesSince } from '../../ui'
import { ageOf, groupByPatient, STEP_LABEL, STEP_TONE } from './shared'

/** The bench: a department's open requests, one row per patient; scan, filter, collect, enter. */
export function Bench({ departmentId, name }: { departmentId: string; name: string }) {
  const q = useRequestQueue(departmentId); const navigate = useNavigate(); const acts = useRequestActions()
  const [find, setFind] = useState(''); const [section, setSection] = useState<string | null>(null); const [step, setStep] = useState<string | null>(null); const [cursor, setCursor] = useState(0)
  const box = useRef<HTMLInputElement>(null)
  const rows = useMemo(() => q.data?.requests ?? [], [q.data])
  const sections = [...new Set(rows.map((r) => r.section_name ?? 'Other'))].sort()
  const filtered = rows.filter((r) => (!section || (r.section_name ?? 'Other') === section) && (!step || r.request?.step === step))
  const f = find.trim().toLowerCase()
  const groups = groupByPatient(filtered).filter((g) => !f || String(g.patient.record_number) === f.replace(/^#/, '') || `${g.patient.given_name} ${g.patient.family_name}`.toLowerCase().includes(f))
  const c = Math.min(cursor, Math.max(0, groups.length - 1))
  const collect = (ids: string[]) => ids.forEach((id) => acts.step.mutate({ request_id: id, from_step: 'sent', step: 'started' }))
  const open = (pid: string) => navigate(`/bench/${pid}`)
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) { e.preventDefault(); box.current?.focus() } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [])
  const stat = rows.filter((r) => r.request?.priority !== 'routine').length
  const toCollect = rows.filter((r) => r.request?.step === 'sent').length
  return <div className="mx-auto grid max-w-6xl gap-4 p-4">
    <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
      <div><h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight"><FlaskConical className="h-5 w-5 text-teal-700" />{name}</h1><p className="text-sm text-neutral-500">Requests for us, one row per patient</p></div>
      <div className="ml-auto flex gap-5 text-sm tnum">
        {([['Open tests', rows.length, ''], ['Patients', groupByPatient(rows).length, ''], ['To collect', toCollect, 'text-amber-700'], ['Urgent', stat, stat ? 'text-red-700' : ''], ['Done today', q.data?.done_today ?? 0, 'text-teal-700']] as const).map(([l, n, cls]) =>
          <div key={l} className="text-right"><p className={cn('text-xl font-semibold leading-none', cls)}>{n}</p><p className="mt-1 text-[11px] text-neutral-500">{l}</p></div>)}
      </div>
    </div>

    <Card className="p-3">
      <div className="relative"><ScanLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <Input ref={box} autoFocus value={find} onChange={(e) => { setFind(e.target.value); setCursor(0) }} placeholder="Scan or type a record number or name…" className="h-11 pl-9 text-base"
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(Math.min(c + 1, groups.length - 1)) } else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(Math.max(c - 1, 0)) } else if (e.key === 'Enter' && groups[c]) { e.preventDefault(); open(groups[c].patient.id) } else if (e.key === 'Escape') setFind('') }} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400"><Kbd>/</Kbd></span></div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
        <Chip on={!section} onClick={() => setSection(null)}>All sections</Chip>{sections.map((s) => <Chip key={s} on={section === s} onClick={() => setSection(section === s ? null : s)}>{s} <span className="opacity-60">{rows.filter((r) => (r.section_name ?? 'Other') === s).length}</span></Chip>)}
        <span className="mx-1 h-4 w-px bg-neutral-200" />
        {(['sent', 'started', 'held'] as const).map((s) => <Chip key={s} on={step === s} onClick={() => setStep(step === s ? null : s)}>{STEP_LABEL[s]}</Chip>)}
      </div>
    </Card>

    {q.isLoading ? <Spinner label="Loading requests" /> : groups.length === 0 ? <Card className="p-8 text-center text-sm text-neutral-400">{rows.length ? 'Nothing matches.' : 'No open requests.'}</Card> :
      <Card><Heading count={groups.length} className="border-b border-neutral-100 px-4 py-2.5" right={<span className="text-[11px] text-neutral-400">↑↓ move · ↵ enter results · urgent first, then oldest</span>}>Patients</Heading>
        <ul className="divide-y divide-neutral-100">{groups.map((g, i) => { const sent = g.rows.filter((r) => r.request?.step === 'sent').map((r) => r.id); const m = minutesSince(g.oldest); return <li key={g.patient.id} onMouseEnter={() => setCursor(i)}
          className={cn('flex items-center gap-4 px-4 py-2.5', i === c && 'bg-teal-50/60', g.priority !== 'routine' && 'border-l-2 border-l-red-500')}>
          <button onClick={() => open(g.patient.id)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
            <span className="w-14 shrink-0 font-mono text-xs text-neutral-500">#{g.patient.record_number}</span>
            <span className="w-52 shrink-0"><span className="block truncate text-[14px] font-medium">{g.patient.given_name} {g.patient.family_name}</span><span className="text-xs text-neutral-500 tnum">{ageOf(g.patient.born_on)} y · {g.patient.sex[0].toUpperCase()} · {g.from.join(', ')}</span></span>
            <span className="flex min-w-0 flex-1 flex-wrap gap-1">{g.rows.map((r) => <Badge key={r.id} tone={STEP_TONE[r.request?.step ?? 'sent'] ?? 'neutral'} className={r.request?.priority !== 'routine' ? 'ring-red-300' : ''}>{r.service_name ?? r.display_line}{r.request?.priority !== 'routine' && <b className="ml-1 text-red-700">{r.request?.priority}</b>}</Badge>)}</span>
          </button>
          {g.priority !== 'routine' && <Badge tone="red">{g.priority.toUpperCase()}</Badge>}
          <span className={cn('w-12 text-right text-xs tnum', m >= 120 ? 'font-semibold text-red-700' : m >= 60 ? 'text-amber-700' : 'text-neutral-400')}>{m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`}</span>
          <span className="flex w-52 justify-end gap-1.5">{sent.length > 0 && <Button size="sm" variant="outline" onClick={() => collect(sent)} disabled={acts.step.isPending}>Collect {sent.length}</Button>}<Button size="sm" onClick={() => open(g.patient.id)}>Results →</Button></span>
        </li> })}</ul></Card>}
  </div>
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={cn('rounded-full px-2.5 py-1 ring-1 ring-inset transition-colors', on ? 'bg-teal-800 text-white ring-teal-800' : 'bg-white text-neutral-600 ring-neutral-200 hover:ring-neutral-400')}>{children}</button>
}
