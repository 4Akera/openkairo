import { useState, useRef, useEffect } from 'react'
import type { Block, NurseNoteContent, NurseNoteEntry } from '../../../types'
import { Button, Textarea } from '../../ui'
import { Loader2, ClipboardList, Plus } from 'lucide-react'

// ============================================================
// Empty
// ============================================================

export function emptyNurseNote(): NurseNoteContent {
  return { entries: [] }
}

// ============================================================
// Helpers
// ============================================================

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function elapsed(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ============================================================
// View — read-only log
// ============================================================

export function NurseNoteView({ block }: { block: Block }) {
  const c = { entries: [], ...(block.content as Partial<NurseNoteContent>) }
  const entries = [...c.entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No entries yet.</p>
  }

  return (
    <div className="space-y-0">
      {entries.map((entry, i) => (
        <div key={entry.id} className="relative pl-5">
          {/* Timeline line */}
          {i < entries.length - 1 && (
            <div className="absolute left-[7px] top-4 bottom-0 w-px bg-border/60" />
          )}
          {/* Dot */}
          <div className="absolute left-0 top-[5px] h-3.5 w-3.5 rounded-full border-2 border-primary/40 bg-background" />

          <div className="pb-4">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] font-semibold text-foreground">
                {formatTime(entry.timestamp)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {elapsed(entry.timestamp)}
              </span>
              {entry.author && (
                <span className="text-[10px] text-muted-foreground">· {entry.author}</span>
              )}
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {entry.text}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// Edit — add new entry; existing entries shown read-only
// ============================================================

interface EditProps {
  block:    Block
  onSave:   (c: NurseNoteContent) => Promise<void>
  onCancel: () => void
}

export function NurseNoteEdit({ block, onSave, onCancel }: EditProps) {
  const existing = { entries: [], ...(block.content as Partial<NurseNoteContent>) }
  const [entries, setEntries] = useState<NurseNoteEntry[]>(existing.entries)
  const [draft, setDraft]     = useState('')
  const [saving, setSaving]   = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { textareaRef.current?.focus() }, [])

  const addEntry = () => {
    const text = draft.trim()
    if (!text) return
    const entry: NurseNoteEntry = {
      id:        crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      text,
      author:    block.author_name ?? undefined,
    }
    setEntries(prev => [...prev, entry])
    setDraft('')
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      addEntry()
    }
  }

  const handleSave = async () => {
    // If there's unsaved draft text, add it before saving
    let finalEntries = entries
    if (draft.trim()) {
      const entry: NurseNoteEntry = {
        id:        crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        text:      draft.trim(),
        author:    block.author_name ?? undefined,
      }
      finalEntries = [...entries, entry]
    }
    setSaving(true)
    await onSave({ entries: finalEntries })
    setSaving(false)
  }

  const sorted = [...entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )

  return (
    <div className="space-y-3">
      {/* New entry input */}
      <div className="space-y-2">
        <Textarea
          ref={textareaRef}
          rows={3}
          placeholder="Add a nursing log entry… (⌘↵ to add, save when done)"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          className="resize-none text-sm"
        />
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">⌘↵ adds entry and keeps editing</p>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            disabled={!draft.trim()}
            onClick={addEntry}
            className="h-7 text-xs gap-1"
          >
            <Plus className="h-3 w-3" /> Add entry
          </Button>
        </div>
      </div>

      {/* Pending new entries (not yet saved) */}
      {sorted.length > 0 && (
        <div className="border rounded-lg divide-y divide-border/60 bg-muted/20 max-h-60 overflow-y-auto">
          {sorted.map(entry => (
            <div key={entry.id} className="px-3 py-2">
              <p className="text-[11px] text-muted-foreground mb-0.5">
                {formatTime(entry.timestamp)}
                {entry.author && ` · ${entry.author}`}
              </p>
              <p className="text-sm whitespace-pre-wrap leading-snug">{entry.text}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="button" onClick={handleSave} disabled={saving || (entries.length === 0 && !draft.trim())}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <ClipboardList className="h-3.5 w-3.5" />
          Save log
        </Button>
      </div>
    </div>
  )
}
