// What every printout draws with (spec/openCare.md §3.13 Printing): the clinic's header, a barcode (Code 128, (p5)), the reprint mark,
// and Arabic laid out right to left with its numbers kept readable. Sizes are the paper's (millimetres, points); colours are the
// tokens, drawn in the light theme. Pure components: a node test renders them.
import type { CSSProperties, ReactNode } from 'react'
import { encode128, QUIET } from './code128'
import { headerLines, type ClinicHeader } from './header'

/** the clinic's header: its logo, its name, its address, phone and tax number (each line in its own direction: an Arabic name reads
 *  right to left) */
export function PrintHeader({ header, align = 'center', size = 'small' }: { header: ClinicHeader; align?: 'center' | 'start'; size?: 'small' | 'large' }) {
  const big = size === 'large'
  return <header style={{ display: 'flex', flexDirection: align === 'center' ? 'column' : 'row', alignItems: 'center', gap: big ? '4mm' : '1mm', textAlign: align === 'center' ? 'center' : 'start' }}>
    {header.logo && <img src={header.logo} alt="" style={{ maxHeight: big ? '16mm' : '12mm', maxWidth: big ? '40mm' : '50mm', objectFit: 'contain' }} />}
    <div style={{ display: 'grid', gap: '0.5mm' }}>
      <p dir="auto" className="font-semibold text-fg" style={{ fontSize: big ? '14pt' : '11pt', lineHeight: 1.2, margin: 0 }}>{header.name}</p>
      {headerLines(header).map((l) => <p key={l} dir="auto" className="text-fg" style={{ fontSize: big ? '9pt' : '8pt', lineHeight: 1.3, margin: 0 }}>{l}</p>)}
    </div>
  </header>
}

/** a later copy: "Reprint · 10:42", plain and bold, so the copy says it is one */
export const ReprintMark = ({ at, style }: { at: string | null; style?: CSSProperties }) => at
  ? <p className="font-semibold text-fg" style={{ border: '0.3mm solid var(--fg)', padding: '0.5mm 1.5mm', margin: 0, fontSize: '8pt', textAlign: 'center', ...style }}>Reprint · {at}</p> : null

/** Code 128 bars for a text (a sample number): each module 0.25 mm (two dots of a 203 dpi label printer) where it fits, else narrower
 *  to fit; the quiet zone on each side is part of the drawing */
export function Barcode({ value, height = 8, maxWidth = 46 }: { value: string; height?: number; maxWidth?: number }) {
  const { modules } = encode128(value); const total = modules.length + 2 * QUIET
  const width = Math.min(maxWidth, total * 0.25)
  let d = ''; let i = 0
  while (i < modules.length) {
    if (modules[i] !== '1') { i++; continue }
    let w = 0; while (modules[i + w] === '1') w++
    d += `M${QUIET + i} 0h${w}v10h-${w}z`; i += w
  }
  return <svg role="img" aria-label={`Barcode ${value}`} viewBox={`0 0 ${total} 10`} preserveAspectRatio="none" shapeRendering="crispEdges"
    style={{ display: 'block', width: `${width}mm`, height: `${height}mm` }}><path d={d} fill="currentColor" /></svg>
}

/** words that may be Arabic: their own direction, isolated from what is around them */
export const Words = ({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) =>
  <span dir="auto" className={className} style={{ unicodeBidi: 'isolate', ...style }}>{children}</span>
/** a number among words (a record number, a dose): left to right whatever the line's direction, so it reads as written */
export const Num = ({ children }: { children: ReactNode }) => <bdi dir="ltr">{children}</bdi>
/** Arabic: right to left, in Arabic */
export const Arabic = ({ children, style }: { children: ReactNode; style?: CSSProperties }) =>
  <p dir="rtl" lang="ar" className="text-fg" style={{ margin: 0, textAlign: 'right', ...style }}>{children}</p>
