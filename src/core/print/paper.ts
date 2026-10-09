// The papers a printout is drawn for, and the one stylesheet a print of ours puts in place while it lasts (spec/openCare.md §3.13
// Printing, (p1)): a specimen label 50 × 25 mm, one label a page, no margin; a receipt roll 80 mm wide, as long as what it carries; an
// A5 sheet. The stylesheet sizes the page (@page), lays the printout out at the paper's width and hides everything else while printing,
// so only the printout prints, never the screen around it. It exists only during a print of ours: the browser's own Cmd-P (no rule in
// place) prints the page as usual. Pure: npm run test:print reads it.

export type PaperKey = 'label' | 'receipt' | 'a5'
export interface Paper {
  key: PaperKey
  width: number              // mm
  height: number | null      // mm; null: as long as the content (a roll)
  margin: number             // mm, every side
  each: boolean              // each child of the printout is a page of its own (one label a page)
  words: string
}
export const PAPERS: Record<PaperKey, Paper> = {
  label: { key: 'label', width: 50, height: 25, margin: 0, each: true, words: 'a label, 50 × 25 mm, one a page' },
  receipt: { key: 'receipt', width: 80, height: null, margin: 0, each: false, words: 'a receipt roll, 80 mm wide' },
  a5: { key: 'a5', width: 148, height: 210, margin: 12, each: false, words: 'an A5 sheet' },
}
/** the element the printout is drawn into (off screen), and the stylesheet's own id */
export const ROOT_ID = 'oc-print'
export const STYLE_ID = 'oc-print-style'

/** CSS pixels to millimetres (96 a inch, 25.4 mm a inch) */
export const mmOf = (px: number) => px * 25.4 / 96
/** the page: the paper's own size, or for a roll the content's length, in whole millimetres, never shorter than 20 mm */
export function pageOf(p: Paper, contentPx = 0): { width: number; height: number } {
  return { width: p.width, height: p.height ?? Math.max(20, Math.ceil(mmOf(contentPx) + 2 * p.margin + 1)) }
}
/** the width the printout is laid out at, inside the margins */
export const innerWidth = (p: Paper) => p.width - 2 * p.margin

/** the stylesheet of one print: the page's size and margin, the printout at the paper's width (each child a page, for labels), and the
 *  print-only rule — in print, the page's background is paper and every other child of the body is hidden */
export function stylesheet(p: Paper, contentPx = 0): string {
  const page = pageOf(p, contentPx); const root = `#${ROOT_ID}`
  return [
    `@page { size: ${page.width}mm ${page.height}mm; margin: ${p.margin}mm; }`,
    `${root} { width: ${innerWidth(p)}mm; }`,
    ...(p.each ? [`${root} > [data-sheet] > * { width: ${innerWidth(p)}mm; height: ${page.height - 2 * p.margin}mm; overflow: hidden; box-sizing: border-box; break-after: page; page-break-after: always; }`,
      `${root} > [data-sheet] > *:last-child { break-after: auto; page-break-after: auto; }`] : []),
    '@media print {',
    '  html, body { background: var(--paper) !important; margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }',
    `  body > :not(#${ROOT_ID}) { display: none !important; }`,
    `  ${root} { position: static !important; left: auto !important; top: auto !important; }`,
    '}',
  ].join('\n')
}
