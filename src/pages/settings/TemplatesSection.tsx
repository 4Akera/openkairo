import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, Loader2, X, Check, LayoutTemplate, Pin } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import * as adminApi from '../../lib/adminUsers'
import { useAuthStore } from '../../stores/authStore'
import type { BlockDefinition, Role, EncounterTemplate, TemplateBlock } from '../../types'
import {
  Button, Input, Separator,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  ScrollArea,
} from '../../components/ui'
import { cn, getDefinitionColors } from '../../lib/utils'

// ============================================================
// Templates Section
// ============================================================

interface TemplateFormState {
  name: string
  description: string
  is_universal: boolean
  visible_to_roles: string[]
  blocks: TemplateBlock[]
  default_visibility: 'staff' | 'restricted' | 'private'
  default_visible_to_roles: string[]
}

const EMPTY_TEMPLATE: TemplateFormState = {
  name: '', description: '', is_universal: false,
  visible_to_roles: [], blocks: [],
  default_visibility: 'staff', default_visible_to_roles: [],
}

function TemplateModal({
  initial,
  allRoles,
  allDefs,
  canMakeStandard,
  currentUserId,
  onClose,
  onSaved,
}: {
  initial?: EncounterTemplate
  allRoles: Role[]
  allDefs: BlockDefinition[]
  canMakeStandard: boolean
  currentUserId: string
  onClose: () => void
  onSaved: (t: EncounterTemplate) => void
}) {
  const [form, setForm] = useState<TemplateFormState>(
    initial
      ? {
          name: initial.name,
          description: initial.description ?? '',
          is_universal: initial.is_universal,
          visible_to_roles: initial.visible_to_roles,
          blocks: initial.blocks,
          default_visibility: initial.default_visibility ?? 'staff',
          default_visible_to_roles: initial.default_visible_to_roles ?? [],
        }
      : { ...EMPTY_TEMPLATE },
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only physician roles (and sub-roles) are valid targets for template visibility
  const physicianRoles = useMemo(
    () => allRoles.filter((r) => r.slug === 'physician' || r.slug.endsWith('_physician') || r.slug.startsWith('physician_')),
    [allRoles],
  )

  const setF = (patch: Partial<TemplateFormState>) => setForm((f) => ({ ...f, ...patch }))

  const toggleBlockDef = (def: BlockDefinition) => {
    const exists = form.blocks.find((b) => b.slug === def.slug)
    if (exists) {
      setF({ blocks: form.blocks.filter((b) => b.slug !== def.slug) })
    } else {
      setF({
        blocks: [
          ...form.blocks,
          { slug: def.slug, definition_id: def.id, pin: false, sort_order: (form.blocks.length + 1) * 10 },
        ],
      })
    }
  }

  const togglePin = (slug: string) => {
    setF({ blocks: form.blocks.map((b) => b.slug === slug ? { ...b, pin: !b.pin } : b) })
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    if (form.blocks.length === 0) { setError('Add at least one block to the template'); return }
    setSaving(true)
    setError(null)

    const payload = {
      ...form,
      created_by: currentUserId,
    }

    if (form.is_universal) {
      const res = initial
        ? await adminApi.updateTemplate(initial.id, payload)
        : await adminApi.createTemplate(payload as Parameters<typeof adminApi.createTemplate>[0])
      setSaving(false)
      if (res.error) { setError(res.error); return }
      onSaved(res.data!)
      return
    }

    // Personal template — normal client
    let result
    if (initial) {
      result = await supabase.from('encounter_templates').update(payload).eq('id', initial.id).select().single()
    } else {
      result = await supabase.from('encounter_templates').insert(payload).select().single()
    }
    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    onSaved(result.data as EncounterTemplate)
  }

  const systemDefs = allDefs.filter((d) => d.is_builtin || d.is_universal)
  const customDefs = allDefs.filter((d) => !d.is_builtin && !d.is_universal)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl h-[90vh] !flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4" />
            {initial ? 'Edit Template' : 'New Template'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <div className="space-y-5 py-1">

            {/* Basic Info */}
            <section className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Basic Info
              </p>
              <div>
                <label className="text-xs text-muted-foreground">Template Name *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setF({ name: e.target.value })}
                  placeholder="e.g. ICU Morning Round"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Description</label>
                <Input
                  value={form.description}
                  onChange={(e) => setF({ description: e.target.value })}
                  placeholder="Brief description"
                  className="mt-1"
                />
              </div>
            </section>

            <Separator />

            {/* Standard toggle (admin only) */}
            {canMakeStandard && (
              <>
                <section className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Visibility
                  </p>
                  <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 w-3.5 h-3.5"
                      checked={form.is_universal}
                      onChange={(e) => setF({ is_universal: e.target.checked })}
                    />
                    <div>
                      <p className="text-xs font-medium">Shared Template</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Shared with all physicians across the practice (optionally filtered by role below).
                      </p>
                    </div>
                  </label>

                  {form.is_universal && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-2">
                        Role filter — leave all unchecked to show to everyone:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {physicianRoles.map((role) => {
                          const active = form.visible_to_roles.includes(role.slug)
                          return (
                            <label
                              key={role.id}
                              className={cn(
                                'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors',
                                active ? 'border-primary/50 bg-primary/10 text-primary font-medium' : 'border-border hover:border-primary/30',
                              )}
                            >
                              <input
                                type="checkbox"
                                className="w-3 h-3"
                                checked={active}
                                onChange={(e) => {
                                  const curr = form.visible_to_roles
                                  setF({
                                    visible_to_roles: e.target.checked
                                      ? [...curr, role.slug]
                                      : curr.filter((s) => s !== role.slug),
                                  })
                                }}
                              />
                              {role.name}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </section>
                <Separator />
              </>
            )}

            {/* Default Encounter Privacy */}
            <section className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Default Encounter Privacy
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  When a new encounter is created from this template, it will start with this visibility. Clinicians can still change it during creation.
                </p>
              </div>
              <div className="flex gap-2">
                {(['staff', 'private'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setF({ default_visibility: opt, default_visible_to_roles: [] })}
                    className={cn(
                      'flex-1 text-xs py-1.5 rounded-lg border capitalize transition-colors',
                      // Legacy 'restricted' templates highlight Sensitive
                      (form.default_visibility === opt || (opt === 'private' && form.default_visibility === 'restricted'))
                        ? 'border-primary/60 bg-primary/10 text-primary font-medium'
                        : 'border-border hover:border-primary/30',
                    )}
                  >
                    {opt === 'staff' ? 'Everyone' : 'Sensitive'}
                  </button>
                ))}
              </div>
            </section>

            <Separator />

            {/* Block Selector */}
            <section className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Blocks
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Select blocks to include. Toggle the pin icon to auto-pin a block in the encounter header.
                </p>
              </div>

              {/* Selected blocks */}
              {form.blocks.length > 0 && (
                <div className="space-y-1 mb-3">
                  <p className="text-[10px] text-muted-foreground font-medium">Selected ({form.blocks.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {form.blocks.map((b) => {
                      const def = allDefs.find((d) => d.slug === b.slug)
                      return (
                        <div key={b.slug} className="flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 bg-primary/5 border-primary/30">
                          <span>{def?.name ?? b.slug}</span>
                          <button
                            title={b.pin ? 'Pinned (click to unpin)' : 'Not pinned (click to pin)'}
                            onClick={() => togglePin(b.slug)}
                            className={cn('ml-0.5', b.pin ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-400')}
                          >
                            <Pin className="w-2.5 h-2.5" />
                          </button>
                          <button onClick={() => toggleBlockDef(def ?? ({ slug: b.slug, registry_slug: null } as BlockDefinition))} className="text-muted-foreground hover:text-red-500 ml-0.5">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Available block pickers by section */}
              {[
                { label: 'Block Library', items: systemDefs },
                { label: 'My Custom Blocks', items: customDefs },
              ].filter((s) => s.items.length > 0).map((section) => (
                <div key={section.label}>
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">{section.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {section.items.map((def) => {
                      const selected = !!form.blocks.find((b) => b.slug === def.slug)
                      const colors = getDefinitionColors(def.color)
                      return (
                        <button
                          key={def.id}
                          onClick={() => toggleBlockDef(def)}
                          className={cn(
                            'flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-1.5 transition-colors',
                            selected
                              ? 'border-primary/50 bg-primary/10 text-primary'
                              : 'border-border hover:border-primary/40',
                          )}
                        >
                          <div className={cn('h-4 w-4 rounded-sm flex items-center justify-center shrink-0', colors.iconBg)}>
                            <span className="text-[8px] text-white font-bold">{def.name[0]}</span>
                          </div>
                          {def.name}
                          {selected && <Check className="w-3 h-3 ml-0.5" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </section>
          </div>
        </ScrollArea>

        <div className="shrink-0 pt-4 border-t flex items-center justify-between gap-3">
          {error && <p className="text-xs text-red-500 flex-1">{error}</p>}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {initial ? 'Save Changes' : 'Create Template'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function TemplatesSection() {
  const { user, can } = useAuthStore()
  const [templates, setTemplates] = useState<EncounterTemplate[]>([])
  const [allRoles, setAllRoles] = useState<Role[]>([])
  const [allDefs, setAllDefs] = useState<BlockDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EncounterTemplate | 'new' | undefined>()
  const canMakeStandard = can('admin.manage_templates')

  const load = useCallback(async () => {
    if (!user) return
    const [tmplRes, rolesRes, defsRes] = await Promise.all([
      supabase
        .from('encounter_templates')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('roles').select('*').order('sort_order'),
      supabase.from('block_definitions').select('*').eq('active', true).order('sort_order'),
    ])
    if (tmplRes.data) setTemplates(tmplRes.data as EncounterTemplate[])
    if (rolesRes.data) setAllRoles(rolesRes.data as Role[])
    if (defsRes.data) setAllDefs(defsRes.data as BlockDefinition[])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  const handleSaved = (t: EncounterTemplate) => {
    setTemplates((prev) => {
      const exists = prev.find((x) => x.id === t.id)
      return exists ? prev.map((x) => (x.id === t.id ? t : x)) : [t, ...prev]
    })
    setEditing(undefined)
  }

  const handleDelete = async (t: EncounterTemplate) => {
    if (!confirm(`Delete template "${t.name}"?`)) return
    if (t.is_universal) {
      const res = await adminApi.deleteTemplate(t.id)
      if (res.error) { alert(res.error); return }
    } else {
      await supabase.from('encounter_templates').delete().eq('id', t.id)
    }
    setTemplates((prev) => prev.filter((x) => x.id !== t.id))
  }

  const myTemplates = templates.filter((t) => !t.is_universal)
  const standardTemplates = templates.filter((t) => t.is_universal)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Encounter Templates</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pre-built sets of blocks that auto-populate a new encounter's timeline.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="w-3.5 h-3.5" /> New Template
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : templates.length === 0 ? (
        <div className="border border-dashed rounded-lg py-10 text-center text-muted-foreground space-y-2">
          <LayoutTemplate className="w-8 h-8 mx-auto opacity-40" />
          <p className="text-sm">No templates yet.</p>
          <p className="text-xs">Create a template to speed up encounter creation.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {standardTemplates.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Shared Templates
              </p>
              {standardTemplates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  allRoles={allRoles}
                  allDefs={allDefs}
                  canDelete={canMakeStandard}
                  onEdit={() => setEditing(t)}
                  onDelete={() => handleDelete(t)}
                />
              ))}
            </div>
          )}
          {myTemplates.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                My Templates
              </p>
              {myTemplates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  allRoles={allRoles}
                  allDefs={allDefs}
                  canDelete
                  onEdit={() => setEditing(t)}
                  onDelete={() => handleDelete(t)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {editing !== undefined && (
        <TemplateModal
          initial={editing !== 'new' ? editing : undefined}
          allRoles={allRoles}
          allDefs={allDefs}
          canMakeStandard={canMakeStandard}
          currentUserId={user!.id}
          onClose={() => setEditing(undefined)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

function TemplateCard({
  template,
  allRoles,
  allDefs,
  canDelete,
  onEdit,
  onDelete,
}: {
  template: EncounterTemplate
  allRoles: Role[]
  allDefs: BlockDefinition[]
  canDelete: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border">
      <div className="h-8 w-8 rounded-md bg-indigo-100 flex items-center justify-center shrink-0">
        <LayoutTemplate className="w-4 h-4 text-indigo-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{template.name}</p>
          {template.is_universal && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700">Shared</span>
          )}
        </div>
        {template.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {template.blocks.map((b) => {
            const def = allDefs.find((d) => d.slug === b.slug)
            return (
              <span key={b.slug} className={cn(
                'flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border',
                b.pin ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-muted border-border text-muted-foreground',
              )}>
                {b.pin && <Pin className="w-2 h-2 shrink-0" />}{def?.name ?? b.slug}
              </span>
            )
          })}
        </div>
        {template.is_universal && template.visible_to_roles.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {template.visible_to_roles.map((slug) => (
              <span key={slug} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-50 border text-muted-foreground">
                {allRoles.find((r) => r.slug === slug)?.name ?? slug}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={onEdit} title="Edit">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        {canDelete && (
          <Button variant="ghost" size="icon-sm" onClick={onDelete} className="hover:text-red-500" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
