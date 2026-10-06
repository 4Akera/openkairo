import { useEffect, useMemo, useRef, useState } from 'react'
import type { RecentRow } from '../../db/types'
import { useNavigate } from 'react-router-dom'
import { ScanLine } from 'lucide-react'
import { useDepartment } from '../../hooks/organization'
import { useRequestQueue } from '../../hooks/reads'
import { refresh } from '../../hooks/writes'
import { benchWordsFor, replyFormFor } from '../../renderers'
import { useQueryClient } from '@tanstack/react-query'
import { write, type EntryIn } from '../../db/rpc'
import { answerEntry, oneSet, stepEntry } from '../../db/entries'
import type { RequestQueueRow } from '../../db/types'
import { Button, Card, Chip, Empty, Input, Kbd, ListRow, ListSection, ScreenFrame, Spinner, Tag, cn, minutesSince, movedMouse, hm, shortDate, type ScreenView } from '../../ui'
import type { ScreenProps } from '../registry'
import { ageSex, groupByPatient, matches, nextSteps, phaseOf, splitByDay, stepName, stepWords, testsLine, todayYmd, type DayGroup, type Phase } from './shared'

type Segment = Phase | 'done'

/** The bench (base.bench): whose sample is next, and what is waiting on us. Scan or type, then one row per patient in three views,
 *  counted in the toolbar — to collect (not started), in progress, done today — today's work only; older open requests fold at the bottom. */
