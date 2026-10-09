// The Obs due tab beside the bed board (spec/openCare.md §5.6, W1): one row per stay admitted here — the bed, the patient, NEWS2 in its
// band's colour, a 3 in one sign, "obs due 15:06" or "obs overdue 20 min" in amber, and the ward's rule ("every hour · tell the doctor
// caring for the patient") — the most overdue first, then the stays with no NEWS2 yet. A row opens the stay, where /v writes the obs.
// Read when the stays change, on the clinic's hints and after the user's own writes, never on a timer (each read is logged for
// treatment; C1); the minutes tick by themselves.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { packOp } from '@core/db/rpc'
import type { PresenceRow } from '@core/db/types'
import { banner } from '@core/db/views'
import { useDepartment } from '@core/hooks/organization'
import { useStays } from '@core/hooks/reads'
import type { ScreenProps } from '@core/screens/registry'
import { tableOf } from '@core/screens/visit/score'
import type { TileWord } from '@core/screens/ward/tiles'
import { Card, Empty, ScreenFrame, Spinner, errorText, type ScreenView } from '@core/ui'
import { staysKey, tileWords } from './news2'
import { adultHere, dueOf, dueRows, type ObsDueRead } from './obsdue'
import { everyWords } from './response'

type View = 'late' | 'all'
const TONE: Record<string, string> = { warn: 'text-warn', danger: 'text-danger' }
/** a word in its state's colour (the words always say it) */
function Word({ w, fallback = 'text-fg' }: { w: string | TileWord; fallback?: string }) {
  return typeof w === 'string' ? <span className={fallback}>{w}</span> : <span className={(w.tone && TONE[w.tone]) || fallback}>{w.text}</span>
}

export function ObsDueTab({ dept }: ScreenProps) {
  const { org, can } = useDepartment(); const navigate = useNavigate()
  const stays = useStays(dept.id); const rows = stays.data?.rows ?? []
  const due = useQuery({ queryKey: ['visit_queue', 'bedside.obs_due', dept.id, staysKey(rows)], enabled: can('read:record') && rows.length > 0, retry: false,
    queryFn: () => packOp<ObsDueRead>('bedside.obs_due', dept.id, {}, 'TREAT') })
  // a clock for the minutes only: it reads nothing
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  const [view, setView] = useState<View>('all')
  if (!org) return null
  const identity = (r: PresenceRow) => stays.data?.patients[r.patient_id] ?? null
  const list = dueRows(rows, due.data, now, (r) => adultHere(identity(r), now))
  const views: ScreenView<View>[] = [{ id: 'late', label: 'Overdue', count: list.filter((r) => r.late).length, needs: 'warn' }, { id: 'all', label: 'All', count: list.length }]
  const shown = view === 'late' ? list.filter((r) => r.late) : list
  return <ScreenFrame views={views} view={view} onView={setView} notice={due.error && <p className="text-14 text-danger">{errorText(due.error)}</p>}>
    {stays.isLoading || (due.isLoading && rows.length) ? <Spinner />
    : !list.length ? <Card><Empty>No one is admitted here.</Empty></Card>
    : !shown.length ? <Card><Empty>No one is overdue.</Empty></Card>
    : <Card className="p-0"><ul aria-label="Obs due" className="divide-y divide-line">{shown.map((r) => {
      const who = identity(r.row); const b = who ? banner(who) : null; const adult = adultHere(who, now)
      // the stay's NEWS2 as the server read it, a child's too (its colour is news2.ts's rule); the due word only for an adult. Until the
      // read has answered (or when it failed), no NEWS2 word at all: the row never says "no NEWS2 yet" of a stay it could not read
      const news = dueOf({ obs: due.data?.stays }, r.row.item)
      const first = due.data ? tileWords(r.row, { org, identity: who }, news ? { news2: { [r.row.item]: news } } : undefined, now)?.words : undefined
      const word = typeof first === 'string' ? first : first?.[0]
      const table = r.due?.level === 'single' ? tableOf(org.scores, r.due.score, r.due.version) : undefined
      return <li key={r.row.item}>
        <button type="button" onClick={() => navigate(`/visit/${r.row.item}`)} className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-start text-13 hover:bg-hover focus-ring">
          <span className="font-mono text-faint">{org.places.find((p) => p.id === r.row.place_id)?.name ?? 'No bed'}</span>
          <span className="font-medium text-fg">{b ? `${b.given_name} ${b.family_name}` : '—'}</span>
          {word ? <Word w={word} /> : due.data ? <span className={r.late ? 'text-warn' : 'text-fg'}>no NEWS2 yet</span> : null}
          {r.due && table && <span className="text-warn">3 in {r.due.threes.map((k) => table.items.find((x) => x.key === k)?.labels.en || k).join(', ')}</span>}
          {r.word ? <Word w={r.word} /> : news && !adult ? <span className="text-muted">NEWS2 is for 16 and over</span> : null}
          {r.due && <span className="text-faint">{everyWords(r.due.every)}{r.due.tell ? ` · tell ${r.due.tell}` : ''}</span>}
        </button></li>
    })}</ul></Card>}
  </ScreenFrame>
}
