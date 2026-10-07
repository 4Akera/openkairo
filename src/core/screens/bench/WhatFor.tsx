// A walk-in's second step, "what for" (spec/openCare.md §5.3), the same on the bench's card and in the desk's patient card: the bench's
// own services as big buttons, any number; who asked folded and optional; Start (⌘↵) hands back the services and who asked.
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { useDepartment } from '../../hooks/organization'
import { replyFormFor } from '../../renderers'
import type { Department, Organization, Service } from '../../db/types'
import { Button, Callout, Input, Kbd, cn, errorText } from '../../ui'
import { startWords, walkInServices } from './walkins'

/** what a walk-in's second step gets: the bench, and Start with the services and who asked */
export interface WhatForProps { bench: Pick<Department, 'id'>; busy: boolean; error: unknown; onStart: (services: Service[], askedBy?: string) => void; note?: ReactNode }
const steps = new Map<string, ComponentType<WhatForProps>>()
/** a pack's own second step for the benches that use it (the laboratory's: the /order line and its most-asked tests); once per pack */
export function registerWalkInStep(pack: string, Step: ComponentType<WhatForProps>) {
  if (steps.has(pack)) { console.error(`openCare: ${pack}'s walk-in step is taken`); return }
  steps.set(pack, Step)
}
/** the second step for a bench: the first of its packs that gives one, else the base's (its services as big buttons) */
export const walkInStepFor = (packs: string[]): ComponentType<WhatForProps> => packs.map((p) => steps.get(p)).find(Boolean) ?? WhatFor

/** what a walk-in may ask for at this bench: its services, but not one only ever sent from a chart (a pack's automatic answer, as
 *  dispensing: a prescription the doctor sends) */
export const benchOffers = (org: Organization | undefined, benchId: string) =>
  walkInServices(org?.services ?? [], benchId).filter((s) => !replyFormFor(s.reply_type)?.automatic)

export function WhatFor({ bench, busy, error, onStart, note }: WhatForProps) {
  const { org } = useDepartment()
  const services = benchOffers(org, bench.id)
  const [picked, setPicked] = useState<string[]>([]); const [asked, setAsked] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { root.current?.querySelector<HTMLElement>('[data-svc]')?.focus() }, [])   // the first service, as the step opens
  const chosen = services.filter((s) => picked.includes(s.id))
  const toggle = (id: string) => setPicked((x) => x.includes(id) ? x.filter((y) => y !== id) : [...x, id])
  const start = () => { if (chosen.length && !busy) onStart(chosen, asked?.trim() || undefined) }
  if (!services.length) return <p className="text-13 text-faint">This department offers no services yet (Settings → Departments).</p>
  return <div ref={root} className="grid gap-3" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); start() } }}>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{services.map((s) => { const on = picked.includes(s.id)
      return <button key={s.id} type="button" data-svc aria-pressed={on} onClick={() => toggle(s.id)}
        className={cn('grid min-h-16 place-content-center gap-0.5 rounded-lg px-2 py-2 text-center transition-colors focus-ring', on ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface ring-1 ring-line hover:ring-line-strong')}>
        <span className="text-14 font-semibold text-fg">{s.name}</span>{s.section_name && <span className="text-11 text-muted">{s.section_name}</span>}</button> })}</div>
    {asked === null ? <button type="button" onClick={() => setAsked('')} className="justify-self-start rounded-sm text-13 text-accent hover:underline focus-ring">+ Who asked (optional)</button>
      : <div className="flex flex-wrap items-center gap-2"><span className="text-13 text-muted">Asked by</span>
          <Input autoFocus value={asked} onChange={(e) => setAsked(e.target.value)} placeholder="The outside doctor" className="w-full sm:w-72" /><span className="text-12 text-faint">optional</span></div>}
    {!!error && <Callout tone="danger" title="Not started">{errorText(error)}</Callout>}
    <div className="flex flex-wrap items-center gap-2"><Button onClick={start} disabled={!chosen.length} loading={busy}>{startWords(chosen.map((s) => s.name))}<Kbd className="ms-1 max-sm:hidden">⌘↵</Kbd></Button>
      {note && <span className="text-12 text-faint">{note}</span>}</div>
  </div>
}
