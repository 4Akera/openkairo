// The printouts (spec/openCare.md §3.13 Printing, (p2)): a pack or the base registers each one it prints — its key, its paper and the
// component that draws it — and the core prints it by its key without naming it. A printout draws only what it is handed, which is
// what its screen shows; the core hands it the clinic's header (every printout's) and, on a later copy, the reprint's time (and, for a
// printout of several things, which of them were printed before). Pure.
import type { ComponentType } from 'react'
import type { ClinicHeader } from './header'
import type { PaperKey } from './paper'

export interface PrintoutProps<D = unknown> {
  data: D
  header: ClinicHeader
  /** a later copy of the same thing: "Reprint · 10:42" (the time of this copy); null on the first */
  reprint: string | null
  /** a printout of several things (PrintJob.things, a sheet of labels): those of them printed before, each marked on its own; absent,
   *  the reprint is the whole printout's */
  reprinted?: string[]
}
export interface Printout<D = unknown> { paper: PaperKey; Component: ComponentType<PrintoutProps<D>> }
const printouts = new Map<string, Printout>()
const KEY = /^[a-z0-9]+\.[a-z0-9_.-]+$/
/** a printout under its key (its layer's prefix and a name: base.prescription); a key is drawn by one component only (a second
 *  registration is refused) */
export function registerPrintout<D>(key: string, p: Printout<D>): boolean {
  if (!KEY.test(key)) { console.error(`openCare: ${key} is not a printout key (layer.name)`); return false }
  if (printouts.has(key)) { console.error(`openCare: the printout ${key} is taken`); return false }
  printouts.set(key, p as Printout); return true
}
export const printoutFor = (key: string) => printouts.get(key)
export const printoutKeys = () => [...printouts.keys()].sort()
