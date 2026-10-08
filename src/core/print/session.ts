// One print, start to end (spec/openCare.md §3.13 Printing, (p1), (p4)): asked by a person (a button, or P), never by itself. A printout
// of a patient's information is first logged like a read (who printed what, for which patient, when: the core read log; if the log
// cannot be written, nothing prints). Then the printout is drawn off screen in the light theme, the page is sized for its paper, the
// browser's own print dialog opens, and everything is taken away again whatever happened, so the screen and the browser's own Cmd-P are
// as they were. One print at a time. A second print of the same thing is marked "Reprint" with its time: the printing pack says so
// where it keeps its own copies (a receipt), else this browser remembers what it printed today. Pure: the browser's part is handed in
// (browser.tsx), so npm run test:print runs the whole lifecycle.
import { PAPERS, stylesheet, type Paper } from './paper'
import { printoutFor, type Printout } from './registry'
import type { ClinicHeader } from './header'

export interface PrintJob<D = unknown> {
  key: string                  // the printout (registerPrintout)
  data: D                      // what it draws: what the screen shows
  header: ClinicHeader
  /** the thing printed, the same on every copy (a sample number, a receipt's number): what "the same thing" is for the reprint mark,
   *  and what the read log names */
  thing: string
  /** whose information it is (none: a printout naming no patient) and where it is printed: the read log's row */
  patientId?: string | null
  departmentId?: string | null
  purpose?: string             // the read log's purpose (TREAT unless it says)
  /** the printing pack's own count says this is a later copy (it keeps its copies itself, a receipt); else this browser's memory */
  again?: boolean
}
export type Printed = { printed: true; reprint: string | null } | { printed: false; why: 'busy' | 'unknown' }

/** what the browser does for a print (browser.tsx), handed in so the lifecycle is pure */
export interface PrintEnv {
  log(job: PrintJob): Promise<void>                                          // the core read log (p4)
  draw(p: Printout, job: PrintJob, reprint: string | null): Promise<number>   // drawn off screen, light theme: its height in CSS pixels
  style(css: string): void                                                    // the page rule and the print-only rule, in place
  dialog(): Promise<void>                                                     // the browser's print dialog, until it closes
  unstyle(): void
  clear(): void                                                               // the printout taken away
  now(): Date
  time(at: Date): string                                                      // 10:42, in the clinic's time zone
  memory: Memory
}
/** what this browser printed: the thing and when (a day) */
export interface Memory { seen(thing: string): boolean; keep(thing: string, at: Date): void }

/** a print run against one environment: the steps in their one order, everything undone in the end, one at a time */
export function printer(env: PrintEnv) {
  let busy = false
  return async function print(job: PrintJob): Promise<Printed> {
    const p = printoutFor(job.key)
    if (!p) { console.error(`openCare: no printout ${job.key}`); return { printed: false, why: 'unknown' } }
    if (busy) return { printed: false, why: 'busy' }
    busy = true
    try {
      if (job.patientId) await env.log(job)
      const at = env.now(); const reprint = job.again || env.memory.seen(memoryKey(job)) ? env.time(at) : null
      const paper: Paper = PAPERS[p.paper]
      const height = await env.draw(p, job, reprint)
      env.style(stylesheet(paper, height))
      await env.dialog()
      env.memory.keep(memoryKey(job), at)
      return { printed: true, reprint }
    } finally {
      env.unstyle(); env.clear(); busy = false
    }
  }
}
const memoryKey = (job: PrintJob) => `${job.key}:${job.thing}`

/** this browser's memory of what it printed, kept a day (per browser, like the printer chosen in its dialog); storage blocked: this
 *  page only */
export function browserMemory(store: Pick<Storage, 'getItem' | 'setItem'> | null, key = 'oc.printed', day = 86_400_000): Memory {
  let local: Record<string, number> = {}
  const load = (): Record<string, number> => { try { return { ...local, ...(JSON.parse(store?.getItem(key) ?? '{}') as Record<string, number>) } } catch { return local } }
  return {
    seen: (thing) => { const at = load()[thing]; return at !== undefined && Date.now() - at < day },
    keep: (thing, at) => {
      const all = Object.fromEntries(Object.entries({ ...load(), [thing]: at.getTime() }).filter(([, t]) => Date.now() - t < day))
      local = all; try { store?.setItem(key, JSON.stringify(all)) } catch { /* blocked: this page remembers */ }
    },
  }
}
