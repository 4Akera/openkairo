import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import type { ArchiveEntry, ArchiveCategory, Encounter } from '../../types'
import { formatDateWithPrecision, formatDateTime, cn } from '../../lib/utils'
import type { DatePrecision } from '../../types'
import { ClinicalDatePicker } from '../ui/ClinicalDatePicker'
import {
  Button,
  Input,
  Label,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ScrollArea,
} from '../ui'
import { Plus, Edit2, Trash2, Loader2, ChevronDown, ChevronRight, Download, Circle } from 'lucide-react'

interface Props {
  patientId: string
  encounterId?: string  // highlights the current encounter
}

// Sections shown in the UI (hosp combines 'admission' + 'surgery' in DB)
type UiSection = 'hosp' | 'family_hx' | 'social_hx' | 'document'

const ARCHIVE_SECTIONS: { key: UiSection; label: string }[] = [
  { key: 'hosp',       label: 'Visit History' },
  { key: 'family_hx',  label: 'Family Hx' },
  { key: 'social_hx',  label: 'Social Hx' },
  { key: 'document',   label: 'Documents' },
]

function sectionFor(cat: ArchiveCategory): UiSection {
  if (cat === 'visit') return 'hosp'
  return cat as UiSection
}

export default function HistoricalArchive({ patientId, encounterId }: Props) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [entries, setEntries] = useState<ArchiveEntry[]>([])
  const [encounters, setEncounters] = useState<Encounter[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<UiSection | null>('hosp')
  const [formOpen, setFormOpen] = useState(false)
  const [formSection, setFormSection] = useState<UiSection>('hosp')
  const [editEntry, setEditEntry] = useState<ArchiveEntry | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [docFile, setDocFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const loadEntries = useCallback(async () => {
    const [archiveRes, encRes] = await Promise.all([
      supabase
        .from('patient_archive')
        .select('*, profiles!created_by(full_name)')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false }),
      supabase
        .from('encounters')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false }),
    ])


    if (archiveRes.error) {
      const { data: basic } = await supabase
        .from('patient_archive')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
      setEntries((basic ?? []) as ArchiveEntry[])
    } else {
      setEntries((archiveRes.data ?? []) as ArchiveEntry[])
    }

    if (encRes.data) {
      // Batch-fetch creator names from profiles (profiles.id = auth.users.id)
      const creatorIds = [...new Set(encRes.data.map(e => e.created_by).filter(Boolean))]
      let profileMap: Record<string, string> = {}
      if (creatorIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', creatorIds)
        if (profs) {
          for (const p of profs) profileMap[p.id] = p.full_name
        }
      }
      setEncounters(
        encRes.data.map(e => ({
          ...e,
          created_profile: e.created_by ? { full_name: profileMap[e.created_by] ?? null } : null,
        })) as Encounter[],
      )
    }
    setLoading(false)
  }, [patientId])

  useEffect(() => { loadEntries() }, [loadEntries])

  const openAdd = (section: UiSection) => {
    setFormSection(section)
    setEditEntry(null)
    setForm(defaultForm(section))
    setDocFile(null)
    setFormOpen(true)
  }

  const openEdit = (entry: ArchiveEntry) => {
    const section = sectionFor(entry.category)
    setFormSection(section)
    setEditEntry(entry)
    setForm(entry.content as Record<string, string>)
    setDocFile(null)
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)

    let category: ArchiveCategory
    let content: Record<string, string>

    if (formSection === 'hosp') {
      category = 'visit'
      const { ...rest } = form
      content = rest
    } else {
      category = formSection as ArchiveCategory
      content = form
    }

    // Handle document file upload
    let storagePath: string | null = editEntry?.storage_path ?? null
    let fileName: string | null = editEntry?.file_name ?? null
    let fileSize: number | null = editEntry?.file_size ?? null
    let mimeType: string | null = editEntry?.mime_type ?? null

    if (formSection === 'document' && docFile) {
      const path = `${patientId}/${Date.now()}-${docFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage
        .from('patient-docs')
        .upload(path, docFile, { upsert: true })
      if (!upErr) {
        storagePath = path
        fileName = docFile.name
        fileSize = docFile.size
        mimeType = docFile.type
      }
    }

    if (editEntry) {
      await supabase.from('patient_archive').update({
        category,
        content,
        storage_path: storagePath,
        file_name: fileName,
        file_size: fileSize,
        mime_type: mimeType,
      }).eq('id', editEntry.id)
    } else {
      await supabase.from('patient_archive').insert({
        patient_id: patientId,
        category,
        content,
        storage_path: storagePath,
        file_name: fileName,
        file_size: fileSize,
        mime_type: mimeType,
        created_by: user.id,
      })
    }
    setFormOpen(false)
    loadEntries()
    setSaving(false)
  }

  const handleDelete = async (entry: ArchiveEntry) => {
    if (entry.storage_path) {
      await supabase.storage.from('patient-docs').remove([entry.storage_path])
    }
    await supabase.from('patient_archive').delete().eq('id', entry.id)
    setConfirmDelete(null)
    loadEntries()
  }

  const bySection = (section: UiSection) =>
    entries.filter(e => sectionFor(e.category) === section)

  return (
    <>
      <div className="space-y-0.5">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
          Medical History
        </span>

        {loading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* ── Archive sections ── */}
            {ARCHIVE_SECTIONS.map(({ key, label }) => {
              const items = bySection(key)
              const isExp = expanded === key
              const totalCount = key === 'hosp' ? items.length + encounters.length : items.length
              return (
                <div key={key} className="border rounded-md overflow-hidden">
                  <div className="flex w-full items-center">
                    <button
                      type="button"
                      className="flex flex-1 min-w-0 items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-left hover:bg-accent/50 transition-colors"
                      onClick={() => setExpanded(isExp ? null : key)}
                    >
                      {isExp ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{label}</span>
                      {totalCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0 rounded-full bg-muted text-muted-foreground shrink-0">
                          {totalCount}
                        </span>
                      )}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="h-5 w-5 shrink-0 mr-1"
                      onClick={() => openAdd(key)}
                      aria-label={`Add ${label}`}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>

                  {isExp && (
                    <div className="px-3 py-2 space-y-1.5 border-t bg-muted/20">
                      {key === 'hosp' ? (() => {
                        // Build a unified, chronologically sorted list
                        type VisitItem =
                          | { kind: 'archive'; data: ArchiveEntry; sortDate: Date }
                          | { kind: 'encounter'; data: Encounter; sortDate: Date }

                        const archiveItems: VisitItem[] = bySection('hosp').map(e => {
                          const c = e.content as Record<string, string>
                          const dateStr = c.date
                          return {
                            kind: 'archive',
                            data: e,
                            sortDate: dateStr ? new Date(dateStr) : new Date(e.created_at),
                          }
                        })

                        const encItems: VisitItem[] = encounters.map(enc => ({
                          kind: 'encounter',
                          data: enc,
                          sortDate: new Date(enc.created_at),
                        }))

                        const merged = [...archiveItems, ...encItems].sort(
                          (a, b) => b.sortDate.getTime() - a.sortDate.getTime(),
                        )

                        if (merged.length === 0) {
                          return <p className="text-xs text-muted-foreground italic py-1.5">None recorded</p>
                        }

                        return merged.map(item =>
                          item.kind === 'archive' ? (
                            <EntryRow
                              key={`archive-${item.data.id}`}
                              entry={item.data}
                              patientId={patientId}
                              confirmDelete={confirmDelete}
                              onEdit={() => openEdit(item.data)}
                              onRequestDelete={() => setConfirmDelete(item.data.id)}
                              onConfirmDelete={() => handleDelete(item.data)}
                              onCancelDelete={() => setConfirmDelete(null)}
                            />
                          ) : (
                            <EncounterRow
                              key={`enc-${item.data.id}`}
                              encounter={item.data}
                              isCurrent={item.data.id === encounterId}
                              onNavigate={() => navigate(`/patients/${patientId}/encounters/${item.data.id}`)}
                            />
                          ),
                        )
                      })() : (
                        <>
                          {items.length === 0 && (
                            <p className="text-xs text-muted-foreground italic py-1.5">None recorded</p>
                          )}
                          {items.map(entry => (
                            <EntryRow
                              key={entry.id}
                              entry={entry}
                              patientId={patientId}
                              confirmDelete={confirmDelete}
                              onEdit={() => openEdit(entry)}
                              onRequestDelete={() => setConfirmDelete(entry.id)}
                              onConfirmDelete={() => handleDelete(entry)}
                              onCancelDelete={() => setConfirmDelete(null)}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editEntry ? 'Edit' : 'Add'}{' '}
              {formSection === 'hosp'
                ? 'Visit'
                : ARCHIVE_SECTIONS.find(s => s.key === formSection)?.label.replace(/s$/, '')}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="mt-2 pr-1">
              <ArchiveForm
                section={formSection}
                form={form}
                onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))}
                docFile={docFile}
                onDocFile={setDocFile}
                fileRef={fileRef}
                existingFileName={editEntry?.file_name ?? null}
              />
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}

function EntryRow({
  entry,
  patientId: _patientId,
  confirmDelete,
  onEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  entry: ArchiveEntry
  patientId: string
  confirmDelete: string | null
  onEdit: () => void
  onRequestDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}) {
  const c = entry.content as Record<string, string>
  let title = ''
  let detail = ''

  switch (entry.category) {
    case 'visit':
      title = c.reason ?? 'Visit'
      detail = [
        c.date ? formatDateWithPrecision(c.date, (c.date_precision as DatePrecision | undefined) ?? 'full') : null,
        c.date_out ? `→ ${formatDateWithPrecision(c.date_out, (c.date_out_precision as DatePrecision | undefined) ?? 'full')}` : null,
      ].filter(Boolean).join(' ')
      break
    case 'family_hx':
      title = `${c.relation}: ${c.condition}`
      break
    case 'social_hx':
      title = [c.smoking && `Smoking: ${c.smoking}`, c.occupation && `Occ: ${c.occupation}`].filter(Boolean).join(' · ')
      detail = c.alcohol ? `Alcohol: ${c.alcohol}` : ''
      break
    case 'document':
      title = c.name ?? 'Document'
      detail = c.document_type ?? ''
      break
  }

  const isConfirming = confirmDelete === entry.id

  const downloadUrl = entry.storage_path
    ? supabase.storage.from('patient-docs').getPublicUrl(entry.storage_path).data.publicUrl
    : null

  return (
    <div className="group flex items-start gap-2 py-2 px-2.5 rounded-md hover:bg-accent/50 transition-colors border border-transparent hover:border-border/50">
      {isConfirming ? (
        <div className="flex-1 flex items-center justify-between gap-2">
          <span className="text-xs text-destructive font-medium">Delete this entry?</span>
          <div className="flex gap-1">
            <Button size="sm" variant="destructive" className="h-6 px-2 text-xs" onClick={onConfirmDelete}>
              Yes, delete
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={onCancelDelete}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="text-xs font-semibold leading-tight">{title || '—'}</p>
            {detail && <p className="text-[11px] text-muted-foreground">{detail}</p>}
            {c.notes && <p className="text-[11px] text-muted-foreground italic line-clamp-2">{c.notes}</p>}
            {entry.file_name && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Download className="h-2.5 w-2.5 shrink-0" />
                {entry.file_name}
                {entry.file_size && ` · ${(entry.file_size / 1024).toFixed(0)} KB`}
              </p>
            )}
            {entry.profiles?.full_name && (
              <p className="text-[10px] text-muted-foreground/50">Added by {entry.profiles.full_name}</p>
            )}
          </div>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5">
            {downloadUrl && (
              <a href={downloadUrl} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="icon-sm" title="Download file">
                  <Download className="h-3 w-3" />
                </Button>
              </a>
            )}
            <Button variant="ghost" size="icon-sm" onClick={onEdit}><Edit2 className="h-3 w-3" /></Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="hover:text-destructive"
              onClick={onRequestDelete}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function EncounterRow({
  encounter,
  isCurrent,
  onNavigate,
}: {
  encounter: Encounter
  isCurrent: boolean
  onNavigate: () => void
}) {
  return (
    <div
      className={cn(
        'group flex items-start gap-2.5 rounded-md px-2.5 py-2 text-xs transition-colors border border-transparent',
        isCurrent
          ? 'bg-primary/5 border-primary/20'
          : 'hover:bg-accent/50 hover:border-border/50 cursor-pointer',
      )}
      onClick={isCurrent ? undefined : onNavigate}
    >
      {/* Status dot */}
      <Circle
        className={cn(
          'h-2 w-2 shrink-0 mt-1',
          encounter.status === 'open'
            ? 'fill-emerald-500 text-emerald-500'
            : 'fill-slate-300 text-slate-300',
        )}
      />

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        {/* Row 1: title + badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn('font-semibold leading-tight truncate', isCurrent ? 'text-primary' : '')}>
            {encounter.title ?? `#${encounter.id.slice(0, 8).toUpperCase()}`}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 font-medium shrink-0">
            Encounter
          </span>
          {isCurrent && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0 font-medium">
              Current
            </span>
          )}
        </div>
        {/* Row 2: date + dr name */}
        <p className="text-[10px] text-muted-foreground leading-tight">
          {formatDateTime(encounter.created_at)}
          {encounter.created_profile?.full_name && (
            <span className="opacity-70"> · {encounter.created_profile.full_name}</span>
          )}
        </p>
      </div>
    </div>
  )
}

