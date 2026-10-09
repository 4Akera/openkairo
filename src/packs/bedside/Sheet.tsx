// The Treatment sheet (spec/openCare.md §5.6, piece 3b): in the record panel, the open stay's medicines and their times, today,
// yesterday or the whole stay (the clinic's days), from the pack's own op (bedside.sheet, the server's one reading, so it never
// disagrees with the round). Each time opens its dose: "✓ 02:00 Nour", "08:00 late 6 h", "14:00 due", "22:00", "✕ 08:00 Vomiting",
// "02:00 no record"; then the doses that took no time. Not prescribed in this stay, and the stopped medicines, fold at the foot.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { packOp } from '@core/db/rpc'
import { userName } from '@core/db/views'
import type { SectionBody } from '@core/screens/chart/sections'
import { Chip, Empty, Spinner, Tag, errorText, hm, shortDate, useFold, ymd } from '@core/ui'
import { REASONS, drugWords, howWords, lateWords, shortName, type MedicineRead, type SheetRead } from './doses'
import { openStay } from './news2'
import { byDay } from './round'

type Day = 'today' | 'yesterday' | 'stay'
const DAYS: [Day, string][] = [['today', 'Today'], ['yesterday', 'Yesterday'], ['stay', 'The whole stay']]
type Tone = 'ok' | 'warn' | 'danger' | 'neutral'

export function Sheet({ p }: SectionBody) {
  const stay = openStay(p.rec); const org = p.ctx.org
  const here = stay?.department_id === p.departmentId
  const uses = !!org?.allDepartments.find((d) => d.id === p.departmentId)?.packs.includes('bedside')
  const [day, setDay] = useState<Day>('today')
  const [awayOpen, setAwayOpen] = useFold('bedside.sheet.elsewhere', false); const [stoppedOpen, setStoppedOpen] = useFold('bedside.sheet.stopped', false)
  const q = useQuery({ queryKey: ['record', p.patientId, 'bedside.sheet', stay?.item, day], enabled: !!stay && here && uses,
    queryFn: () => packOp<SheetRead>('bedside.sheet', p.departmentId, { stay: stay!.item, day }, 'TREAT') })
  if (!uses) return <Empty size="sm">Kept on a ward that uses Ward nursing</Empty>
  if (!stay || !here) return <Empty size="sm">The treatment sheet is kept on the ward of an open stay</Empty>
  const now = q.data?.now ? new Date(q.data.now).getTime() : 0
  const who = (id?: string) => id ? shortName(userName(org, id)) : ''
  const meds = q.data?.medicines ?? []
  const quiet = (m: MedicineRead) => m.status !== 'active' && !m.slots.length && !m.extra.length
  const shown = meds.filter((m) => !m.elsewhere && !quiet(m)).sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || drugWords(a).localeCompare(drugWords(b)))
  const away = meds.filter((m) => m.elsewhere); const stopped = meds.filter((m) => !m.elsewhere && quiet(m))
  const time = (key: string, words: string, tone: Tone, dose?: string) => dose
    ? <button key={key} type="button" onClick={() => p.open(dose)} className="rounded-sm focus-ring"><Tag tone={tone}>{words}</Tag></button>
    : <Tag key={key} tone={tone}>{words}</Tag>
  const times = (m: MedicineRead) => [...m.slots.map((x) => { const pre = x.first ? 'first dose ' : ''; const t = hm(x.due)
    return x.state === 'given' ? time(x.due, `✓ ${pre}${t} ${who(x.by)}`.trim(), 'ok', x.dose)
      : x.state === 'not_given' ? time(x.due, `✕ ${pre}${t} ${x.not_given ? REASONS[x.not_given] : 'Not given'}`, 'warn', x.dose)
      : x.state === 'late' ? time(x.due, `${pre}${t} ${lateWords(x.due, now)}`, 'danger') : x.state === 'due' ? time(x.due, `${pre}${t} due`, 'warn')
      : x.state === 'missed' ? time(x.due, `${pre}${t} no record`, 'warn') : time(x.due, `${pre}${t}`, 'neutral') }),
    ...m.extra.map((x) => x.status === 'not-done' ? time(x.dose, `✕ ${hm(x.at)} ${x.not_given ? REASONS[x.not_given] : 'Not given'}`, 'warn', x.dose)
      : time(x.dose, `✓ ${hm(x.at)} ${m.prn ? who(x.by) : 'extra'}`.trim(), 'ok', x.dose))]
  const today = q.data?.now ? ymd(q.data.now) : ''
  const days = (m: MedicineRead) => byDay(m).map((d) => <Tag key={d.day}>{d.day === today ? 'today' : shortDate(`${d.day}T12:00:00Z`)}{d.given ? ` ✓${d.given}` : ''}{d.not ? ` ✕${d.not}` : ''}
    {d.late ? ` · ${d.late} late` : ''}{d.missed ? ` · ${d.missed} no record` : ''}</Tag>)
  const fold = (words: string, n: number, on: boolean, set: (v: boolean) => void) =>
    <button type="button" aria-expanded={on} onClick={() => set(!on)} className="rounded-sm text-start text-13 text-muted hover:text-fg focus-ring">{words} · {n}</button>
  const head = (m: MedicineRead) => <p className="text-13"><span className="font-medium text-fg">{drugWords(m)}</span> <span className="text-12 text-muted">{howWords(m)}</span></p>
  return <div className="grid gap-2">
    <div role="group" aria-label="Days" className="flex flex-wrap gap-1.5">{DAYS.map(([k, w]) => <Chip key={k} shape="pill" on={day === k} onClick={() => setDay(k)}>{w}</Chip>)}</div>
    {q.isLoading ? <Spinner label="Reading the sheet" /> : q.isError ? <Empty size="sm">{errorText(q.error)}</Empty> : !shown.length && !away.length && !stopped.length
      ? <Empty size="sm">No medicine prescribed in this stay</Empty>
      : <ul aria-label="Treatment sheet" className="divide-y divide-line">{shown.map((m) => <li key={m.medication} className="grid gap-1 py-1.5">{head(m)}
        <div className="flex flex-wrap gap-1">{day === 'stay' ? days(m) : times(m)}
          {m.unset && <Tag tone="warn">times not set · ask the doctor</Tag>}{m.status !== 'active' && <Tag>{m.status}</Tag>}</div></li>)}</ul>}
    {away.length > 0 && <div className="text-13">{fold('On the list, not prescribed in this stay', away.length, awayOpen, setAwayOpen)}
      {awayOpen && <ul className="grid gap-1 pt-1">{away.map((m) => <li key={m.medication} className="grid gap-1">{head(m)}{m.extra.length > 0 && <div className="flex flex-wrap gap-1">{times(m)}</div>}</li>)}</ul>}</div>}
    {stopped.length > 0 && <div className="text-13">{fold('Stopped', stopped.length, stoppedOpen, setStoppedOpen)}
      {stoppedOpen && <ul className="grid gap-1 pt-1">{stopped.map((m) => <li key={m.medication} className="text-13 text-muted">{drugWords(m)} · {m.status} {shortDate(m.since)}</li>)}</ul>}</div>}
  </div>
}
