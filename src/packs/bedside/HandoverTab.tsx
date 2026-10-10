// The Handover tab beside the bed board (spec/openCare.md §5.6, W3a): a row per stay admitted here with the facts from the record (the
// ward tile's own words, each active alert, the orders out) and the last handover in this stay; two boxes, what happened this shift and
// what the next shift should do. Sign writes each bed with words as the base's note, kind handover, in its stay, one set per patient,
// with the facts at handover copied in. Read when the stays change, on the clinic's hints and after its own Sign, never on a timer (each
// read is logged for treatment; C1). Words typed and not signed stay while the app is open, never in the browser's storage.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { newId, oneSet } from '@core/db/entries'
import { packOp, write } from '@core/db/rpc'
import type { PresenceRow } from '@core/db/types'
import { banner, userName } from '@core/db/views'
import { useLive } from '@core/hooks/live'
import { useDepartment } from '@core/hooks/organization'
import { useStays } from '@core/hooks/reads'
import { refresh } from '@core/hooks/writes'
import type { ScreenProps } from '@core/screens/registry'
import { startOf, stayDay } from '@core/screens/chart/model/encounter'
import type { TileCtx } from '@core/screens/ward/tiles'
import { Button, Card, Empty, Input, Kbd, ScreenFrame, Spinner, Tag, Textarea, errorText, type ScreenView } from '@core/ui'
import { hm } from '@core/ui/time'
import { shiftsIn } from './balance'
import { factsOf, handoverNote, handoverRows, NO_BOXES, shiftNow, type Boxes, type HandoverRead, type HandoverRow } from './handover'
import { staysKey } from './news2'
import { useWardRead, wardLine } from './wardline'

/** words typed and not signed, per user and department: kept while the app is open (tab switches), never in the browser's storage; a
 *  different user on the same window starts empty */
const kept = new Map<string, Record<string, Boxes>>()
let keptFor: string | null = null
/** another user's words are forgotten first (the demo never signs out: a nurse after a nurse on the same window) */
const mine = (me: string) => { if (me && keptFor !== me) { kept.clear(); keptFor = me } }
const keptOf = (me: string, key: string) => { mine(me); return kept.get(key) ?? {} }
const keep = (me: string, key: string, b: Record<string, Boxes>) => { mine(me); kept.set(key, b) }
type View = 'all' | 'todo'

