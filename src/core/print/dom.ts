// The page's part of a print (spec/openCare.md §3.13 Printing, (p1)): the printout drawn into an element of its own, off screen and in
// the light theme whatever the screen's theme (the paper's tokens: dark text on white), at its paper's width so its length can be
// measured (a receipt roll is as long as what it carries); the print's stylesheet put in place and taken away; the browser's own print
// dialog. Against the page it is handed — the browser's document and window (browser.tsx), or a test's pretend one (npm run test:print)
// — with the drawing itself handed in too (React, in browser.tsx).
import { innerWidth, PAPERS, ROOT_ID, STYLE_ID, type PaperKey } from './paper'
import type { Printout } from './registry'
import type { Memory, PrintEnv, PrintJob } from './session'

/** the page a print touches: its document (the body the printout goes into, the head its stylesheet goes into) and its window (the
 *  print dialog and its afterprint) */
export interface Page { doc: Document; win: Pick<Window, 'addEventListener' | 'removeEventListener' | 'print'> }
/** what draws a printout into its element (React, browser.tsx): its height once settled, and how to take the drawing away */
export type Render = (host: HTMLElement, p: Printout, job: PrintJob, reprint: string | null, reprinted?: string[]) => Promise<{ height: number; unmount: () => void }>

/** the printout's own element: off screen, out of reach, the light theme (the paper's tokens), left to right unless a part says not, at
 *  the paper's width inside its margins */
export function hostFor(doc: Pick<Document, 'createElement'>, paper: PaperKey): HTMLElement {
  const host = doc.createElement('div'); host.id = ROOT_ID
  host.setAttribute('data-theme', 'light'); host.setAttribute('aria-hidden', 'true'); host.setAttribute('dir', 'ltr')
  host.style.cssText = `position:fixed;left:-10000px;top:0;pointer-events:none;width:${innerWidth(PAPERS[paper])}mm;background:var(--paper);color:var(--fg)`
  return host
}

/** a print's environment on a page: the read log, the drawing and this browser's memory handed in; latest: how long after print()
 *  returned the drawing stays at most, for a browser that neither waits in print() nor says afterprint */
export function domEnv(page: Page, use: { log: PrintEnv['log']; render: Render; time: PrintEnv['time']; memory: Memory; now?: () => Date; latest?: number }): PrintEnv {
  let host: HTMLElement | null = null; let unmount: (() => void) | null = null; let sheet: HTMLStyleElement | null = null
  return {
    log: use.log,
    draw: async (p, job, reprint, reprinted) => {
      host = hostFor(page.doc, p.paper); page.doc.body.appendChild(host)
      const drawn = await use.render(host, p, job, reprint, reprinted); unmount = drawn.unmount
      return drawn.height
    },
    style: (css) => { sheet = page.doc.createElement('style'); sheet.id = STYLE_ID; sheet.textContent = css; page.doc.head.appendChild(sheet) },
    // the dialog: a browser that waits in print() has closed it when print() returns (afterprint came first); one that does not says so
    // with afterprint, and `latest` after print() returned is the latest the drawing stays
    dialog: () => new Promise<void>((done) => {
      let over = false; const end = () => { if (over) return; over = true; page.win.removeEventListener('afterprint', end); done() }
      page.win.addEventListener('afterprint', end); page.win.print(); setTimeout(end, use.latest ?? 3000)
    }),
    unstyle: () => { sheet?.remove(); sheet = null },
    clear: () => { unmount?.(); unmount = null; host?.remove(); host = null },
    now: use.now ?? (() => new Date()),
    time: use.time,
    memory: use.memory,
  }
}
