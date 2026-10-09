// The browser's part of a print (spec/openCare.md §3.13 Printing): the read log through the reader (shape printed: the server's time of
// it comes back), the printout drawn by React into its element off screen in the light theme (dom.ts), and the browser's own print
// dialog — no driver of ours, its printer chosen there once a computer. usePrint hands a screen the one printer, with the clinic's
// header and where it is.
import { useCallback } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { read } from '../db/rpc'
import { useDepartment } from '../hooks/organization'
import { hm } from '../ui/time'
import { headerOf } from './header'
import { domEnv, type Render } from './dom'
import { browserMemory, printer, type PrintEnv, type PrintJob, type Printed } from './session'

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
/** what the drawing waits for before it is measured: the fonts, its pictures (the logo), two frames of layout */
async function settled(el: HTMLElement) {
  try { await document.fonts?.ready } catch { /* no font loading here */ }
  await Promise.all([...el.querySelectorAll('img')].map((img) => img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r })))
  await frame(); await frame()
}
const storage = () => { try { return window.localStorage } catch { return null } }

/** React draws the printout into its element, then it is measured */
const render: Render = async (host, p, job, reprint, reprinted) => {
  const root = createRoot(host); const C = p.Component
  try {
    flushSync(() => root.render(<div data-sheet={p.paper}><C data={job.data} header={job.header} reprint={reprint} reprinted={reprinted} /></div>))
    await settled(host)
    return { height: host.getBoundingClientRect().height, unmount: () => root.unmount() }
  } catch (x) { root.unmount(); throw x }
}
/** the print in the read log: the server's time of it, for the reprint mark */
const log: PrintEnv['log'] = async (job) => (await read<{ at?: string }>({ shape: 'printed', patient_id: job.patientId, department_id: job.departmentId ?? null,
  purpose: job.purpose ?? 'TREAT', ...(job.reason ? { reason: job.reason } : {}), printout: job.key, what: job.thing }))?.at ?? null

let run: ((job: PrintJob) => Promise<Printed>) | null = null
/** the one printer of this page (one print at a time) */
export const printNow = (job: PrintJob) => (run ??= printer(domEnv({ doc: document, win: window },
  { log, render, time: (at) => hm(at.toISOString()), memory: browserMemory(storage()) })))(job)
/** print from a screen: the clinic's header and the department read where it is printed come with each job */
export function usePrint() {
  const { org, dept } = useDepartment()
  return useCallback(<D,>(job: Omit<PrintJob<D>, 'header'>) => printNow({ ...job, header: headerOf(org), departmentId: job.departmentId ?? dept?.id ?? null } as PrintJob),
    [org, dept])
}
/** the clinic's header as a screen shows it beside the twin of a printout it draws */
export function useClinicHeader() {
  const { org } = useDepartment()
  return headerOf(org)
}
