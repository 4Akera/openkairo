// The Drug round (bedside.round, spec/openCare.md §5.6, piece 3): the ward's doses from the doctors' current prescriptions at the ward's
// dose times, read once a minute and after each write. Its views: Due now (a medicine prescribed in this stay starts with "first dose
// now" at the top), Late, As needed, Given this round; under Due now, folded, the medicines whose times are not set and those on the
// list but not prescribed in this stay ("ask the doctor": listed, never dropped). Keys on the list: ↑↓ move, ↵ Give, → or a click opens
// the card, N the reasons, 1–6 picks one, Esc closes. ↵ and Give write at once, as prescribed, when the prescription names its dose
// (else the card asks for it): the base's given as Ward nursing's dose, naming the time it is for. A late dose gives like any other,
// and the last dose given is shown beside Give: facts, never a stop. ?stay= narrows the round to one stay (the tile's Give).
import { useState, type KeyboardEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Quantity } from '@core/db/shapes.generated'
import { oneSet } from '@core/db/entries'
import { packOp } from '@core/db/rpc'
import { banner, userName } from '@core/db/views'
import { useDepartment } from '@core/hooks/organization'
import { useStays } from '@core/hooks/reads'
import { newId, useWrite } from '@core/hooks/writes'
import type { ScreenProps } from '@core/screens/registry'
import { Button, Card, Chip, Empty, ScreenFrame, SearchInput, Spinner, Tag, errorText, hm, useFold, type ScreenView } from '@core/ui'
import { DOSE, REASONS, REASON_KEYS, doseData, drugWords, hasDose, howWords, lateWords, shortName, type Reason, type RoundRead } from './doses'
import { countsOf, elsewhereOf, matches, nextRound, nowDue, roundWords, rowsOf, unsetOf, type RoundRow, type View } from './round'
import { roundOf } from './schedule'
import { DoseCard, LastDose } from './DoseCard'

type Open = { key: string; mode: 'give' | 'not' } | null
const ACTS = new Set(['due', 'late', 'prn', 'unset'])

