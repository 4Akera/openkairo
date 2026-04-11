import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Block, BlockDefinition, Department } from '../../types'
import { formatDateTime, formatDate } from '../../lib/utils'
import { cn } from '../../lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../ui'
import {
  BookOpen, ChevronDown, ChevronRight, Loader2,
  ExternalLink, Building2, FlaskConical, Scan,
  Activity, Stethoscope, Maximize2,
} from 'lucide-react'
import { BLOCK_REGISTRY, orphanRegistryRenderKey, registryRenderKey } from '../timeline/BlockRegistry'
import { DynamicBlockView } from '../timeline/DynamicBlock'

interface Props {
  patientId: string
}

interface SharedBlock extends Block {
  encounter_title:  string | null
  encounter_id_raw: string | null
  dept_name:        string | null
  dept_icon:        string | null
}

interface EncounterGroup {
  encounterId: string
  title:       string | null
  createdAt:   string
  status:      string
  blocks:      SharedBlock[]
}

interface DeptGroup {
  key:      string
  deptName: string | null
  deptIcon: string | null
  blocks:   SharedBlock[]
}

/** Order blocks belong on the encounter timeline only, not in Results & Reports */
const EXCLUDE_FROM_RESULTS_REPORTS = new Set(['lab_order', 'radiology_request'])