function ArchiveForm({
  section,
  form,
  onChange,
  docFile,
  onDocFile,
  fileRef,
  existingFileName,
}: {
  section: UiSection
  form: Record<string, string>
  onChange: (key: string, value: string) => void
  docFile: File | null
  onDocFile: (f: File | null) => void
  fileRef: React.RefObject<HTMLInputElement | null>
  existingFileName: string | null
}) {
  const f = (key: string) => ({
    value: form[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(key, e.target.value),
  })

  switch (section) {
    case 'hosp':
      return (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Visit Reason <span className="text-destructive">*</span></Label>
            <Input
              placeholder="e.g. Pneumonia admission, Appendectomy, Follow-up clinic…"
              {...f('reason')}
            />
          </div>
          <div className="space-y-1">
            <Label>Date</Label>
            <ClinicalDatePicker
              value={form['date'] ?? null}
              precision={(form['date_precision'] as DatePrecision | undefined) ?? null}
              onChange={(iso, prec) => {
                onChange('date', iso ?? '')
                onChange('date_precision', prec ?? '')
              }}
              placeholder="Select visit date"
            />
          </div>
          <div className="space-y-1">
            <Label>Date out <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
            <ClinicalDatePicker
              value={form['date_out'] ?? null}
              precision={(form['date_out_precision'] as DatePrecision | undefined) ?? null}
              onChange={(iso, prec) => {
                onChange('date_out', iso ?? '')
                onChange('date_out_precision', prec ?? '')
              }}
              placeholder="Select discharge / end date"
            />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={2} {...f('notes')} />
          </div>
        </div>
      )
    case 'family_hx':
      return (
        <div className="space-y-3">
          <div className="space-y-1"><Label>Relation *</Label><Input placeholder="e.g. Father, Mother" {...f('relation')} /></div>
          <div className="space-y-1"><Label>Condition *</Label><Input placeholder="e.g. Type 2 Diabetes" {...f('condition')} /></div>
          <div className="space-y-1"><Label>Notes</Label><Textarea rows={2} {...f('notes')} /></div>
        </div>
      )
    case 'social_hx':
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Smoking</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={form['smoking'] ?? ''}
                onChange={e => onChange('smoking', e.target.value)}
              >
                <option value="">—</option>
                <option>Never</option>
                <option>Former</option>
                <option>Current</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Alcohol</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={form['alcohol'] ?? ''}
                onChange={e => onChange('alcohol', e.target.value)}
              >
                <option value="">—</option>
                <option>None</option>
                <option>Occasional</option>
                <option>Regular</option>
              </select>
            </div>
          </div>
          <div className="space-y-1"><Label>Occupation</Label><Input {...f('occupation')} /></div>
          <div className="space-y-1"><Label>Notes</Label><Textarea rows={2} {...f('notes')} /></div>
        </div>
      )
    case 'document':
      return (
        <div className="space-y-3">
          <div className="space-y-1"><Label>Document name *</Label><Input placeholder="e.g. Outside Lab Results" {...f('name')} /></div>
          <div className="space-y-1">
            <Label>Type</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              value={form['document_type'] ?? ''}
              onChange={e => onChange('document_type', e.target.value)}
            >
              <option value="">—</option>
              <option>Lab</option>
              <option>Imaging</option>
              <option>Referral</option>
              <option>Discharge summary</option>
              <option>Other</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>File upload</Label>
            {existingFileName && !docFile && (
              <p className="text-xs text-muted-foreground mb-1">Current: {existingFileName}</p>
            )}
            <input
              ref={fileRef}
              type="file"
              className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-muted file:text-foreground hover:file:bg-accent cursor-pointer"
              onChange={e => onDocFile(e.target.files?.[0] ?? null)}
            />
            {docFile && (
              <p className="text-xs text-muted-foreground mt-0.5">{docFile.name} ({(docFile.size / 1024).toFixed(0)} KB)</p>
            )}
          </div>
          <div className="space-y-1"><Label>Notes</Label><Textarea rows={2} {...f('notes')} /></div>
        </div>
      )
  }
}

function defaultForm(section: UiSection): Record<string, string> {
  switch (section) {
    case 'hosp':      return { reason: '', date: '', date_precision: '', date_out: '', date_out_precision: '', notes: '' }
    case 'family_hx': return { relation: '', condition: '', notes: '' }
    case 'social_hx': return { smoking: '', alcohol: '', occupation: '', notes: '' }
    case 'document':  return { name: '', document_type: '', notes: '' }
  }
}
