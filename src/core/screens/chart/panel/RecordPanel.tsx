// The record panel (chart-plan.md §1.1, §4, §5; build plan 3.7–3.8): the record beside the encounter, a stack of compact sections —
// Summary, Problems, Medicines, Allergies & alerts, History, Results, Documents, Visits & stays — from the one record read and the
// facts page. The section chips at the top jump to a section and open it (←/→ between them; Alt+R lands here); ↑/↓ move between the
// folding section heads, ↵ or Space folds one; folds are remembered in this browser. A list action seeds the composer and says so
// (onCompose), so under 640 px the chart can show the encounter. A fact, a visit or a result opens in the center (onOpen), never
// over the record.
import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { RecordView, ServerEntry } from '../../../db/types'
import { nameOf } from '../../../db/views'
import { useDepartment } from '../../../hooks/organization'
import { cn } from '../../../ui'
import { BlockContext, type BlockEnv } from '../blocks/env'
import { PrivateNotes } from '../blocks/Privacy'
import type { At } from '../model/at'
import type { ChartCtx, Rec } from '../model/record'
import { Allergies } from './Allergies'
import { Documents } from './Documents'
import { History } from './History'
import { Medicines } from './Medicines'
import { Problems } from './Problems'
import { Results } from './Results'
import { Summary } from './Summary'
import { Visits } from './Visits'

export interface PanelProps {
  r: RecordView                                     // the one record read (r.server: every derived table with its source entries)
  facts?: ServerEntry[]; factsLoading?: boolean     // alerts, procedures, observations and their cross-outs (useFacts)
  patientId: string; departmentId: string           // the chart's department: the reads and the drafts are made there
  can: (action: string) => boolean
  at?: At; onOpen: (at: At) => void                 // what the center shows: a visit, the entries outside one, a fact's entry
  onCompose?: () => void                            // a list action seeded the composer
  readOnly?: boolean                                // the glance: no actions
}
export type SectionKey = 'summary' | 'problems' | 'medicines' | 'allergies' | 'history' | 'results' | 'documents' | 'visits'
/** what every section reads: the props, the record's tables, who reads where, and the panel's own moves */
export interface Panel extends PanelProps { rec: Rec; ctx: ChartCtx; visitId: string | null; writes: (action: string) => boolean; jump: (k: SectionKey) => void; open: (entryId: string) => void }

const SECTIONS: [SectionKey, string][] = [['summary', 'Summary'], ['problems', 'Problems'], ['medicines', 'Medicines'], ['allergies', 'Allergies'], ['history', 'History'],
  ['results', 'Results'], ['documents', 'Documents'], ['visits', 'Visits']]
const headOf = (el: Element | null | undefined) => el?.hasAttribute('data-fold') ? el.querySelector<HTMLElement>('button[aria-expanded]') : null
const smooth = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' } catch { return 'auto' } }

export function RecordPanel(props: PanelProps) {
  const { r, patientId, departmentId, can, readOnly, onOpen } = props
  const { org } = useDepartment(); const root = useRef<HTMLDivElement>(null)
  const ctx = useMemo<ChartCtx>(() => ({ org, me: org?.me.id ?? '', departmentId }), [org, departmentId])
  /** to a section: scrolled into view, opened when folded, its head focused */
  const jump = useCallback((k: SectionKey) => {
    const el = root.current?.querySelector<HTMLElement>(`[data-section="${k}"]`); if (!el) return
    const head = headOf(el); if (head?.getAttribute('aria-expanded') === 'false') head.click()
    el.scrollIntoView({ block: 'start', inline: 'nearest', behavior: smooth() }); (head ?? el).focus({ preventScroll: true })
  }, [])
  const open = useCallback((id: string) => onOpen({ scope: 'entry', id }), [onOpen])
  const p: Panel = { ...props, rec: r.server, ctx, visitId: r.visit?.id ?? null, writes: (a) => !readOnly && can(a), jump, open }
  const env = useMemo<BlockEnv>(() => ({ org, me: org?.me.id, departmentId, can, tables: r.server.tables, onOpen: open }), [org, departmentId, can, r.server.tables, open])
  const hidden = r.server.hidden.filter((h) => h.items > 0).map((h) => ({ ...h, department: nameOf(org, h.department_id) ?? '' }))
  // ↑/↓ on a section head: the next or the one before (a head is a section's fold button)
  const heads = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const hs = [...(root.current?.querySelectorAll('[data-fold]') ?? [])].map(headOf).filter((h): h is HTMLElement => !!h)
    const i = hs.indexOf(e.target as HTMLElement); if (i < 0) return
    e.preventDefault(); hs[(i + (e.key === 'ArrowDown' ? 1 : -1) + hs.length) % hs.length].focus()
  }
  return <BlockContext.Provider value={env}>
    <div ref={root} onKeyDown={heads} className="grid grid-cols-1 content-start gap-3">
      <Chips jump={jump} />
      <PrivateNotes hidden={hidden} patientId={patientId} />
      <Part k="summary"><Summary p={p} /></Part>
      <Part k="problems" fold><Problems p={p} /></Part>
      <Part k="medicines" fold><Medicines p={p} /></Part>
      <Part k="allergies" fold><Allergies p={p} /></Part>
      <Part k="history" fold><History p={p} /></Part>
      <Part k="results" fold><Results p={p} /></Part>
      <Part k="documents" fold><Documents p={p} /></Part>
      <Part k="visits" fold><Visits p={p} /></Part>
    </div>
  </BlockContext.Provider>
}

/** a section's place: what the chips jump to (clear of the sticky banner and, under 640 px, the tab row) */
function Part({ k, fold, children }: { k: SectionKey; fold?: boolean; children: ReactNode }) {
  return <div data-section={k} data-fold={fold || undefined} tabIndex={-1} className="scroll-mt-[calc(var(--chart-top,0px)+3.5rem)] rounded-xl outline-none @split:scroll-mt-2">{children}</div>
}

/** the section chips: ←/→ (Home, End) move between them, ↵ jumps; the chart's Alt+R focuses the current one (#record-sections) */
function Chips({ jump }: { jump: (k: SectionKey) => void }) {
  const [at, setAt] = useState(0)
  const keys = (e: KeyboardEvent<HTMLElement>) => {
    const n = e.key === 'ArrowRight' ? at + 1 : e.key === 'ArrowLeft' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? SECTIONS.length - 1 : null
    if (n === null) return
    e.preventDefault(); const i = (n + SECTIONS.length) % SECTIONS.length; setAt(i); e.currentTarget.querySelectorAll<HTMLElement>('button')[i]?.focus()
  }
  return <nav id="record-sections" aria-label="Record sections" onKeyDown={keys} className="flex flex-wrap gap-0.5">
    {SECTIONS.map(([k, label], i) => <button key={k} type="button" tabIndex={i === at ? 0 : -1} onClick={() => { setAt(i); jump(k) }}
      className={cn('inline-flex h-7 items-center rounded-full px-2 text-12 text-muted transition-colors hover:bg-hover hover:text-fg focus-ring', i === at && 'bg-accent-soft font-medium text-accent')}>{label}</button>)}
  </nav>
}