export function Round({ dept }: ScreenProps) {
  const { org, can } = useDepartment(); const qc = useQueryClient(); const w = useWrite(); const navigate = useNavigate()
  const [params, setParams] = useSearchParams(); const only = params.get('stay')
  const q = useQuery({ queryKey: ['visit_queue', 'bedside.round', dept.id], queryFn: () => packOp<RoundRead>('bedside.round', dept.id, {}, 'TREAT'),
    refetchInterval: 60_000, enabled: can('read:record') })
  const stays = useStays(dept.id)
  const [view, setView] = useState<View>('due'); const [find, setFind] = useState('')
  const [open, setOpen] = useState<Open>(null); const [cur, setCur] = useState(0)
  const [unsetOpen, setUnsetOpen] = useFold('bedside.round.unset', true); const [awayOpen, setAwayOpen] = useFold('bedside.round.elsewhere', false)
  const may = can('write:bedside.dose')
  const all = q.data
  const r: RoundRead | undefined = all && only ? { ...all, stays: all.stays.filter((s) => s.stay === only) } : all
  const now = r ? new Date(r.now).getTime() : 0
  const place = (id: string | null) => id ? org?.places.find((p) => p.id === id) : undefined
  const bed = (id: string | null) => place(id)?.name ?? 'No bed'
  const order = (id: string | null) => place(id)?.position ?? 1e6
  const name = (pid: string) => { const i = stays.data?.patients[pid]; if (!i) return 'Patient'; const b = banner(i); return `${b.given_name} ${b.family_name}` }
  const who = (id?: string) => id ? shortName(userName(org, id)) : ''
  const words = { bed, name }
  const counts = r ? countsOf(r) : { due: 0, late: 0, prn: 0, given: 0 }
  const views: ScreenView<View>[] = [{ id: 'due', label: 'Due now', count: counts.due, needs: 'warn' }, { id: 'late', label: 'Late', count: counts.late, needs: 'danger' },
    { id: 'prn', label: 'As needed', count: counts.prn }, { id: 'given', label: 'Given this round', count: counts.given }]
  const rows = r ? rowsOf(r, view, order).filter((x) => matches(x, find, words)) : []
  const unset = r && view === 'due' ? unsetOf(r, order).filter((x) => matches(x, find, words)) : []
  const away = r && view === 'due' ? elsewhereOf(r, order).filter((x) => matches(x, find, words)) : []
  const list = [...rows, ...(unsetOpen ? unset : [])]
  const at = Math.min(cur, Math.max(0, list.length - 1))
  const onlyStay = only ? all?.stays.find((s) => s.stay === only) : undefined

  const after = { onSuccess: () => { setOpen(null); void qc.invalidateQueries({ queryKey: ['bedside.board'] }) } }
  const write = (row: RoundRow, data: ReturnType<typeof doseData>) =>
    w.mutate(oneSet([{ id: newId(), type: DOSE, patient_id: row.patient_id, department_id: dept.id, visit_id: row.stay, data }]), after)
  const give = (row: RoundRow, c: { dose?: Quantity; site?: string; note?: string } = {}) => write(row, doseData(row.med, row.due, { given: true, ...c }))
  const notGiven = (row: RoundRow, reason: Reason) => write(row, doseData(row.med, row.due, { given: false, reason }))
  // ↵ and Give: in one key when the prescription names its dose, else its card asks for the dose given
  const quick = (row: RoundRow) => hasDose(row.med) ? give(row) : setOpen({ key: row.key, mode: 'give' })
  const acts = (row: RoundRow) => may && (ACTS.has(row.state) || (row.state === 'not_given' || (row.state === 'extra' && row.dose?.status === 'not-done' && (!!row.med.prn || !!row.med.unset))))
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('input, textarea, form')) return
    const row = list[at]; if (!row) return
    const o = open?.key === row.key ? open : null
    // ↵, → and N act on the cursor's row only when the list itself has focus: a focused button (Give, a reason, Close) keeps its own
    // Enter, so a reason or another row's button is never taken as the cursor row's Give
    const self = e.target === e.currentTarget
    if (!self && !(e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape' || (o?.mode === 'not' && /^[1-6]$/.test(e.key)))) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setCur(Math.max(0, Math.min(list.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))); setOpen(null) }
    else if (e.key === 'Escape') setOpen(null)
    else if (!acts(row)) return
    else if (e.key === 'Enter') { e.preventDefault(); quick(row) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setOpen({ key: row.key, mode: 'give' }) }
    else if ((e.key === 'n' || e.key === 'N') && ACTS.has(row.state)) { e.preventDefault(); setOpen({ key: row.key, mode: 'not' }) }
    else if (o?.mode === 'not' && /^[1-6]$/.test(e.key)) { e.preventDefault(); notGiven(row, REASON_KEYS[Number(e.key) - 1]) }
  }

  const time = (row: RoundRow) => {
    const d = row.dose; const by = who(d?.by)
    if (d) return d.status === 'not-done' ? <Tag tone="warn">✕ {d.not_given ? REASONS[d.not_given] : 'Not given'}{by ? ` · ${by}` : ''} {hm(d.at)}</Tag>
      : <Tag tone="ok">✓ {by} {hm(d.at)}</Tag>
    if (row.state === 'prn') return <span className="text-13 text-muted">as needed</span>
    if (row.state === 'unset') return <Tag tone="warn">times not set</Tag>
    if (row.state === 'elsewhere') return <span className="text-13 text-muted">not prescribed in this stay</span>
    if (!row.due) return null
    if (row.state === 'late') { const nd = nowDue(row.med)
      return <span className="text-13 font-medium text-danger tnum">{hm(row.due)} · {lateWords(row.due, now)}{nd ? ` · ${nd} now due` : ''}</span> }
    return <span className="flex items-center gap-1.5 text-13 tnum text-fg">{row.first && <Tag tone="info">first dose now</Tag>}{hm(row.due)}</span>
  }
  const line = (row: RoundRow, i: number) => {
    const isOpen = open?.key === row.key; const on = i === at
    const giveWord = row.state === 'not_given' || row.state === 'extra' ? 'Give now' : 'Give'
    return <li key={row.key} className={on ? 'bg-hover' : undefined}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2" onClick={() => { setCur(i); if (acts(row)) setOpen(isOpen ? null : { key: row.key, mode: 'give' }) }}>
        <span className="w-14 shrink-0 font-mono text-12 text-faint">{bed(row.place_id)}</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/visit/${row.stay}`) }} className="w-40 shrink-0 truncate rounded-sm text-start text-13 text-fg hover:underline focus-ring">{name(row.patient_id)}</button>
        <span className="min-w-0 flex-1"><span className="text-13 font-medium text-fg">{drugWords(row.med)}</span> <span className="text-12 text-muted">{howWords(row.med)}</span></span>
        <span className="shrink-0">{time(row)}</span>
        {row.state !== 'given' && <LastDose row={row} now={now} />}
        {acts(row) && <span className="flex shrink-0 gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" loading={w.isPending && on} onClick={() => { setCur(i); quick(row) }}>{giveWord}</Button>
          {ACTS.has(row.state) && <Button size="sm" variant="outline" aria-expanded={isOpen && open?.mode === 'not'}
            onClick={() => { setCur(i); setOpen(isOpen && open?.mode === 'not' ? null : { key: row.key, mode: 'not' }) }}>Not given</Button>}</span>}
      </div>
      {isOpen && <DoseCard row={row} now={now} busy={w.isPending} mode={open!.mode} onGive={(c) => give(row, c)} onNot={(x) => notGiven(row, x)} onClose={() => setOpen(null)} />}
    </li>
  }
  const next = r ? nextRound(roundOf(org, dept.id), now, org?.organization.time_zone ?? 'Africa/Cairo') : null
  const empty = only ? (onlyStay ? `Nothing for ${name(onlyStay.patient_id)} here` : 'This stay is not on the round') : view === 'due' ? `Nothing due now${next ? ` — the next round is ${next}` : ''}`
    : view === 'late' ? 'No dose late' : view === 'prn' ? 'No medicine as needed' : `Nothing given since the round opened at ${r ? hm(r.opens_at) : ''}`
  if (!can('read:record')) return <ScreenFrame><Card><Empty>The drug round is not for your role here.</Empty></Card></ScreenFrame>
  return <ScreenFrame views={views} view={view} onView={(v) => { setView(v); setOpen(null); setCur(0) }}
    filters={only && <Chip on onClick={() => setParams((p) => { p.delete('stay'); return p }, { replace: true })}>{onlyStay ? `${bed(onlyStay.place_id)} · ${name(onlyStay.patient_id)}` : 'This stay is not on the round'} ✕</Chip>}
    search={<SearchInput value={find} onChange={setFind} placeholder="Bed, name or medicine" className="w-full sm:w-64" />}
    date={r && <span className="text-13 text-muted tnum">{roundWords(r)}</span>}
    notice={w.error && <p role="alert" className="text-14 text-danger">{errorText(w.error)}</p>}>
    {q.isLoading ? <Spinner label="Reading the round" /> : q.isError ? <Card><Empty>{errorText(q.error)}</Empty></Card> : <div onKeyDown={keys} tabIndex={0} aria-label="The round's doses" className="grid gap-3 focus-ring rounded-xl">
      <Card><ul className="divide-y divide-line">{rows.length ? rows.map((x, i) => line(x, i)) : <li><Empty>{find ? 'No match here.' : empty}</Empty></li>}</ul></Card>
      {unset.length > 0 && <Card>
        <button type="button" aria-expanded={unsetOpen} onClick={() => setUnsetOpen(!unsetOpen)} className="flex w-full items-center gap-2 px-4 py-2 text-start text-13 font-medium text-warn focus-ring">
          Times not set · ask the doctor · {unset.length}</button>
        {unsetOpen && <ul className="divide-y divide-line border-t border-line">{unset.map((x, i) => line(x, rows.length + i))}</ul>}</Card>}
      {away.length > 0 && <Card>
        <button type="button" aria-expanded={awayOpen} onClick={() => setAwayOpen(!awayOpen)} className="flex w-full items-center gap-2 px-4 py-2 text-start text-13 font-medium text-muted focus-ring">
          On the list, not prescribed in this stay · ask the doctor · {away.length}</button>
        {awayOpen && <ul className="divide-y divide-line border-t border-line">{away.map((x) => <li key={x.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
          <span className="w-14 shrink-0 font-mono text-12 text-faint">{bed(x.place_id)}</span><span className="w-40 shrink-0 truncate text-13 text-fg">{name(x.patient_id)}</span>
          <span className="min-w-0 flex-1"><span className="text-13 font-medium text-fg">{drugWords(x.med)}</span> <span className="text-12 text-muted">{howWords(x.med)}</span></span>
          <LastDose row={x} now={now} /></li>)}</ul>}</Card>}
    </div>}
  </ScreenFrame>
}
