// A receipt or a refund slip as it prints (spec §5.4; §3.13 Printing, owner 2026-10-08): on the core's receipt roll, 80 mm wide and as
// long as what it carries, the same drawing as the screen's receipt (ReceiptPaper); a later copy is marked "Reprint · 10:50" on top
// (billing keeps each copy printed, so the mark holds after a reload and at another desk).
import type { PrintoutProps } from '@core/print/registry'
import { ReprintMark } from '@core/print/parts'
import type { ReceiptView } from './money'
import { ReceiptPaper } from './ReceiptPaper'

export function ReceiptSlip({ data, header, reprint }: PrintoutProps<ReceiptView>) {
  return <div style={{ padding: '3mm 4mm 6mm', fontSize: '9pt', lineHeight: 1.35, display: 'grid', gap: '2mm' }}>
    <ReprintMark at={reprint} />
    <ReceiptPaper view={data} header={header} />
  </div>
}