export function Bench({ dept }: ScreenProps) {
  const departmentId = dept.id; const type = dept.type
  const q = useRequestQueue(departmentId); const navigate = useNavigate(); const { org, can } = useDepartment()
  const [stepping, setStepping] = useState(false)
  const [find, setFind] = useState(''); const [section, setSection] = useState<string | null>(null); const [seg, setSeg] = useState<Segment>('todo')
  const [cursor, setCursor] = useState(0); const [showOld, setShowOld] = useState(false); const [, tick] = useState(0)
  const [kbd, setKbd] = useState(false)                  // the keys are in use (arrows, a scan, typing): no hover; the mouse never moves the cursor
  const [arrows, setArrows] = useState(false)            // the arrows moved the cursor: show it as a bar (typed, only a ↵ beside the name)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t) }, [])   // waits and the day move on their own
  const words = benchWordsFor(type); const qc = useQueryClient(); const [quickBusy, setQuickBusy] = useState<string | null>(null)
  const box = useRef<HTMLInputElement>(null); const list = useRef<HTMLUListElement>(null)
  const rows = useMemo(() => q.data?.requests ?? [], [q.data])
  const recent = q.data?.recent ?? []
  const sections = [...new Set([...rows.map((r) => r.section_name ?? 'Other'), ...(section ? [section] : [])])].sort()
  const inSection = (s: string | null) => !section || (s ?? 'Other') === section
  const f = find.trim().toLowerCase(); const today = todayYmd()
  const shown = rows.filter((r) => inSection(r.section_name))
  const byPhase = (p: Phase) => splitByDay(groupByPatient(shown.filter((r) => phaseOf(r.request?.step) === p), today).filter((g) => matches(g.patient, f)))
  const todo = byPhase('todo'); const doing = byPhase('doing')
  const done = recent.filter((r) => inSection(r.section_name) && matches(r.patient, f))
  const first = words.todo ?? 'To collect'
  const segs: [Segment, string, number][] = [['todo', first, todo.today.length], ['doing', 'In progress', doing.today.length], ['done', words.done ?? 'Done today', done.length]]
  const lists = seg === 'todo' ? todo : seg === 'doing' ? doing : null
  const oldOpen = showOld || !!f   // a scan finds a patient from an older day too
  const visible: DayGroup[] = lists ? [...lists.today, ...(oldOpen ? lists.older : [])] : []
  const n = lists ? visible.length : done.length
  const c = Math.min(cursor, Math.max(0, n - 1))
  const open = (pid: string) => navigate(`/bench/${pid}`)
  // the next step of each order's service (collected, prepared): one set per patient, each step answering (or changing the step of) its order
  const advance = async (rs: RequestQueueRow[], to: string, type: string) => { setStepping(true)
    try { await write(oneSet(rs.map((r) => stepEntry(r, departmentId, 'in-progress', undefined, to, type)))); refresh(qc) } catch (x) { alert(x instanceof Error ? x.message : String(x)) } finally { setStepping(false) } }
  const pick = (s: Segment) => { setSeg(s); setCursor(0); box.current?.focus() }
  // ↵ opens the patient under the cursor; a scanned patient with nothing listed here opens from wherever they are
  const enter = () => { const g = visible[c] ?? (f ? [...todo.today, ...doing.today, ...todo.older, ...doing.older][0] : undefined); if (g) open(g.patient.id) }
  const onKey = (e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setKbd(true); setArrows(true); setCursor(Math.max(0, Math.min(c + 1, n - 1))) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setKbd(true); setArrows(true); setCursor(Math.max(c - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); enter() }
    else if (e.key === 'Escape') { setFind(''); setCursor(0) }
  }
  // typing anywhere goes to the box; / jumps there; ↑↓ ↵ Esc work with nothing focused
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); box.current?.focus() }
      else if (e.key.length === 1 && e.key !== ' ') box.current?.focus()
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape' || (e.key === 'Enter' && t === document.body)) onKey(e)
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  useEffect(() => { list.current?.querySelector('.bench-cursor')?.scrollIntoView({ block: 'nearest' }) }, [c, seg])

  // while scanning, where else the patient is, older days included
  const found: [Segment, string, number][] = segs.map(([k, l]) => [k, l, k === 'todo' ? todo.today.length + todo.older.length : k === 'doing' ? doing.today.length + doing.older.length : done.length])
  const none = (text: string) => <Nothing text={f ? 'No match here.' : text} others={f ? found.filter(([k, , m]) => k !== seg && m > 0) : []} onPick={pick} />
  const row = (g: DayGroup, i: number, old: boolean) => {
    const steps = nextSteps(g.rows, org, can).map((s) => <Button key={`${s.type} ${s.key}`} size="sm" variant="outline" onClick={() => void advance(s.rows, s.key, s.type)} disabled={stepping}>{stepName(s.key)} {s.rows.length}</Button>)
    // a pack's one-click release (the pharmacy's "Give all"): every request its form can answer as it stands, in one atomic set
    const quick = seg !== 'done' ? g.rows.map((r) => ({ r, pf: replyFormFor(r.reply_type) })).filter(({ r, pf }) => pf?.quick && can(pf.action) && pf.toWrite(r, undefined)) : []
    if (quick.length) steps.push(<Button key="quick" size="sm" disabled={quickBusy === g.patient.id} onClick={async () => {
      const items: EntryIn[] = quick.flatMap(({ r, pf }) => { const w = pf!.toWrite(r, undefined); return w ? [answerEntry(r, departmentId, w)] : [] })
      if (!items.length) return
      setQuickBusy(g.patient.id)
      try { await write(oneSet(items)); refresh(qc) } catch (x) { alert(x instanceof Error ? x.message : String(x)) } finally { setQuickBusy(null) }
    }}>{quick[0].pf!.quick}{quick.length > 1 ? ` ${quick.length}` : ''}</Button>)
    const where = <>{g.patient.here != null && <span className={g.patient.here ? 'font-medium text-accent' : 'text-faint'}>{g.patient.here ? 'here' : 'gone'}</span>}{old && <span className="tnum">{shortDate(g.oldest)}</span>}</>
    return <ListRow key={g.patient.id} number={g.patient.record_number} name={`${g.patient.given_name} ${g.patient.family_name}`} age={ageSex(g.patient)}
      status={<>{g.priority !== 'routine' && <Tag tone="danger">{g.priority}</Tag>}{seg === 'doing' && stepWords(g.rows).map((w) => <Tag key={w} tone={w === 'reopened' ? 'warn' : 'neutral'}>{w}</Tag>)}<span className="truncate">{testsLine(g.rows)}</span></>}
      who={where} actions={steps.length ? <>{where}{steps}</> : undefined} minutes={g.since ? minutesSince(g.since) : null} muted={old}
      selected={i === c && arrows} enter={i === c && !arrows && !!f} hover={!kbd} className={i === c ? 'bench-cursor' : undefined} onOpen={() => open(g.patient.id)} />
  }

  // the frame's toolbar: the three views counted (to collect in a state colour while any wait), the sections, the scan box
  const views: ScreenView<Segment>[] = segs.map(([id, label, count]) => ({ id, label, count, ...(id === 'todo' ? { needs: 'warn' as const } : {}) }))
  const scan = <div className="relative w-full sm:w-80"><ScanLine className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
    <Input ref={box} autoFocus value={find} onChange={(e) => { setFind(e.target.value); setCursor(0); setKbd(!!e.target.value); setArrows(false) }} onKeyDown={onKey} placeholder="Scan or type a record number or name"
      aria-label="Scan or type a record number or name — ↑↓ move · ↵ open · Esc clear" className="ps-9 pe-8" />
    <span className="absolute end-3 top-1/2 -translate-y-1/2 text-faint"><Kbd>/</Kbd></span></div>
  const chips = (sections.length > 1 || section) && <div className="flex flex-wrap gap-1 text-12">{sections.map((s) => <Chip key={s} shape="pill" on={section === s} onClick={() => { setSection(section === s ? null : s); setCursor(0) }}>{s}</Chip>)}</div>
  return <ScreenFrame views={views} view={seg} onView={pick} filters={chips} search={scan}>
    {q.isLoading ? <Spinner label="Loading requests" /> : <Card><ul ref={list} onMouseMove={(e) => { if (kbd && movedMouse(e)) { setKbd(false); setArrows(false) } }}>
      {lists ? <>
        {lists.today.length ? lists.today.map((g, i) => row(g, i, false)) : f && lists.older.length ? null : none(seg === 'todo' ? `Nobody ${first.toLowerCase()} today.` : 'Nothing in progress today.')}
        {lists.older.length > 0 && <ListSection title={seg === 'doing' ? 'In progress, older days' : words.todo ? `${first}, older days` : 'Not collected, older days'}
          count={lists.older.length} folded={!oldOpen} onToggle={f ? undefined : () => setShowOld(!showOld)}>{lists.older.map((g, j) => row(g, lists.today.length + j, true))}</ListSection>}
      </> : done.length ? done.map((r, i) => <Released key={r.id} r={r} next={i === c && (kbd || !!f)} onCorrect={() => navigate(`/bench/correct/${r.id}`)} />)
        : none('Nothing released in the last 24 hours.')}
    </ul></Card>}
  </ScreenFrame>
}
/** an empty list; while scanning, where the patient is instead */
function Nothing({ text, others, onPick }: { text: string; others: [Segment, string, number][]; onPick: (s: Segment) => void }) {
  return <li><Empty>{text}
    {others.length > 0 && <> Found in {others.map(([k, l, m], j) => <span key={k}>{j > 0 && ', '}<button onClick={() => onPick(k)} className="rounded-sm font-medium text-accent hover:underline focus-ring">{l} {m}</button></span>)}.</>}</Empty></li>
}

/** one result released in the last day, newest first; Correct replaces it (the record keeps both, the doctor is asked to look again) */
function Released({ r, next, onCorrect }: { r: RecentRow; next: boolean; onCorrect: () => void }) {
  const flagged = !!r.request?.reply_flag && r.request.reply_flag !== 'normal'
  return <ListRow number={r.patient.record_number} name={`${r.patient.given_name} ${r.patient.family_name}`} age={ageSex(r.patient)} selected={next} className={next ? 'bench-cursor' : undefined}
    status={<>{r.request?.status === 'cancelled' && <Tag>not done</Tag>}<span className={cn('truncate', flagged && 'text-warn')}>{r.request?.reply_line ?? r.service_name}</span></>}
    actions={<><span className="tnum">{r.reply?.author_name}{r.reply && ` · ${hm(r.reply.recorded_at)}`}</span><Button size="sm" variant="outline" onClick={onCorrect} disabled={!r.reply}>Correct</Button></>} />
}
