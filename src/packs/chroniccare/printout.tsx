// The Chronic care list as it prints (spec/openCare.md §5.8, Q29; the picture #chronic-list, Print the list): the clinic's header, the
// department, which view and condition, when it was printed, then the rows the screen shows — record number, name, age and sex, the
// conditions, what is off target, the checks due, when last here — so the nurse can phone down the paper. Built 2026-10-10 on the core's
// print facility (§3.13). *Chosen by Claude at the owner's request:* the core's A5 sheet (the core has no A4), a line per patient. Pure:
// npm run test:print renders it.
import type { PrintoutProps } from '@core/print/registry'
import { Num, PrintHeader, ReprintMark, Words } from '@core/print/parts'
import { dateTime } from '@core/ui/time'

export const LIST_KEY = 'chroniccare.list'
export interface ListRow { number: number | null; name: string; age: string; conditions: string; off: string; due: string; last: string }
export interface ListSheet { department: string; view: string; condition: string | null; at: string; rows: ListRow[] }
/** the same list printed again: the department, the view and the condition, on the day */
export const listThing = (s: Pick<ListSheet, 'department' | 'view' | 'condition' | 'at'>) => [s.department, s.view, s.condition ?? 'any', s.at.slice(0, 10)].join(' · ')

const th = { textAlign: 'start', fontWeight: 600, fontSize: '7.5pt', padding: '0.8mm 1mm', borderBottom: '0.3mm solid var(--fg)' } as const
const td = { padding: '0.8mm 1mm', borderBottom: '0.2mm solid var(--line)', verticalAlign: 'top' } as const
export function ChronicListSheet({ data: s, header, reprint }: PrintoutProps<ListSheet>) {
  return <article className="text-fg" style={{ fontSize: '8pt', lineHeight: 1.35, display: 'grid', gap: '3mm' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '4mm', borderBottom: '0.3mm solid var(--fg)', paddingBottom: '2mm' }}>
      <PrintHeader header={header} align="start" />
      <div style={{ textAlign: 'end', flexShrink: 0 }}><p style={{ margin: 0, fontSize: '11pt', fontWeight: 600 }}>Chronic care · {s.view}</p>
        <p style={{ margin: 0 }}><Words>{s.department}</Words>{s.condition ? ` · ${s.condition}` : ''}</p>
        <p style={{ margin: 0 }}><Num>{dateTime(s.at)}</Num> · {s.rows.length} {s.rows.length === 1 ? 'patient' : 'patients'}</p>
        <ReprintMark at={reprint} style={{ marginTop: '1mm' }} /></div>
    </div>
    {s.rows.length ? <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>{['Patient', 'Conditions', 'Off target', 'Checks due', 'Last here'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
      <tbody>{s.rows.map((r, i) => <tr key={i} style={{ breakInside: 'avoid' }}>
        <td style={td}>{r.number != null && <><Num>{r.number}</Num> </>}<b><Words>{r.name}</Words></b>{r.age && ` ${r.age}`}</td>
        <td style={td}>{r.conditions}</td><td style={td}>{r.off || '—'}</td><td style={td}>{r.due || '—'}</td><td style={{ ...td, whiteSpace: 'nowrap' }}>{r.last}</td></tr>)}</tbody></table>
      : <p style={{ margin: 0 }}>Nobody in this view.</p>}
  </article>
}
