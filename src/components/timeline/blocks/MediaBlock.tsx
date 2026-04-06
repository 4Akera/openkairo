import { useState } from 'react'
import type { Block } from '../../../types'
import { Button, Label, Textarea } from '../../ui'
import { Loader2, ImageIcon, Paperclip } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MediaContent {
  caption: string
}

export function emptyMedia(): MediaContent {
  return { caption: '' }
}

// ─── View ─────────────────────────────────────────────────────────────────────

export function MediaView({ block }: { block: Block }) {
  const c = block.content as Partial<MediaContent>
  const caption = (c.caption ?? '').trim()

  return (
    <div className="space-y-2 text-sm">
      {caption && (
        <p className="text-muted-foreground italic">{caption}</p>
      )}
      {!caption && (
        <div className="flex items-center gap-2 text-muted-foreground py-2">
          <ImageIcon className="h-4 w-4 shrink-0" />
          <span className="text-sm italic">Media block — attachments appear below.</span>
        </div>
      )}
    </div>
  )
}

// ─── Edit ─────────────────────────────────────────────────────────────────────

interface EditProps {
  block:    Block
  onSave:   (c: MediaContent) => Promise<void>
  onCancel: () => void
}

export function MediaEdit({ block, onSave, onCancel }: EditProps) {
  const existing = block.content as Partial<MediaContent>
  const [caption, setCaption] = useState(existing.caption ?? '')
  const [saving, setSaving]   = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave({ caption })
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-dashed bg-muted/30 p-4 flex items-center gap-3 text-muted-foreground">
        <Paperclip className="h-4 w-4 shrink-0" />
        <p className="text-xs leading-relaxed">
          Use the attachment strip below this block to upload images, PDFs, and other files.
          Add an optional caption here to describe the media.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Caption <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Textarea
          rows={2}
          placeholder="Describe the attached media, e.g. 'Wound photograph — day 3 post-op'…"
          value={caption}
          onChange={e => setCaption(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="button" disabled={saving} onClick={handleSave}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  )
}
