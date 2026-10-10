// The Vaccines section of the chart (spec/openCare.md §5.1 rule 2; picture #vax-chart): the national rows by age — each given (here or
// from the card, its date), not given with its reason, overdue, due or its due day — then the optional ones apart, the parents' choice.
// Read-only: a dose opens its entry in the center.
import type { SectionBody } from '@core/screens/chart/sections'
import { Empty, shortDate, ymd } from '@core/ui'
import { byAge, dosesOf, scheduleOf, statusOf, type RowState } from './schedule'
import { pregnantOf } from './words'
import { vaxCardOf } from './printout'
import { PrintCard } from './PrintCard'

function StateWords({ s, open }: { s: RowState; open: (item: string) => void }) {
  return <span className="grid">
    {s.notGiven.map((n) => <button key={n.item} type="button" onClick={() => open(n.item)} className="text-start text-12 text-warn hover:underline">✕ {shortDate(n.given_at)}{n.reason ? ` · ${n.reason}` : ''}</button>)}
    {s.state === 'given' && s.given ? <button type="button" onClick={() => open(s.given!.item)} className="text-start hover:underline"><span className="text-ok">✓</span> {shortDate(s.given.given_at)}
      <span className="text-12 text-faint"> {s.given.source === 'card' ? 'card' : 'here'}</span></button>
      : s.state === 'overdue' ? <span className="font-medium text-warn">overdue {s.weeksLate} wk</span>
      : s.state === 'due' ? <span className="font-medium text-accent">due now</span>
      : s.state === 'too_late' ? <span className="text-faint">past its age</span>
      : <span className="text-muted">due {shortDate(s.dueOn)}</span>}
  </span>
}

export function VaccinesSection({ p, own }: SectionBody) {
  const org = p.ctx.org; const sched = scheduleOf(org); const birth = p.r.identity.birth_date
  const entries = [...own.shown]
  // the entry an item opens: its latest version
  const open = (item: string) => { const e = entries.find((x) => x.item === item); if (e) p.open(e.id) }
  if (!sched.rows.length) return <Empty size="sm">No schedule loaded yet (Settings → Packs → Vaccines)</Empty>
  if (!birth) return <Empty size="sm">The birth date is not known, so nothing is worked out</Empty>
  const states = statusOf(sched.rows, dosesOf(entries), birth, ymd(new Date().toISOString()), pregnantOf(p.facts))
  const national = byAge(states.filter((s) => s.row.national)); const optional = states.filter((s) => !s.row.national)
  const series = [...new Set(optional.map((s) => s.row.vaccine))]
  // the child's card, printed from here (Q26 b): what this section shows, in Arabic
  const card = vaxCardOf(sched, dosesOf(entries), { name: p.r.identity.full_name, birth, record: p.r.patient.record_number },
    org?.allDepartments.find((d) => d.id === p.departmentId)?.name ?? '', ymd(new Date().toISOString()), pregnantOf(p.facts))
  return <div className="grid gap-2 text-13">
    {sched.source && <p className="text-end text-12 text-faint">{sched.source}{sched.version ? `, ${sched.version}` : ''} schedule</p>}
    <table className="w-full"><thead><tr className="text-11 uppercase tracking-[0.08em] text-faint"><th className="w-14 py-1 text-start font-medium">Age</th><th className="py-1 text-start font-medium">National</th><th /></tr></thead>
      <tbody>{national.map((g) => <tr key={g.age} className="border-t border-line align-top">
        <td className="py-1.5 pe-2 text-muted">{g.age}</td><td className="py-1.5 pe-2">{g.states.map((s) => s.row.name).join(' · ')}</td>
        <td className="py-1.5">{(() => { const worst = g.states.find((s) => s.state === 'overdue') ?? g.states.find((s) => s.state === 'due') ?? g.states.find((s) => s.state === 'later') ?? g.states.find((s) => s.notGiven.length) ?? g.states[0]
          return <StateWords s={worst} open={open} /> })()}</td></tr>)}</tbody></table>
    {series.length > 0 && <>
      <p className="pt-2 text-11 font-semibold uppercase tracking-[0.08em] text-faint">Optional · the parents&apos; choice</p>
      <ul className="grid gap-1">{series.map((v) => { const rows = optional.filter((s) => s.row.vaccine === v); const given = rows.filter((s) => s.state === 'given')
        const dueNow = rows.find((s) => s.state === 'due' || s.state === 'overdue'); const name = rows[0].row.name.replace(/ \(.*\)$/, '')
        return <li key={v} className="grid grid-cols-[7rem_1fr] gap-2"><span className="text-muted">{name}</span><span>
          {given.length > 0 && <><span className="text-ok">✓</span> {given.map((s) => s.row.age).join(', ')}<span className="text-12 text-faint"> here</span>{given.length === rows.length && <span className="text-12 text-faint"> · complete</span>}</>}
          {dueNow && <span className="text-accent">{given.length ? ' · ' : ''}{dueNow.row.dose > 1 && given.length ? `${dueNow.row.name.toLowerCase()} ${dueNow.row.dose === rows.length ? 'booster' : `dose ${dueNow.row.dose}`} due now` : 'offer now'}</span>}
          {!given.length && !dueNow && <span className="text-muted">{rows[0].row.age} · not given</span>}
        </span></li> })}</ul></>}
    <PrintCard card={card} patientId={p.patientId} departmentId={p.departmentId} />
  </div>
}
