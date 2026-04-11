import { useState, useEffect, useRef } from 'react'
import { Paperclip, Upload, X, Image, FileText, Film, File, ExternalLink } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'
import type { BlockAttachment } from '../../../types'
import { cn } from '../../../lib/utils'

const BUCKET = 'block-media'

function mimeIcon(mime: string) {
  if (mime.startsWith('image/')) return Image
  if (mime.startsWith('video/')) return Film
  if (mime === 'application/pdf') return FileText
  return File
}

function humanSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ============================================================
// Single attachment card
// ============================================================

function AttachmentCard({
  attachment,
  onDelete,
  readOnly,
}: {
  attachment: BlockAttachment
  onDelete: () => void
  readOnly: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)
  const Icon = mimeIcon(attachment.mime_type)

  useEffect(() => {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(attachment.storage_path)
    setUrl(data.publicUrl)
  }, [attachment.storage_path])

  const isImage = attachment.mime_type.startsWith('image/')
  const isVideo = attachment.mime_type.startsWith('video/')

  return (
    <div className="group relative rounded-lg border border-border bg-muted/30 overflow-hidden w-32 flex-shrink-0">
      {/* Preview */}
      <div className="h-20 flex items-center justify-center bg-muted/50">
        {isImage && url ? (
          <img src={url} alt={attachment.file_name} className="w-full h-full object-cover" />
        ) : isVideo && url ? (
          <video src={url} className="w-full h-full object-cover" muted />
        ) : (
          <Icon className="w-8 h-8 text-muted-foreground" />
        )}
      </div>

      {/* Footer */}
      <div className="px-1.5 py-1">
        <p className="text-[10px] font-medium truncate leading-tight">{attachment.file_name}</p>
        <p className="text-[10px] text-muted-foreground">{humanSize(attachment.file_size)}</p>
      </div>

      {/* Hover actions */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded bg-white/20 hover:bg-white/40 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-white" />
          </a>
        )}
        {!readOnly && (
          <button
            onClick={onDelete}
            className="p-1 rounded bg-red-500/80 hover:bg-red-500 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Main AttachmentTray
// ============================================================

export function AttachmentTray({
  blockId,
  readOnly = false,
}: {
  blockId: string
  readOnly?: boolean
}) {
  const { user, profile } = useAuthStore()
  const [attachments, setAttachments] = useState<BlockAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadAttachments()
    // Real-time subscription handles updates from OTHER users
    const channel = supabase
      .channel(`attachments:${blockId}`, { config: { private: true } })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'block_attachments', filter: `block_id=eq.${blockId}` },
        () => loadAttachments(),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [blockId])

  const appendAttachment = (attachment: BlockAttachment) => {
    setAttachments((prev) => {
      if (prev.some((a) => a.id === attachment.id)) return prev
      return [...prev, attachment]
    })
  }

  const loadAttachments = async () => {
    const { data } = await supabase
      .from('block_attachments')
      .select('*')
      .eq('block_id', blockId)
      .order('created_at', { ascending: true })
    if (data) setAttachments(data as BlockAttachment[])
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || !user) return
    setUploading(true)
    setError(null)

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() ?? 'bin'
      const path = `${blockId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file)
      if (uploadErr) {
        setError(`Upload failed: ${uploadErr.message}`)
        continue
      }

      // Insert row and get it back so we can append immediately without waiting for realtime
      const { data: row, error: rowErr } = await supabase
        .from('block_attachments')
        .insert({
          block_id: blockId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || 'application/octet-stream',
          file_size: file.size,
          uploaded_by: user.id,
        })
        .select()
        .single()

      if (!rowErr && row) appendAttachment(row as BlockAttachment)
    }

    setUploading(false)
  }

  const handleDelete = async (attachment: BlockAttachment) => {
    // Remove from local state immediately for snappy feedback
    setAttachments((prev) => prev.filter((a) => a.id !== attachment.id))
    await supabase.storage.from(BUCKET).remove([attachment.storage_path])
    await supabase.from('block_attachments').delete().eq('id', attachment.id)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  if (attachments.length === 0 && readOnly) return null

  return (
    <div className="border-t border-border/50 bg-muted/20">
      {/* Header toggle */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Paperclip className="w-3 h-3" />
        <span>
          {attachments.length > 0
            ? `${attachments.length} attachment${attachments.length !== 1 ? 's' : ''}`
            : 'Attachments'}
        </span>
        <span className="ml-auto">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Attachment grid */}
          {attachments.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {attachments.map((a) => (
                <AttachmentCard
                  key={a.id}
                  attachment={a}
                  onDelete={() => handleDelete(a)}
                  readOnly={readOnly}
                />
              ))}
            </div>
          )}

          {/* Upload zone */}
          {!readOnly && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className={cn(
                'border-2 border-dashed border-border rounded-lg p-3 text-center cursor-pointer',
                'hover:border-primary/50 hover:bg-primary/5 transition-colors',
                uploading && 'opacity-50 pointer-events-none',
              )}
            >
              <Upload className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {uploading ? 'Uploading…' : 'Drop files or click to upload'}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                Images, videos, PDFs, documents
              </p>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          {!profile?.full_name && !readOnly && (
            <p className="text-[10px] text-amber-600">
              Set your profile name so attachments are attributed correctly.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
