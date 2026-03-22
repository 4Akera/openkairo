import { useState, useEffect } from 'react'
import { Plus, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'
import type { BlockDefinition, BlockEntry, FieldDef } from '../../../types'
import { formatDateTime } from '../../../lib/utils'
import { Button } from '../../ui'
import { DynamicBlockEdit } from '../DynamicBlock'

// ============================================================
// Single entry row in the table view
// ============================================================

function EntryRow({
  entry,
  fields,
}: {
  entry: BlockEntry
  fields: FieldDef[]
}) {
  const [expanded, setExpanded] = useState(false)
  const data = entry.data as Record<string, unknown>

  const visibleFields = fields.filter((f) => f.type !== 'section_header')
  const preview = visibleFields
    .slice(0, 4)
    .map((f) => {
      const v = data[f.id]
      if (v === null || v === undefined || v === '') return null
      return `${f.label}: ${String(v)}${f.unit ? ` ${f.unit}` : ''}`
    })
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="border-b border-border/40 last:border-0">
      <div
        className="flex items-start gap-2 px-3 py-2 hover:bg-muted/30 cursor-pointer"
        onClick={() => setExpanded((p) => !p)}
      >
        <Clock className="w-3 h-3 mt-0.5 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground">
            {formatDateTime(entry.recorded_at)}
            {entry.author_name && ` · ${entry.author_name}`}
          </p>
          <p className="text-xs truncate mt-0.5">{preview || '—'}</p>
        </div>
        {expanded ? (
          <ChevronUp className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
        ) : (
          <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
          {visibleFields.map((f) => {
            const v = data[f.id]
            if (v === null || v === undefined || v === '') return null
            return (
              <div key={f.id} className="text-xs">
                <span className="text-muted-foreground">{f.label}: </span>
                <span>
                  {String(v)}
                  {f.unit ? ` ${f.unit}` : ''}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Add entry form
// ============================================================

function AddEntryForm({
  definition,
  blockId,
  onSaved,
  onCancel,
}: {
  definition: BlockDefinition
  blockId: string
  onSaved: (newEntry: BlockEntry) => void
  onCancel: () => void
}) {
  const { user, profile } = useAuthStore()
  const [content, setContent] = useState<Record<string, unknown>>(() => {
    const c: Record<string, unknown> = {}
    definition.time_series_fields.forEach((f) => {
      if (f.type === 'checkbox') c[f.id] = false
      else if (f.type === 'multiselect') c[f.id] = []
      else if (f.type !== 'section_header') c[f.id] = ''
    })
    return c
  })
  const [recordedAt, setRecordedAt] = useState(
    () => new Date().toISOString().slice(0, 16),
  )
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!user) return
    setSaving(true)
    const { data, error } = await supabase
      .from('block_entries')
      .insert({
        block_id: blockId,
        data: content,
        recorded_at: new Date(recordedAt).toISOString(),
        author_name: profile?.full_name || null,
        created_by: user.id,
      })
      .select()
      .single()
    setSaving(false)
    if (!error && data) onSaved(data as BlockEntry)
  }

  // Use a temporary definition-like object for time_series_fields
  const tsDef: BlockDefinition = { ...definition, fields: definition.time_series_fields }

  return (
    <div className="border border-border rounded-lg p-3 bg-background space-y-3">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Recorded at</label>
        <input
          type="datetime-local"
          value={recordedAt}
          onChange={(e) => setRecordedAt(e.target.value)}
          className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <DynamicBlockEdit definition={tsDef} content={content} onChange={setContent} />

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Add Entry'}
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// Main TimeSeriesPanel
// ============================================================

export function TimeSeriesPanel({
  blockId,
  definition,
  readOnly = false,
}: {
  blockId: string
  definition: BlockDefinition
  readOnly?: boolean
}) {
  const [entries, setEntries] = useState<BlockEntry[]>([])
  const [adding, setAdding] = useState(false)
  const [expanded, setExpanded] = useState(true)

  const loadEntries = async () => {
    const { data } = await supabase
      .from('block_entries')
      .select('*')
      .eq('block_id', blockId)
      .order('recorded_at', { ascending: false })
    if (data) setEntries(data as BlockEntry[])
  }

  // Prepend entry, deduplicating by id (handles both own inserts and other users)
  const prependEntry = (entry: BlockEntry) => {
    setEntries((prev) => {
      if (prev.some((e) => e.id === entry.id)) return prev
      return [entry, ...prev]
    })
  }

  useEffect(() => {
    loadEntries()
    // Subscribe for entries from OTHER users (own inserts are handled via prependEntry callback)
    const channel = supabase
      .channel(`entries:${blockId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'block_entries', filter: `block_id=eq.${blockId}` },
        (payload) => prependEntry(payload.new as BlockEntry),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [blockId])

  const hasFields = definition.time_series_fields.filter((f) => f.type !== 'section_header').length > 0

  if (!hasFields && readOnly) return null

  return (
    <div className="border-t border-border/50 bg-muted/10">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          onClick={() => setExpanded((p) => !p)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors flex-1"
        >
          <Clock className="w-3 h-3" />
          <span>
            Entries
            {entries.length > 0 && (
              <span className="ml-1 text-[10px] bg-muted rounded-full px-1.5 py-0.5">
                {entries.length}
              </span>
            )}
          </span>
          {expanded ? (
            <ChevronUp className="w-3 h-3 ml-auto" />
          ) : (
            <ChevronDown className="w-3 h-3 ml-auto" />
          )}
        </button>

        {!readOnly && hasFields && (
          <button
            onClick={() => { setAdding(true); setExpanded(true) }}
            className="p-0.5 rounded hover:bg-muted transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {expanded && (
        <div className="pb-2">
          {adding && (
            <div className="px-3 pb-2">
              <AddEntryForm
                definition={definition}
                blockId={blockId}
                onSaved={(newEntry) => { prependEntry(newEntry); setAdding(false) }}
                onCancel={() => setAdding(false)}
              />
            </div>
          )}

          {entries.length === 0 && !adding ? (
            <p className="text-xs text-muted-foreground px-3 pb-2">No entries yet.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {entries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  fields={definition.time_series_fields}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
