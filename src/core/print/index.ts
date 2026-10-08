// The core's print facility (spec/openCare.md §3.13 Printing, the owner's (p1)–(p5), 2026-10-08): through the browser's own print
// dialog, nothing to install; a printout registered by its layer (key, paper, component) and printed by its key; the papers (a label
// 50 × 25 mm, a receipt roll 80 mm wide, an A5 sheet); the clinic's header on every printout; each print of a patient's information
// logged like a read; Code 128. Screens import from here; a printout's own drawing (and a node test) imports './parts' and './registry'
// directly, which hold no browser.
export { registerPrintout, printoutFor, type Printout, type PrintoutProps } from './registry'
export { PAPERS, type Paper, type PaperKey } from './paper'
export { headerOf, type ClinicHeader } from './header'
export { Arabic, Barcode, Num, PrintHeader, ReprintMark, Words } from './parts'
export { printNow, useClinicHeader, usePrint } from './browser'
export { usePrintKey, isPrintKey } from './key'
export { PrintButton } from './PrintButton'
export type { PrintJob, Printed } from './session'
