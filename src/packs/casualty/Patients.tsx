// Emergency's Patients tab (casualty.patients, spec/openCare.md §5.6): every stay admitted here, the chairs and the bays, not triaged
// first, then by level, then the longest since triage; each row its level and time (red once past the level's time), where it is, and
// Triage (or Retriage) and Take. Arrived (N) opens its card under the toolbar; the triage card opens under its row, from the row, after
// Arrived, or from the board's Triage button (?stay=…&card=triage). The words tick every 30 seconds and with each read; the board's read comes again every 30 seconds.
// It is a tab because a pack may not add to the base board's toolbar or reorder its no-bed list (a core door; for the owner).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { packOp, write } from '@core/db/rpc'
import { move, oneSet } from '@core/db/entries'
import { banner } from '@core/db/views'
import type { PresenceRow } from '@core/db/types'
import type { ScreenProps } from '@core/screens/registry'
import { useDepartment } from '@core/hooks/organization'
import { useStays } from '@core/hooks/reads'
import { refresh } from '@core/hooks/writes'
import { staysKey } from '@core/screens/ward/tiles'
import { Button, Card, Empty, Kbd, ListRow, ScreenFrame, Spinner, Tag, errorText, type RowMark, type ScreenView } from '@core/ui'
import { boardOf, dur, order, rowWords, views as countViews, type Board } from './board'
import { levelWord, toneOf } from './scale'
import type { Arrival } from './triage'
import { Arrived } from './Arrived'
import { TriageCard } from './TriageCard'

type View = 'all' | 'untriaged' | 'past'
type Carried = { stay: string; arrival: Arrival | null; ref?: string }
const SEX: Record<string, string> = { male: 'M', female: 'F' }

