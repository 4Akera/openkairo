// The browser's part of a print (spec/openCare.md §3.13 Printing): the read log through the reader (shape printed), the printout drawn
// into an element of its own off screen in the light theme (the paper's width, so its length can be measured: a receipt roll is as
// long as what it carries), the stylesheet of the print put in place and taken away, and the browser's own print dialog — no driver
// of ours, its printer chosen there once a computer. usePrint hands a screen the one printer, with the clinic's header and where it is.
import { useCallback } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { read } from '../db/rpc'
import { useDepartment } from '../hooks/organization'
import { hm } from '../ui/time'
import { headerOf } from './header'
import { innerWidth, PAPERS, ROOT_ID, STYLE_ID } from './paper'
import { browserMemory, printer, type PrintEnv, type PrintJob, type Printed } from './session'

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
/** what the drawing waits for before it is measured: the fonts, its pictures (the logo), two frames of layout */
async function settled(el: HTMLElement) {
  try { await document.fonts?.ready } catch { /* no font loading here */ }
  await Promise.all([...el.querySelectorAll('img')].map((img) => img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r })))
  await frame(); await frame()
}
const storage = () => { try { return window.localStorage } catch { return null } }

function browserEnv(): PrintEnv {
  let host: HTMLElement | null = null; let root: Root | null = null; let sheet: HTMLStyleElement | null = null
  return {
    log: async (job) => {
      await read({ shape: 'printed', patient_id: job.patientId, department_id: job.departmentId ?? null, purpose: job.purpose ?? 'TREAT', printout: job.key, what: job.thing })
    },
    draw: async (p, job, reprint) => {
      host = document.createElement('div'); host.id = ROOT_ID
      host.setAttribute('data-theme', 'light'); host.setAttribute('aria-hidden', 'true'); host.setAttribute('dir', 'ltr')
      host.style.cssText = `position:fixed;left:-10000px;top:0;pointer-events:none;width:${innerWidth(PAPERS[p.paper])}mm;background:var(--paper);color:var(--fg)`
      document.body.appendChild(host); root = createRoot(host); const C = p.Component
      flushSync(() => root!.render(<div data-sheet={p.paper}><C data={job.data} header={job.header} reprint={reprint} /></div>))
      await settled(host)
      return host.getBoundingClientRect().height
    },
    style: (css) => { sheet = document.createElement('style'); sheet.id = STYLE_ID; sheet.textContent = css; document.head.appendChild(sheet) },
    // the dialog: a browser that waits in print() has closed it when print() returns (afterprint came first); one that does not says so
    // with afterprint, and three seconds after print() returned is the latest the drawing stays
    dialog: () => new Promise<void>((done) => {
      let over = false; const end = () => { if (over) return; over = true; window.removeEventListener('afterprint', end); done() }
      window.addEventListener('afterprint', end); window.print(); setTimeout(end, 3000)
    }),
    unstyle: () => { sheet?.remove(); sheet = null },
    clear: () => { root?.unmount(); root = null; host?.remove(); host = null },
    now: () => new Date(),
    time: (at) => hm(at.toISOString()),
    memory: browserMemory(storage()),
  }
}

let run: ((job: PrintJob) => Promise<Printed>) | null = null
/** the one printer of this page (one print at a time) */
export const printNow = (job: PrintJob) => (run ??= printer(browserEnv()))(job)
/** print from a screen: the clinic's header and the department read where it is printed come with each job */
export function usePrint() {
  const { org, dept } = useDepartment()
  return useCallback((job: Omit<PrintJob, 'header'>) => printNow({ ...job, header: headerOf(org), departmentId: job.departmentId ?? dept?.id ?? null }), [org, dept])
}
/** the clinic's header as the screens show it beside a printout's twin (a receipt) */
export function useClinicHeader() {
  const { org } = useDepartment()
  return headerOf(org)
}
