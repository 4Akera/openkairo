import { useState } from 'react'
import type { Block, NoteContent } from '../../../types'
import { Textarea, Button, Label } from '../../ui'
import { Loader2, Mic, MicOff } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useDictation, appendDictation } from '../../../hooks/useDictation'

// ============================================================
// Content
// ============================================================

export function emptyNote(): NoteContent {
  return { body: '' }
}

// ============================================================
// View
// ============================================================

export function NoteView({ block }: { block: Block }) {
  const c = block.content as Partial<NoteContent>
  const body = (c.body ?? '').trim()

  if (!body) {
    return <p className="text-sm text-muted-foreground italic">No note text.</p>
  }

  return (
    <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">
      {body}
    </div>
  )
}

// ============================================================
// Edit
// ============================================================

interface EditProps {
  block: Block
  onSave: (c: NoteContent) => Promise<void>
  onCancel: () => void
}

export function NoteEdit({ block, onSave, onCancel }: EditProps) {
  const existing = block.content as Partial<NoteContent>
  const [form, setForm] = useState<NoteContent>({
    body: existing.body ?? '',
  })
  const [saving, setSaving] = useState(false)
  const dictation = useDictation(text =>
    setForm(f => ({ ...f, body: appendDictation(f.body, text) })),
  )

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Note</Label>
          {/* Voice typing — rendered only where the Web Speech API exists */}
          {dictation.supported && (
            <button
              type="button"
              onClick={dictation.toggle}
              title={dictation.listening ? 'Stop dictation' : 'Dictate'}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                dictation.listening
                  ? 'border-red-400 bg-red-500/10 text-red-600 dark:text-red-400 animate-pulse'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/40',
              )}
            >
              {dictation.listening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
              {dictation.listening ? 'Listening… tap to stop' : 'Dictate'}
            </button>
          )}
        </div>
        <Textarea
          rows={4}
          className="resize-y font-mono text-sm"
          placeholder="Clinical note, instructions, or observations…"
          value={form.body}
          onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
        />
        {dictation.error && (
          <p className="text-[11px] text-red-600 dark:text-red-400">{dictation.error}</p>
        )}
        <p className="text-[11px] text-muted-foreground">
          Add images, PDFs, and other files in the attachment strip below this block.
        </p>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" type="button" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save note
        </Button>
      </div>
    </div>
  )
}