export function Patients({ dept }: ScreenProps) {
  const { org, can } = useDepartment(); const navigate = useNavigate(); const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const stays = useStays(dept.id)
  const rows = useMemo(() => stays.data?.rows ?? [], [stays.data])
  const read = can('read:record')
  const boardQ = useQuery({ queryKey: ['casualty-board', dept.id, staysKey(rows)], queryFn: () => packOp<Board>('casualty.board', dept.id, {}, 'TREAT'),
    enabled: rows.length > 0 && read, placeholderData: keepPreviousData, retry: false, refetchInterval: 30_000 })
  const board = boardQ.isError ? null : boardOf(boardQ.data)
  // the clock: every 30 seconds, and whenever a read comes back
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setClock(Date.now()), 30_000); return () => clearInterval(t) }, [])
  const [view, setView] = useState<View>('all'); const [arriving, setArriving] = useState(false); const [carried, setCarried] = useState<Carried | null>(null)
  const [err, setErr] = useState<string | null>(null); const [taking, setTaking] = useState<string | null>(null)
  const mayArrive = can('write:admitted')
  const opened = params.get('card') === 'triage' ? params.get('stay') : null
  // N opens Arrived, when no field has the focus and no modifier is held
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || el.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      if ((e.key === 'n' || e.key === 'N') && mayArrive) { e.preventDefault(); setArriving(true) }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [mayArrive])
  // the opened card in view
  useEffect(() => { if (opened) document.getElementById(`triage-${opened}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [opened, rows.length])
  if (!org) return null

  const now = Math.max(clock, stays.dataUpdatedAt, boardQ.dataUpdatedAt)
  const open = (stay: string) => setParams((q) => { q.set('stay', stay); q.set('card', 'triage'); return q }, { replace: true })
  const close = () => { setCarried(null); setParams((q) => { q.delete('stay'); q.delete('card'); return q }, { replace: true }) }
  const c = countViews(rows, board, now)
  const vs: ScreenView<View>[] = [{ id: 'all', label: 'All', count: c.all },
    { id: 'untriaged', label: 'Not triaged', count: c.untriaged, needs: c.untriagedLong > 0 ? 'danger' : 'warn' },
    { id: 'past', label: 'Past the level\'s time', count: c.past, needs: 'danger' }]
  // the view's rows, and the opened card's row whatever the view (after Arrived, or from the board's link)
  const shown = order(rows, board, now).filter((r) => {
    if (r.item === opened) return true
    const w = rowWords(r, board, now); return view === 'all' || (view === 'untriaged' ? board && !w.triaged : w.past)
  })
  const mayTriage = can('write:casualty.triage')
  const places = org.places.filter((p) => p.department_id === dept.id)
  const taken = new Set(rows.flatMap((r) => r.place_id ? [r.place_id] : []))
  const placeName = (r: PresenceRow) => r.place_id ? places.find((p) => p.id === r.place_id)?.name ?? 'Another place' : 'Chairs'

  async function take(r: PresenceRow) {
    setTaking(r.item); setErr(null)
    try {
      await write(oneSet([move('assigned', { id: r.item, patient_id: r.patient_id, latest_entry: r.latest_entry }, dept.id, { user_id: org!.me.id })]))
      refresh(qc); void qc.invalidateQueries({ queryKey: ['casualty-board'] }); void qc.invalidateQueries({ queryKey: ['pack-tiles'] })
    } catch (e) { setErr(errorText(e)) } finally { setTaking(null) }
  }

  return <ScreenFrame views={vs} view={view} onView={setView} notice={err && <p className="text-13 text-danger">{err}</p>}
    action={mayArrive && <Button onClick={() => setArriving(true)}>Arrived <Kbd className="ms-1">N</Kbd></Button>}>
    {arriving && <Arrived dept={dept} onCancel={() => setArriving(false)}
      onArrived={(stay, arrival, ref) => { setArriving(false); setCarried({ stay, arrival, ref }); open(stay) }} />}
    {stays.isLoading ? <Spinner /> : !rows.length ? <Card><Empty>No one in {dept.name} — Arrived (N) starts a stay</Empty></Card>
    : !shown.length ? <Card><Empty>No one here.</Empty></Card>
    : <Card><ul aria-label={`${dept.name}: patients`}>{shown.map((r) => {
      const i = stays.data?.patients[r.patient_id]; const p = i ? banner(i) : null; const w = rowWords(r, board, now)
      const status = w.level ? <Tag tone={toneOf(w.level) ?? 'neutral'}>{levelWord(w.level)}</Tag> : board ? <Tag tone="warn">not triaged</Tag> : null
      const time = w.level ? w.words.slice(1) : board ? [{ text: dur((now - Date.parse(r.checked_in_at)) / 60_000), tone: w.words[0]?.tone }] : w.words
      const marks: RowMark[] = [...time.map((x, n) => ({ key: `t${n}`, word: x.text, ...(x.tone ? { tone: x.tone } : {}) })), { key: 'place', word: placeName(r) }]
      const mine = r.assigned_id === org.me.id
      return <ListRow key={r.item} number={p ? `#${p.record_number}` : ''} name={p ? `${p.given_name} ${p.family_name}` : 'Patient'}
        age={i ? `${SEX[i.gender] ?? '?'} ${i.birth_date ? p!.age : '?'}` : ''} status={status} marks={marks} minutes={null} onOpen={() => navigate(`/visit/${r.item}`)}
        actions={<>{mayTriage && <Button size="xs" variant="outline" onClick={() => open(r.item)}>{w.level ? 'Retriage' : 'Triage'}</Button>}
          {can('write:discharged') && !mine && <Button size="xs" variant="ghost" loading={taking === r.item} onClick={() => void take(r)}>Take</Button>}</>}
        below={opened === r.item && mayTriage && <div id={`triage-${r.item}`}>
          <TriageCard dept={dept} row={r} identity={i} opening={stays.data?.entries[r.item] ?? stays.data?.entries[r.source_entries[0]]} facts={board?.stays[r.item]}
            arrival={carried?.stay === r.item ? carried.arrival : undefined} arrivalRef={carried?.stay === r.item ? carried.ref : undefined}
            places={places} taken={taken} onDone={close} onCancel={close} /></div>} />
    })}</ul></Card>}
  </ScreenFrame>
}
