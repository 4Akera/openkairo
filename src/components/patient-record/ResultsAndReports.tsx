import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Block } from '../../types'
import { formatDateTime } from '../../lib/utils'
import { ScrollArea } from '../ui'
import { BookOpen, ChevronDown, ChevronRight, Loader2, ExternalLink } from 'lucide-react'
import { BLOCK_REGISTRY } from '../timeline/BlockRegistry'

interface Props {
  patientId: string
}

interface SharedBlock extends Block {
  encounter_title: string | null
  encounter_id_raw: string
}

export default function ResultsAndReports({ patientId }: Props) {
  const navigate = useNavigate()
  const [blocks, setBlocks] = useState<SharedBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)

  const loadSharedBlocks = useCallback(async () => {
    // Fetch all encounters for this patient to get their ids + titles
    const { data: encs } = await supabase
      .from('encounters')
      .select('id, title')
      .eq('patient_id', patientId)

    if (!encs || encs.length === 0) {
      setLoading(false)
      return
    }

    const encIds = encs.map(e => e.id)
    const encMap: Record<string, string | null> = {}
    encs.forEach(e => { encMap[e.id] = e.title })

    const { data } = await supabase
      .from('blocks')
      .select('*')
      .in('encounter_id', encIds)
      .eq('share_to_record', true)
      .eq('state', 'active')
      .order('created_at', { ascending: false })

    if (data) {
      setBlocks(
        data.map(b => ({
          ...b,
          encounter_title: encMap[b.encounter_id] ?? null,
          encounter_id_raw: b.encounter_id,
        })) as SharedBlock[],
      )
    }
    setLoading(false)
  }, [patientId])

  useEffect(() => { loadSharedBlocks() }, [loadSharedBlocks])

  return (
    <div className="space-y-0.5">
      <div className="border rounded-md overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-left hover:bg-accent/50 transition-colors"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded
            ? <ChevronDown className="h-3 w-3 shrink-0" />
            : <ChevronRight className="h-3 w-3 shrink-0" />}
          <BookOpen className="h-3 w-3 shrink-0 text-emerald-600" />
          <span className="flex-1 truncate">Results &amp; Reports</span>
          {blocks.length > 0 && (
            <span className="text-[10px] px-1.5 py-0 rounded-full bg-muted text-muted-foreground shrink-0">
              {blocks.length}
            </span>
          )}
        </button>

        {expanded && (
          <div className="border-t bg-muted/20">
            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : blocks.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-3 py-2">
                No shared results yet
              </p>
            ) : (
              <ScrollArea className="max-h-[480px]">
                <div className="px-3 py-2 space-y-2">
                  {blocks.map(block => (
                    <SharedBlockCard
                      key={block.id}
                      block={block}
                      onOpenEncounter={() =>
                        navigate(`/patients/${patientId}/encounters/${block.encounter_id_raw}`)
                      }
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SharedBlockCard({
  block,
  onOpenEncounter,
}: {
  block: SharedBlock
  onOpenEncounter: () => void
}) {
  const renderer = BLOCK_REGISTRY[block.type]
  const typeLabel = block.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-muted/40 border-b">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium shrink-0">
            {typeLabel}
          </span>
          <span className="text-[10px] text-muted-foreground truncate">
            {formatDateTime(block.created_at)}
            {block.author_name && ` · ${block.author_name}`}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenEncounter}
          className="flex items-center gap-1 text-[10px] text-primary hover:underline shrink-0"
          title="Open encounter"
        >
          {block.encounter_title ?? `#${block.encounter_id_raw.slice(0, 6).toUpperCase()}`}
          <ExternalLink className="h-2.5 w-2.5" />
        </button>
      </div>

      {/* Block content — view-only */}
      <div className="px-3 py-2 text-xs pointer-events-none select-text">
        {renderer ? (
          <renderer.View block={block} />
        ) : (
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
            {JSON.stringify(block.content, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}