// ── colours ──────────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  lab:       { bg: 'bg-blue-50 dark:bg-blue-950/40',     text: 'text-blue-700 dark:text-blue-400',     border: 'border-blue-200 dark:border-blue-800' },
  radiology: { bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800' },
  pharmacy:  { bg: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800' },
  encounter: { bg: 'bg-emerald-50 dark:bg-emerald-950/40',text: 'text-emerald-700 dark:text-emerald-400',border: 'border-emerald-200 dark:border-emerald-800' },
}
const DEPT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'flask-conical': FlaskConical,
  scan:            Scan,
  activity:        Activity,
}
function typeColors(isDept: boolean, deptSlug?: string | null) {
  if (!isDept) return TYPE_COLORS.encounter
  if (deptSlug && TYPE_COLORS[deptSlug]) return TYPE_COLORS[deptSlug]
  return { bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-400', border: 'border-indigo-200 dark:border-indigo-800' }
}

// ── main component ────────────────────────────────────────────────────────────
export default function ResultsAndReports({ patientId }: Props) {
  const navigate = useNavigate()
  const [loading,    setLoading]    = useState(true)
  const [open,       setOpen]       = useState(true)
  const [modalOpen,  setModalOpen]  = useState(false)
  const [encGroups,  setEncGroups]  = useState<EncounterGroup[]>([])
  const [deptGroups, setDeptGroups] = useState<DeptGroup[]>([])
  const [defMap,     setDefMap]     = useState<Record<string, BlockDefinition>>({})

  const totalCount = useMemo(
    () => encGroups.reduce((s, g) => s + g.blocks.length, 0)
        + deptGroups.reduce((s, g) => s + g.blocks.length, 0),
    [encGroups, deptGroups],
  )

  const load = useCallback(async () => {
    setLoading(true)

    const { data: defs } = await supabase.from('block_definitions').select('*').eq('active', true)
    if (defs) {
      const map: Record<string, BlockDefinition> = {}
      for (const d of defs as BlockDefinition[]) { map[d.slug] = d }
      setDefMap(map)
    }

    const { data: encs } = await supabase
      .from('encounters')
      .select('id, title, created_at, status')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })

    const encMeta: Record<string, { title: string | null; createdAt: string; status: string }> = {}
    const encIds = (encs ?? []).map(e => {
      encMeta[e.id] = { title: e.title ?? null, createdAt: e.created_at, status: e.status }
      return e.id
    })

    let encounterBlocks: SharedBlock[] = []
    if (encIds.length > 0) {
      const { data } = await supabase
        .from('blocks')
        .select('*')
        .in('encounter_id', encIds)
        .eq('share_to_record', true)
        .eq('state', 'active')
        .order('created_at', { ascending: false })
      if (data) {
        encounterBlocks = data
          .filter(b => !EXCLUDE_FROM_RESULTS_REPORTS.has(b.type))
          .map(b => ({
            ...b,
            encounter_title:  encMeta[b.encounter_id]?.title ?? null,
            encounter_id_raw: b.encounter_id,
            dept_name:        null,
            dept_icon:        null,
          })) as SharedBlock[]
      }
    }

    const { data: deptData } = await supabase
      .from('blocks')
      .select('*, departments(name, icon, slug)')
      .eq('patient_id', patientId)
      .not('department_id', 'is', null)
      .eq('state', 'active')
      .order('created_at', { ascending: false })

    let deptBlocks: SharedBlock[] = []
    if (deptData) {
      deptBlocks = deptData
        .filter(b => !EXCLUDE_FROM_RESULTS_REPORTS.has(b.type))
        .map(b => {
          const dept = b.departments as (Department & { slug?: string }) | null
          return {
            ...b,
            encounter_title:  null,
            encounter_id_raw: null,
            dept_name:        dept?.name ?? null,
            dept_icon:        dept?.icon ?? null,
          }
        }) as SharedBlock[]
    }

    const encGroupMap: Record<string, EncounterGroup> = {}
    for (const b of encounterBlocks) {
      const eid = b.encounter_id_raw!
      if (!encGroupMap[eid]) {
        encGroupMap[eid] = {
          encounterId: eid,
          title:       encMeta[eid]?.title ?? null,
          createdAt:   encMeta[eid]?.createdAt ?? b.created_at,
          status:      encMeta[eid]?.status ?? 'open',
          blocks:      [],
        }
      }
      encGroupMap[eid].blocks.push(b)
    }
    const builtEncGroups = Object.values(encGroupMap).sort((a, b) => {
      const tA = a.blocks[0]?.created_at ?? a.createdAt
      const tB = b.blocks[0]?.created_at ?? b.createdAt
      return new Date(tB).getTime() - new Date(tA).getTime()
    })

    const deptGroupMap: Record<string, DeptGroup> = {}
    for (const b of deptBlocks) {
      const key = b.department_id ?? b.dept_name ?? 'unknown'
      if (!deptGroupMap[key]) deptGroupMap[key] = { key, deptName: b.dept_name, deptIcon: b.dept_icon, blocks: [] }
      deptGroupMap[key].blocks.push(b)
    }
    const builtDeptGroups = Object.values(deptGroupMap).sort((a, b) => {
      const tA = a.blocks[0]?.created_at ?? ''
      const tB = b.blocks[0]?.created_at ?? ''
      return new Date(tB).getTime() - new Date(tA).getTime()
    })

    setEncGroups(builtEncGroups)
    setDeptGroups(builtDeptGroups)
    setLoading(false)
  }, [patientId])

  useEffect(() => { load() }, [load])

  const hasContent = encGroups.length > 0 || deptGroups.length > 0

  return (
    <>
      <div className="border rounded-md w-full min-w-0 max-w-full overflow-hidden">
        {/* Section header */}
        <button
          type="button"
          className="flex w-full items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-left hover:bg-accent/50 transition-colors"
          onClick={() => setOpen(o => !o)}
        >
          {open
            ? <ChevronDown  className="h-3 w-3 shrink-0 text-muted-foreground" />
            : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
          <BookOpen className="h-3 w-3 shrink-0 text-emerald-600" />
          <span className="flex-1 min-w-0 truncate">Results &amp; Reports</span>
          {totalCount > 0 && (
            <span className="text-[10px] px-1 rounded-full bg-muted text-muted-foreground shrink-0">
              {totalCount}
            </span>
          )}
          {hasContent && !loading && (
            <span
              role="button"
              title="Open in full view"
              onClick={e => { e.stopPropagation(); setModalOpen(true) }}
              className="ml-1 p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0 transition-colors"
            >
              <Maximize2 className="h-3 w-3" />
            </span>
          )}
        </button>

        {open && (
          <div className="border-t w-full min-w-0">
            {loading ? (
              <div className="flex justify-center py-2">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              </div>
            ) : !hasContent ? (
              <p className="text-[11px] text-muted-foreground italic px-3 py-1.5">
                No shared results yet
              </p>
            ) : (
              <div className="max-h-[480px] overflow-y-auto overflow-x-hidden w-full">
                <GroupedList
                  encGroups={encGroups}
                  deptGroups={deptGroups}
                  defMap={defMap}
                  patientId={patientId}
                  navigate={navigate}
                  compact
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Full-view modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl w-full p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-emerald-600 shrink-0" />
              <DialogTitle className="text-sm font-semibold">
                Results &amp; Reports
                {totalCount > 0 && (
                  <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-normal">
                    {totalCount}
                  </span>
                )}
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto overflow-x-hidden" style={{ maxHeight: 'calc(85vh - 56px)' }}>
            <GroupedList
              encGroups={encGroups}
              deptGroups={deptGroups}
              defMap={defMap}
              patientId={patientId}
              navigate={navigate}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── GroupedList ───────────────────────────────────────────────────────────────
function GroupedList({
  encGroups,
  deptGroups,
  defMap,
  patientId,
  navigate,
  compact = false,
}: {
  encGroups:  EncounterGroup[]
  deptGroups: DeptGroup[]
  defMap:     Record<string, BlockDefinition>
  patientId:  string
  navigate:   ReturnType<typeof useNavigate>
  compact?:   boolean
}) {
  const allGroupKeys = useMemo(
    () => new Set([...encGroups.map(g => g.encounterId), ...deptGroups.map(g => g.key)]),
    [encGroups, deptGroups],
  )
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(allGroupKeys))
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set())

  // Sync newly loaded groups to expanded state
  useEffect(() => {
    setExpandedGroups(new Set(allGroupKeys))
  }, [allGroupKeys])

  const toggleGroup = (id: string) =>
    setExpandedGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleBlock = (id: string) =>
    setExpandedBlocks(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="divide-y w-full">
      {encGroups.map(group => {
        const isOpen = expandedGroups.has(group.encounterId)
        return (
          <div key={group.encounterId} className="w-full min-w-0">
            <button
              type="button"
              onClick={() => toggleGroup(group.encounterId)}
              className="flex w-full min-w-0 items-center gap-1 px-2 py-1 text-left bg-muted/40 hover:bg-muted/70 transition-colors"
            >
              <ChevronRight className={cn('h-2.5 w-2.5 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
              <Stethoscope className="h-2.5 w-2.5 shrink-0 text-emerald-600" />
              <span className={cn('flex-1 min-w-0 font-medium truncate', compact ? 'text-[10px]' : 'text-xs')}>
                {group.title ?? 'Encounter'}
              </span>
              <span className="text-[9px] text-muted-foreground shrink-0 ml-1">
                {formatDate(group.createdAt, 'd MMM yyyy')}
              </span>
              <span className="text-[9px] px-1 rounded bg-background text-muted-foreground shrink-0 ml-1 border">
                {group.blocks.length}
              </span>
              <span
                role="button"
                title="Open encounter"
                onClick={e => { e.stopPropagation(); navigate(`/patients/${patientId}/encounters/${group.encounterId}`) }}
                className="ml-1 text-primary hover:text-primary/70 shrink-0 cursor-pointer"
              >
                <ExternalLink className="h-2.5 w-2.5" />
              </span>
            </button>

            {isOpen && (
              <div className="w-full min-w-0 overflow-hidden divide-y divide-border/40">
                {group.blocks.map(block => (
                  <ResultRow
                    key={block.id}
                    block={block}
                    definition={defMap[block.type]}
                    isExpanded={expandedBlocks.has(block.id)}
                    onToggle={() => toggleBlock(block.id)}
                    compact={compact}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {deptGroups.map(group => {
        const isOpen = expandedGroups.has(group.key)
        const DeptIcon = group.deptIcon ? (DEPT_ICONS[group.deptIcon] ?? Building2) : Building2
        return (
          <div key={group.key} className="w-full min-w-0">
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              className="flex w-full min-w-0 items-center gap-1 px-2 py-1 text-left bg-muted/40 hover:bg-muted/70 transition-colors"
            >
              <ChevronRight className={cn('h-2.5 w-2.5 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
              <DeptIcon className="h-2.5 w-2.5 shrink-0 text-indigo-600" />
              <span className={cn('flex-1 min-w-0 font-medium truncate', compact ? 'text-[10px]' : 'text-xs')}>
                {group.deptName ?? 'Department'}
              </span>
              <span className="text-[9px] px-1 rounded bg-background text-muted-foreground shrink-0 border">
                {group.blocks.length}
              </span>
            </button>

            {isOpen && (
              <div className="w-full min-w-0 overflow-hidden divide-y divide-border/40">
                {group.blocks.map(block => (
                  <ResultRow
                    key={block.id}
                    block={block}
                    definition={defMap[block.type]}
                    isExpanded={expandedBlocks.has(block.id)}
                    onToggle={() => toggleBlock(block.id)}
                    compact={compact}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── ResultRow ─────────────────────────────────────────────────────────────────
function ResultRow({
  block,
  definition,
  isExpanded,
  onToggle,
  compact = false,
}: {
  block:       SharedBlock
  definition?: BlockDefinition
  isExpanded:  boolean
  onToggle:    () => void
  compact?:    boolean
}) {
  const renderKey = definition
    ? registryRenderKey(definition)
    : orphanRegistryRenderKey(block.type)
  const renderer = BLOCK_REGISTRY[renderKey]
  const isDept   = !!block.department_id
  const deptSlug = (block as SharedBlock & { departments?: { slug?: string } }).departments?.slug
  const colors   = typeColors(isDept, deptSlug)

  const label = definition?.name?.trim()
    ? definition.name.trim()
    : block.type
        .replace(/^(lab_|rad_|phar_)/, '')
        .replace(/_order$/, ' Req.')
        .replace(/_result$/, ' Result')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="w-full min-w-0 bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full min-w-0 items-center gap-1 pl-5 pr-2 py-1 text-left hover:bg-accent/40 transition-colors"
      >
        <ChevronRight className={cn('h-2.5 w-2.5 shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-90')} />
        <span className={cn(
          'font-semibold px-1 py-0.5 rounded border shrink-0 leading-none truncate',
          compact ? 'text-[9px] max-w-[60px]' : 'text-[10px] max-w-[80px]',
          colors.bg, colors.text, colors.border,
        )}>
          {label}
        </span>
        <span className={cn('text-muted-foreground truncate flex-1 min-w-0', compact ? 'text-[10px]' : 'text-xs')}>
          {formatDateTime(block.created_at)}
        </span>
        {block.author_name && (
          <span className={cn('text-muted-foreground shrink-0 truncate hidden sm:block', compact ? 'text-[9px] max-w-[52px]' : 'text-[10px] max-w-[96px]')}>
            {block.author_name}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="w-full max-w-full overflow-x-hidden border-t bg-muted/20 px-2 py-1">
          <div className="w-full min-w-0 overflow-x-hidden text-[11px] [&_p]:break-words [&_span]:break-words [&_dd]:break-words [&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_table]:table-fixed [&_.space-y-3>*+*]:!mt-1 [&_.space-y-4>*+*]:!mt-1.5 pointer-events-none select-text">
            {renderer ? (
              <renderer.View block={block} />
            ) : definition && definition.fields.length > 0 ? (
              <DynamicBlockView definition={definition} content={block.content as Record<string, unknown>} />
            ) : (
              <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all font-mono w-full">
                {JSON.stringify(block.content, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