export function HandoverTab({ dept }: ScreenProps) {
  const { org, can } = useDepartment(); const navigate = useNavigate(); const qc = useQueryClient()
  const stays = useStays(dept.id); const rows = stays.data?.rows ?? []
  const ward = useWardRead(dept)
  const may = can('read:record')
  useLive(org && may ? `organization:${org.organization.id}` : null, [['bedside.handover']])
  const ho = useQuery({ queryKey: ['bedside.handover', dept.id, staysKey(rows)], enabled: may && rows.length > 0, retry: false,
    placeholderData: keepPreviousData, queryFn: () => packOp<HandoverRead>('bedside.handover', dept.id, {}, 'TREAT') })
  // a clock for the shift's words only: it reads nothing
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t) }, [])
  const me = org?.me.id ?? ''; const keyOf = `${me}:${dept.id}`
  const [boxes, setBoxes] = useState<Record<string, Boxes>>(() => keptOf(me, keyOf))
  useEffect(() => { keep(me, keyOf, boxes) }, [me, keyOf, boxes])
  const [view, setView] = useState<View>('all')
  const [busy, setBusy] = useState<{ n: number; of: number } | null>(null); const signing = useRef(false)
  const [failed, setFailed] = useState<string[]>([])
  if (!org) return null

  const s = shiftsIn(org, dept.id); const sh = shiftNow(s, now)
  const place = (r: PresenceRow) => org.places.find((p) => p.id === r.place_id) ?? null
  const identity = (r: PresenceRow) => stays.data?.patients[r.patient_id] ?? null
  const ctxOf = (r: PresenceRow): TileCtx => ({ dept, place: place(r), identity: identity(r), day: stayDay(startOf(r, stays.data)), can, org, read: ward })
  const all = handoverRows(rows, ho.data, s, sh, (r) => place(r)?.position ?? null, false, (r) => startOf(r, stays.data))
  const list = view === 'todo' ? all.filter((x) => !x.done) : all
  const facts = (x: HandoverRow) => factsOf(wardLine(x.row, ctxOf(x.row), now), x.stay?.alerts ?? [], x.row.orders_out)
  const nameOf = (r: PresenceRow) => { const i = identity(r); const b = i ? banner(i) : null; return b ? `${b.given_name} ${b.family_name}` : 'Patient' }
  const boxOf = (item: string) => boxes[item] ?? NO_BOXES
  const put = (item: string, patch: Partial<Boxes>) => setBoxes((b) => ({ ...b, [item]: { ...(b[item] ?? NO_BOXES), ...patch } }))
  const clear = (item: string) => setBoxes((b) => { const rest = { ...b }; delete rest[item]; return rest })
  const n = all.filter((x) => { const b = boxOf(x.row.item); return !!(b.shift.trim() || b.next.trim()) }).length
  const mayWrite = can('write:note')

  async function sign() {
    if (signing.current || !mayWrite) return
    const todo = all.flatMap((x) => { const note = handoverNote(facts(x), boxOf(x.row.item), sh); return note ? [{ x, note }] : [] })
    if (!todo.length) return
    signing.current = true; const out: string[] = []
    try {
      for (const [i, { x, note }] of todo.entries()) {
        setBusy({ n: i + 1, of: todo.length })
        try { await write(oneSet([{ id: newId(), type: 'note', patient_id: x.row.patient_id, department_id: dept.id, visit_id: x.row.item, data: note }]))
              clear(x.row.item) }
        catch (e) { out.push(`${place(x.row)?.name ?? 'No bed'} · ${nameOf(x.row)}: not saved — ${errorText(e)}`) }
      }
    } finally {
      refresh(qc); void qc.invalidateQueries({ queryKey: ['bedside.handover'] }); setBusy(null); setFailed(out); signing.current = false
    }
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void sign() } }
  const views: ScreenView<View>[] = [{ id: 'all', label: 'All beds', count: all.length }, { id: 'todo', label: 'To hand over', count: ho.data ? all.filter((x) => !x.done).length : undefined }]

  return <ScreenFrame views={views} view={view} onView={setView}
    date={<span className="text-13 text-muted">{sh.from} → {sh.to} · handover at {sh.at}</span>}
    action={<Button size="sm" onClick={() => void sign()} disabled={!n || !!busy || !mayWrite}>
      {busy ? `Signing ${busy.n} of ${busy.of}…` : `Sign the handover${n ? ` · ${n}` : ''}`}<Kbd>⌘↵</Kbd></Button>}
    notice={(ho.error || failed.length > 0) && <div className="grid gap-0.5 text-14 text-danger">{ho.error && <p>{errorText(ho.error)}</p>}{failed.map((f) => <p key={f}>{f}</p>)}</div>}>
    {stays.isLoading ? <Spinner />
    : !all.length ? <Card><Empty>No one is admitted here.</Empty></Card>
    : !list.length ? <Card><Empty>Every bed is handed over this shift.</Empty></Card>
    : <Card><ul aria-label="Handover" onKeyDown={onKey}>{list.map((x) => {
      const r = x.row; const i = identity(r); const b = i ? banner(i) : null; const bed = place(r)?.name ?? 'No bed'; const last = x.stay?.last; const box = boxOf(r.item)
      const by = last ? userName(org, last.by) : null
      return <li key={r.item} className="grid gap-2 border-t border-line px-4 py-3 first:border-t-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-13">
          <span className="w-14 shrink-0 font-mono text-faint">{bed}</span>
          <button type="button" onClick={() => navigate(`/visit/${r.item}`)} className="font-medium text-fg hover:underline focus-ring">{nameOf(r)}</button>
          <span className="text-muted">{[b ? `${b.sex[0]?.toUpperCase() ?? ''} ${b.age}`.trim() : null, `day ${stayDay(startOf(r, stays.data))}`, r.reason].filter(Boolean).join(' · ')}</span>
          <span className="flex flex-wrap gap-1">{facts(x).map((f, k) => <Tag key={k} tone={f.tone ?? 'neutral'}>{f.text}</Tag>)}
            {x.done && last && <Tag tone="ok">Handed over {hm(last.at)}{by ? ` · ${by}` : ''}</Tag>}</span>
        </div>
        <p className="whitespace-pre-line text-12 text-faint sm:ps-16">{last ? `${last.heading ?? 'Handover'} · ${hm(last.at)}${by ? ` · ${by}` : ''} — ${last.text ?? ''}` : ho.data ? 'No handover yet in this stay' : ho.error ? 'The last handover could not be read' : 'The last handover is not read yet'}</p>
        <div className="grid gap-1.5 sm:ps-16">
          <Textarea autoGrow minRows={1} value={box.shift} onChange={(e) => put(r.item, { shift: e.target.value })} aria-label={`${bed} · ${nameOf(r)}: what happened this shift`}
            placeholder="What happened this shift — situation and what you found" />
          <Input value={box.next} onChange={(e) => put(r.item, { next: e.target.value })} aria-label={`${bed} · ${nameOf(r)}: for the next shift`}
            placeholder="For the next shift: what to do, what to chase" />
        </div>
      </li> })}</ul></Card>}
  </ScreenFrame>
}
