// The receipt's one drawing (spec §5.4, the bill-receipt picture; §3.13 Printing): the clinic's header, its kind and number with the date
// and time, the patient and record number, what a refund gives back, the lines, the discount, the total, the cash received and the change
// (or the card), who took it, and, once given back, its refund. The screen shows it in a card; the receipt roll prints the same drawing
// (ReceiptSlip), so the paper says nothing the screen did not. Pure: the node test renders both.
import type { ClinicHeader } from '@core/print/header'
import { Num, PrintHeader, Words } from '@core/print/parts'
import { dateTime } from '@core/ui/time'
import { egp, type ReceiptView } from './money'

const row = { display: 'flex', justifyContent: 'space-between', gap: '0.75rem' } as const
export function ReceiptPaper({ view: v, header }: { view: ReceiptView; header: ClinicHeader }) {
  return <div className="grid gap-1 text-fg">
    <PrintHeader header={header} />
    <p className="text-center" style={{ fontWeight: 600 }}>{v.title} <Num>{v.number}</Num> · <Num>{dateTime(v.at)}</Num></p>
    {v.refunded && <p className="text-center" style={{ fontWeight: 600 }}>{v.refunded}</p>}
    <div className="border-y border-dashed border-line-strong" style={{ padding: '0.25rem 0', margin: '0.25rem 0' }}>
      <p><Words>{v.patient}</Words></p>
      {v.gives_back && <p>{v.gives_back}</p>}
    </div>
    {v.lines.map((l, i) => <p key={i} style={row}><Words>{l.words}</Words><span className="tnum" style={{ flexShrink: 0 }}>{egp(l.amount)}</span></p>)}
    {v.discount && <p style={row}><span>{v.discount.words}</span><span className="tnum">{egp(v.discount.amount)}</span></p>}
    <p className="border-t border-line-strong" style={{ ...row, fontWeight: 600, paddingTop: '0.25rem', marginTop: '0.25rem' }}><span>Total</span><span className="tnum">{egp(v.total)}</span></p>
    {v.tender.map((t) => <p key={t.words} style={row}><span>{t.words}</span><span className="tnum">{egp(t.amount)}</span></p>)}
    <p className="text-center" style={{ marginTop: '0.5rem' }}>{v.by}</p>
  </div>
}
