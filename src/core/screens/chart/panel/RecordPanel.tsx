// The record panel (chart-plan.md §1.1, §4, §5; spec/openCare.md §5.1 rule 2): the record beside the encounter, a stack of compact
// sections from the section registry (sections.ts) — the base's always (Summary, Problems, Medicines, Allergies & alerts, History,
// Results, Documents, Visits & stays), a pack's by the rule (this department uses it and the patient fits, or the patient has its
// data), the rest behind More · n — from the one record read, the facts page and the packs' own read. The section chips
// at the top jump to a section and open it (Alt+R lands here; 1–9 jump); ↑/↓ move between the folding section heads, ↵ or Space
// folds one; folds are remembered in this browser. A list action seeds the composer and says so (onCompose), so under 640 px the
// chart can show the encounter. A fact, a visit or a result opens in the center (onOpen), never over the record.
import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { RecordView, ServerEntry } from '../../../db/types'
import { nameOf } from '../../../db/views'
import { useDocuments } from '../../../hooks/chart'
import { useDraftsFor } from '../../../hooks/drafts'
import { useDepartment } from '../../../hooks/organization'
import { ymd } from '../../../ui'
import { BlockContext, type BlockEnv } from '../blocks/env'
import { PrivateNotes } from '../blocks/Privacy'
import type { At } from '../model/at'
import type { ChartCtx, Rec } from '../model/record'
import { sectionDefs, sectionsOf, type PackLine, type Shown } from '../sections'
import { draftedOf } from './actions'
import './base'
import { Chips, type ChipItem } from './Chips'
import { PackSection } from './PackSection'

export interface PanelProps {
  r: RecordView                                     // the one record read (r.server: every derived table with its source entries)
  facts?: ServerEntry[]; factsLoading?: boolean     // alerts, procedures, observations and their cross-outs (useFacts)
  packs?: ServerEntry[]; packsLoading?: boolean     // the pack sections' types and the cross-outs (usePackEntries)
  patientId: string; departmentId: string           // the chart's department: the reads and the drafts are made there
  can: (action: string) => boolean
  at?: At; onOpen: (at: At) => void                 // what the center shows: a visit, the entries outside one, a fact's entry
  onCompose?: () => void                            // a list action seeded the composer
  readOnly?: boolean                                // the glance: no actions
}
/** what every section reads: the props, the record's tables, who reads where, the packs' Summary lines, and the panel's own moves */
export interface Panel extends PanelProps { rec: Rec; ctx: ChartCtx; visitId: string | null; writes: (action: string) => boolean; lines: PackLine[]
  jump: (k: string) => void; open: (entryId: string) => void }

const headOf = (el: Element | null | undefined) => el?.hasAttribute('data-fold') ? el.querySelector<HTMLElement>('button[aria-expanded]') : null
const smooth = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' } catch { return 'auto' } }

export function RecordPanel(props: PanelProps) {
  const { r, facts, packs, patientId, departmentId, can, readOnly, onOpen } = props
  const { org } = useDepartment(); const root = useRef<HTMLDivElement>(null); const [moreOpen, setMoreOpen] = useState(false)
  const ctx = useMemo<ChartCtx>(() => ({ org, me: org?.me.id ?? '', departmentId }), [org, departmentId])
  const docs = useDocuments(patientId, false)   // read when Documents is opened; counted from then, "n+" while earlier pages remain
  const documents = useMemo(() => docs.data ? { n: docs.data.pages.reduce((n, x) => n + x.docs.length, 0), more: !!docs.hasNextPage } : null, [docs.data, docs.hasNextPage])
  const drafts = useDraftsFor(patientId); const drafted = useMemo(() => draftedOf(drafts), [drafts])   // counted on the chips as the heads count them
  // the rule over the registry, each section's word and the packs' Summary lines
  const placed = useMemo(() => sectionsOf(sectionDefs(), { rec: r.server, ctx, identity: r.identity, facts, packs, documents, drafted }, {
    here: org?.allDepartments.find((d) => d.id === departmentId)?.packs ?? [], on: (org?.packs ?? []).filter((x) => x.enabled).map((x) => x.key),
    today: ymd(new Date().toISOString()) }), [org, departmentId, r.server, r.identity, ctx, facts, packs, documents, drafted])
  /** to a section: scrolled into view, opened when folded, its head focused */
  const jump = useCallback((k: string) => {
    const el = root.current?.querySelector<HTMLElement>(`[data-section="${k}"]`); if (!el) return
    const head = headOf(el); if (head?.getAttribute('aria-expanded') === 'false') head.click()
    el.scrollIntoView({ block: 'start', inline: 'nearest', behavior: smooth() }); (head ?? el).focus({ preventScroll: true })
  }, [])
  const open = useCallback((id: string) => onOpen({ scope: 'entry', id }), [onOpen])
  const p: Panel = { ...props, rec: r.server, ctx, visitId: r.visit?.id ?? null, writes: (a) => !readOnly && can(a), lines: placed.lines, jump, open }
  const env = useMemo<BlockEnv>(() => ({ org, me: org?.me.id, departmentId, can, tables: r.server.tables, onOpen: open }), [org, departmentId, can, r.server.tables, open])
  const hidden = r.server.hidden.filter((h) => h.items > 0).map((h) => ({ ...h, department: nameOf(org, h.department_id) ?? '' }))
  // ↑/↓ on a section head: the next or the one before (a head is a section's fold button)
  const heads = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const hs = [...(root.current?.querySelectorAll('[data-fold]') ?? [])].map(headOf).filter((h): h is HTMLElement => !!h)
    const i = hs.indexOf(e.target as HTMLElement); if (i < 0) return
    e.preventDefault(); hs[(i + (e.key === 'ArrowDown' ? 1 : -1) + hs.length) % hs.length].focus()
  }
  const chip = (x: Shown): ChipItem => ({ key: x.key, title: x.def.title, word: x.word })
  const part = (x: Shown) => <Part key={x.key} k={x.key} fold={x.def.fold}>{x.def.layer === 'base' ? <x.def.Body p={p} own={x.own} />
    : <PackSection def={x.def} p={p} own={x.own} hiddenOnly={x.private} line={placed.lines.find((l) => l.key === x.key)?.line ?? null} />}</Part>
  return <BlockContext.Provider value={env}>
    <div ref={root} onKeyDown={heads} className="grid grid-cols-1 content-start gap-3">
      <Chips lead={placed.lead.map(chip)} rest={placed.rest.map(chip)} more={placed.more.map(chip)} open={moreOpen} onMore={() => setMoreOpen(!moreOpen)} jump={jump} />
      <PrivateNotes hidden={hidden} patientId={patientId} />
      {placed.lead.map(part)}
      {placed.rest.map(part)}
      {moreOpen && placed.more.map(part)}
    </div>
  </BlockContext.Provider>
}

/** a section's place: what the chips jump to (clear of the sticky banner and, under 640 px, the tab row and the chips) */
function Part({ k, fold, children }: { k: string; fold?: boolean; children: ReactNode }) {
  return <div data-section={k} data-fold={fold || undefined} tabIndex={-1} className="scroll-mt-[calc(var(--chart-top,0px)+5rem)] rounded-xl outline-none @split:scroll-mt-2">{children}</div>
}
