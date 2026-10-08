// The specimen labels as they print (spec/openCare.md §5.3, §3.13 Printing): one label a page, 50 × 25 mm (the core's label paper), each
// what the Collect fold showed for its tube — the patient (name, age and sex, record number), when collected, the tube's word and its
// tests, fasting where asked — and the sample number under its Code 128 barcode, which Scan to receive reads. A later copy says
// "Reprint" with its time. No clinic header: a label has no room for it (chosen in the build, awaiting the owner).
import type { PrintoutProps } from '@core/print/registry'
import { Barcode, Num, Words } from '@core/print/parts'
import { dateTime } from '@core/ui/time'
import type { Label } from './labels'

const line = { margin: 0, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const

export function LabelSheet({ data, reprint }: PrintoutProps<Label[]>) {
  return <>{data.map((l, i) => <section key={`${l.sample}:${l.cap}:${i}`} className="text-fg" style={{ padding: '1.2mm 2mm', display: 'grid', gridTemplateRows: 'auto auto auto 1fr auto', fontSize: '7pt' }}>
    <p style={{ ...line, display: 'flex', gap: '1.5mm' }}><Words className="font-semibold" style={{ fontSize: '8pt', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</Words>
      <span>{l.age_sex}</span><span><Num>#{l.record}</Num></span></p>
    <p style={line}><Num>{l.at ? dateTime(l.at) : ''}</Num> · <span className="font-semibold">{l.tube}</span></p>
    <p style={{ ...line, display: 'flex', gap: '1.5mm' }}><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.tests.join(', ')}</span>
      {l.fasting && <span className="font-semibold">{l.fasting}</span>}</p>
    <div style={{ alignSelf: 'end' }}><Barcode value={l.sample} height={7} maxWidth={46} /></div>
    <p style={{ ...line, display: 'flex', justifyContent: 'space-between' }}><span className="font-mono font-semibold" style={{ fontSize: '8pt', letterSpacing: '0.04em' }}>{l.sample}</span>
      {reprint && <span className="font-semibold">Reprint · {reprint}</span>}</p>
  </section>)}</>
}
