// The prescription as it prints, on an A5 sheet (spec §4.6 the chart, §3.13 Printing; the owner's decisions of 2026-10-08): the clinic's
// header, the patient (the name as written, Arabic right to left; age and sex; record number), the date, each medicine with its line as
// the chart shows it and its directions in Arabic, right to left, then the doctor and the department, with room to sign. No price. A
// later copy is marked "Reprint" with its time. Pure: the node test renders it.
import type { PrintoutProps } from '../../../print/registry'
import { Arabic, Num, PrintHeader, ReprintMark, Words } from '../../../print/parts'
import { dateTime } from '../../../ui/time'
import type { RxSheet } from '../model/prescription'

const small = { fontSize: '9pt', margin: 0 } as const
export function PrescriptionSheet({ data: rx, header, reprint }: PrintoutProps<RxSheet>) {
  return <article className="text-fg" style={{ fontSize: '10.5pt', lineHeight: 1.4, display: 'grid', gap: '5mm' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '4mm', borderBottom: '0.3mm solid var(--fg)', paddingBottom: '3mm' }}>
      <PrintHeader header={header} align="start" size="large" />
      <div style={{ textAlign: 'end', flexShrink: 0 }}><p style={{ margin: 0, fontSize: '13pt', fontWeight: 600 }}>Prescription</p>
        <p dir="rtl" lang="ar" style={{ ...small, textAlign: 'end' }}>روشتة</p><ReprintMark at={reprint} style={{ marginTop: '1.5mm' }} /></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1mm 6mm' }}>
      <p style={{ margin: 0, fontSize: '12pt', fontWeight: 600 }}><Words>{rx.patient.name}</Words></p>
      <p style={{ ...small, textAlign: 'end' }}><Num>{dateTime(rx.at)}</Num></p>
      <p style={small}>{rx.patient.age_sex} · Record <Num>#{rx.patient.record}</Num></p>
    </div>
    <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '4mm' }}>
      {rx.lines.map((l, i) => <li key={i} style={{ display: 'grid', gap: '1mm', breakInside: 'avoid' }}>
        <p style={{ margin: 0, fontWeight: 600 }}><Num>{i + 1}.</Num> <Words>{l.drug}</Words></p>
        {(l.sig || l.quantity) && <p style={small}>{l.sig}{l.quantity && ` · ${l.quantity}`}</p>}
        {l.instructions && <p style={small}><Words>{l.instructions}</Words></p>}
        {l.arabic && <Arabic style={{ fontSize: '11pt' }}>{l.arabic}</Arabic>}
      </li>)}
    </ol>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '6mm', marginTop: '6mm' }}>
      <div><p style={{ margin: 0, fontWeight: 600 }}><Words>{rx.doctor}</Words></p><p style={small}><Words>{rx.department}</Words></p></div>
      <p style={{ ...small, borderTop: '0.3mm solid var(--fg)', paddingTop: '1mm', minWidth: '45mm', textAlign: 'center' }}>Signature</p>
    </div>
  </article>
}
