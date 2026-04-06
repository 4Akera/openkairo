import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Block, BlockDefinition, Department } from '../../types'
import { formatDateTime } from '../../lib/utils'
import { ScrollArea } from '../ui'
import { cn } from '../../lib/utils'
import {
  BookOpen, ChevronDown, ChevronRight, Loader2,
  ExternalLink, Building2, FlaskConical, Scan,
  Activity,
} from 'lucide-react'
import { BLOCK_REGISTRY } from '../timeline/BlockRegistry'
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

// Map department / block type to a small color token
const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  lab:       { bg: 'bg-blue-50 dark:bg-blue-950/40',   text: 'text-blue-700 dark:text-blue-400',   border: 'border-blue-200 dark:border-blue-800' },
  radiology: { bg: 'bg-purple-50 dark:bg-purple-950/40', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800' },
  pharmacy:  { bg: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800' },
  encounter: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
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

export default function ResultsAndReports({ patientId }: Props) {
  const navigate  = useNavigate()
  const [blocks, setBlocks]     = useState<SharedBlock[]>([])
  const [defMap, setDefMap]     = useState<Record<string, BlockDefinition>>({})
  const [loading, setLoading]   = useState(true)
  const [open, setOpen]         = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const load = useCallback(async () => {
    setLoading(true)

    // Load block definitions for dynamic rendering
    const { data: defs } = await supabase
      .from('block_definitions')
      .select('*')
      .eq('active', true)
    if (defs) {
      const map: Record<string, BlockDefinition> = {}
      for (const d of defs as BlockDefinition[]) { map[d.slug] = d }
      setDefMap(map)
    }

    // 1. Encounter-sourced shared blocks
    const { data: encs } = await supabase
      .from('encounters')
      .select('id, title')
      .eq('patient_id', patientId)

    const encMap: Record<string, string | null> = {}
    const encIds = (encs ?? []).map(e => { encMap[e.id] = e.title; return e.id })

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
        encounterBlocks = data.map(b => ({
          ...b,
          encounter_title:  encMap[b.encounter_id] ?? null,
          encounter_id_raw: b.encounter_id,
          dept_name:        null,
          dept_icon:        null,
        })) as SharedBlock[]
      }
    }

    // 2. Department entry blocks
    const { data: deptData } = await supabase
      .from('blocks')
      .select('*, departments(name, icon, slug)')
      .eq('patient_id', patientId)
      .not('department_id', 'is', null)
      .eq('state', 'active')
      .order('created_at', { ascending: false })

    let deptBlocks: SharedBlock[] = []
    if (deptData) {
      deptBlocks = deptData.map(b => {
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

    const all = [...encounterBlocks, ...deptBlocks].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    setBlocks(all)
    setLoading(false)
  }, [patientId])

  useEffect(() => { load() }, [load])

  return (
    <div className="border rounded-md overflow-hidden">
      {/* Section header */}
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-left hover:bg-accent/50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        {open
          ? <ChevronDown  className="h-3 w-3 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
        <BookOpen className="h-3 w-3 shrink-0 text-emerald-600" />
        <span className="flex-1">Results &amp; Reports</span>
        {blocks.length > 0 && (
          <span className="text-[10px] px-1.5 rounded-full bg-muted text-muted-foreground">
            {blocks.length}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t">
          {loading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            </div>
          ) : blocks.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic px-3 py-2">
              No shared results yet
            </p>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="divide-y">
                {blocks.map(block => (
                  <ResultRow
                    key={block.id}
                    block={block}
                    definition={defMap[block.type]}
                    isExpanded={expanded.has(block.id)}
                    onToggle={() => toggle(block.id)}
                    onOpenEncounter={
                      block.encounter_id_raw
                        ? () => navigate(`/patients/${patientId}/encounters/${block.encounter_id_raw}`)
                        : undefined
                    }
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  )
}

function ResultRow({
  block,
  definition,
  isExpanded,
  onToggle,
  onOpenEncounter,
}: {
  block:            SharedBlock
  definition?:      BlockDefinition
  isExpanded:       boolean
  onToggle:         () => void
  onOpenEncounter?: () => void
}) {
  const renderer = BLOCK_REGISTRY[block.type]
  const isDept   = !!block.department_id
  const deptSlug = (block as SharedBlock & { departments?: { slug?: string } }).departments?.slug
  const colors   = typeColors(isDept, deptSlug)

  // Nice display name from type slug
  const label = block.type
    .replace(/^(lab_|rad_|phar_)/, '')
    .replace(/_order$/, ' Req.')
    .replace(/_result$/, ' Result')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())

  const DeptIcon = block.dept_icon ? (DEPT_ICONS[block.dept_icon] ?? Building2) : Building2

  return (
    <div className="bg-card">
      {/* Compact row */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full min-w-0 items-center gap-1.5 px-2 py-1.5 text-left hover:bg-accent/40 transition-colors"
      >
        <ChevronRight
          className={cn(
            'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
            isExpanded && 'rotate-90',
          )}
        />

        {/* type badge — fixed max width so it never stretches row */}
        <span className={cn(
          'text-[9px] font-semibold px-1 py-0.5 rounded border shrink-0 leading-none max-w-[72px] truncate',
          colors.bg, colors.text, colors.border,
        )}>
          {label}
        </span>

        {/* date only — truncates naturally */}
        <span className="text-[10px] text-muted-foreground truncate flex-1 min-w-0">
          {formatDateTime(block.created_at)}
        </span>

        {/* source — icon only on narrow view */}
        {isDept && block.dept_name ? (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0 max-w-[64px] truncate">
            <DeptIcon className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{block.dept_name}</span>
          </span>
        ) : onOpenEncounter ? (
          <span
            role="button"
            onClick={e => { e.stopPropagation(); onOpenEncounter() }}
            className="flex items-center gap-0.5 text-[10px] text-primary hover:underline shrink-0 max-w-[72px] truncate cursor-pointer"
          >
            <span className="truncate">{block.encounter_title ?? 'Encounter'}</span>
            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          </span>
        ) : null}
      </button>

      {/* Expanded content — hard clamped, no horizontal overflow */}
      {isExpanded && (
        <div className="w-full overflow-hidden border-t bg-muted/20 px-2.5 pb-2 pt-1.5">
          {block.author_name && (
            <p className="text-[10px] text-muted-foreground mb-1 truncate">
              {block.author_name}
            </p>
          )}
          <div className="text-[11px] overflow-hidden [&_*]:max-w-full [&_*]:break-words pointer-events-none select-text">
            {renderer ? (
              <renderer.View block={block} />
            ) : definition && definition.fields.length > 0 ? (
              <DynamicBlockView
                definition={definition}
                content={block.content as Record<string, unknown>}
              />
            ) : (
              <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap font-mono break-all">
                {JSON.stringify(block.content, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
