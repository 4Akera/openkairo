import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Loader2, FileText, Zap } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import type { BlockDefinition, UserBlockTemplate } from '../../types'
import {
  Button, Input,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Label,
} from '../../components/ui'
import { cn, getDefinitionColors } from '../../lib/utils'
import { DynamicBlockEdit } from '../../components/timeline/DynamicBlock'
import { BLOCK_REGISTRY, registryRenderKey } from '../../components/timeline/BlockRegistry'
import type { Block } from '../../types'

// ============================================================
// Block Templates Section
// ============================================================

function makeSyntheticBlock(def: BlockDefinition, content: Record<string, unknown>): Block {
  return {
    id: 'template-preview',
    encounter_id: null,
    department_id: null,
    department_block_type_id: null,
    patient_id: null,
    type: def.slug,
    content,
    state: 'active',
    sequence_order: 0,
    supersedes_block_id: null,
    locked_by: null,
    locked_at: null,
    author_name: null,
    definition_id: def.id,
    is_template_seed: true,
    is_pinned: false,
    visible_to_roles: [],
    share_to_record: false,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export function BlockTemplatesSection() {
  const { user, roleSlugs, preferredBlocks } = useAuthStore()
  const [defs, setDefs]               = useState<BlockDefinition[]>([])
  const [templates, setTemplates]     = useState<UserBlockTemplate[]>([])
  const [loading, setLoading]         = useState(true)
  const [selectedDef, setSelectedDef] = useState<BlockDefinition | null>(null)
  const [modalOpen, setModalOpen]     = useState(false)
  const [editing, setEditing]         = useState<UserBlockTemplate | null>(null)
  const [tplName, setTplName]         = useState('')
  const [tplContent, setTplContent]   = useState<Record<string, unknown>>({})
  const [tplDefault, setTplDefault]   = useState(false)
  const [saving, setSaving]           = useState(false)

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase
        .from('block_definitions')
        .select('*')
        .eq('active', true)
        .eq('is_dept_only', false)
        .order('sort_order'),
      supabase
        .from('user_block_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order'),
    ]).then(([defsRes, tplRes]) => {
      const allDefs = (defsRes.data ?? []) as BlockDefinition[]
      const filtered = allDefs.filter((d) => {
        if (d.is_dept_only) return false
        if (d.visible_to_roles.length > 0 && !d.visible_to_roles.some((r) => roleSlugs.includes(r))) return false
        if (preferredBlocks.length > 0 && !preferredBlocks.includes(d.id)) return false
        return true
      })
      setDefs(filtered)
      setTemplates((tplRes.data ?? []) as UserBlockTemplate[])
      setLoading(false)
    })
  }, [user, roleSlugs, preferredBlocks])

  const openNew = (def: BlockDefinition) => {
    setSelectedDef(def)
    setEditing(null)
    setTplName('')
    setTplDefault(false)
    const registry = BLOCK_REGISTRY[registryRenderKey(def)]
    if (registry) {
      setTplContent(registry.emptyContent())
    } else {
      const init: Record<string, unknown> = {}
      def.fields.forEach((f) => {
        if (f.type === 'checkbox') init[f.id] = false
        else if (f.type === 'multiselect') init[f.id] = []
        else if (f.type !== 'section_header') init[f.id] = ''
      })
      setTplContent(init)
    }
    setModalOpen(true)
  }

  const openEdit = (tpl: UserBlockTemplate, def: BlockDefinition) => {
    setSelectedDef(def)
    setEditing(tpl)
    setTplName(tpl.name)
    setTplContent(tpl.content)
    setTplDefault(tpl.is_default)
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!user || !selectedDef || !tplName.trim()) return
    setSaving(true)

    // If setting as default, clear any existing default for this def first
    if (tplDefault) {
      await supabase
        .from('user_block_templates')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('definition_id', selectedDef.id)
        .neq('id', editing?.id ?? '00000000-0000-0000-0000-000000000000')
      setTemplates((prev) =>
        prev.map((t) =>
          t.definition_id === selectedDef.id && t.id !== editing?.id
            ? { ...t, is_default: false }
            : t,
        ),
      )
    }

    if (editing) {
      const { data } = await supabase
        .from('user_block_templates')
        .update({ name: tplName.trim(), content: tplContent, is_default: tplDefault })
        .eq('id', editing.id)
        .select().single()
      if (data) setTemplates((prev) => prev.map((t) => t.id === editing.id ? data as UserBlockTemplate : t))
    } else {
      const { data } = await supabase
        .from('user_block_templates')
        .insert({ user_id: user.id, definition_id: selectedDef.id, name: tplName.trim(), content: tplContent, is_default: tplDefault, sort_order: templates.length })
        .select().single()
      if (data) setTemplates((prev) => [...prev, data as UserBlockTemplate])
    }
    setSaving(false)
    setModalOpen(false)
  }

  const handleDelete = async (tpl: UserBlockTemplate) => {
    await supabase.from('user_block_templates').delete().eq('id', tpl.id)
    setTemplates((prev) => prev.filter((t) => t.id !== tpl.id))
  }

  const handleToggleDefault = async (tpl: UserBlockTemplate) => {
    const next = !tpl.is_default
    // Clear existing default for this def if enabling
    if (next) {
      await supabase
        .from('user_block_templates')
        .update({ is_default: false })
        .eq('user_id', user!.id)
        .eq('definition_id', tpl.definition_id)
      setTemplates((prev) =>
        prev.map((t) => t.definition_id === tpl.definition_id ? { ...t, is_default: false } : t),
      )
    }
    await supabase.from('user_block_templates').update({ is_default: next }).eq('id', tpl.id)
    setTemplates((prev) => prev.map((t) => t.id === tpl.id ? { ...t, is_default: next } : t))
  }

  const templatesByDef = templates.reduce<Record<string, UserBlockTemplate[]>>((acc, t) => {
    ;(acc[t.definition_id] ??= []).push(t)
    return acc
  }, {})

  const defsWithTemplates = defs.filter((d) => (templatesByDef[d.id]?.length ?? 0) > 0)
  const defsWithout       = defs.filter((d) => (templatesByDef[d.id]?.length ?? 0) === 0)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">My Defaults</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Saved content that pre-fills a block when you add it to an encounter. Mark a default as <strong>Auto-apply</strong> to skip the picker and add instantly.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : defs.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No block types available.</p>
      ) : (
        <div className="space-y-3">
          {/* Blocks that already have templates */}
          {defsWithTemplates.map((def) => {
            const colors = getDefinitionColors(def.color)
            const tpls   = templatesByDef[def.id] ?? []
            return (
              <div key={def.id} className="border rounded-lg overflow-hidden">
                <div className="flex items-center gap-2.5 px-3 py-2 bg-muted/30 border-b">
                  <div className={cn('h-6 w-6 rounded flex items-center justify-center shrink-0', colors.iconBg)}>
                    <FileText className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-xs font-medium flex-1">{def.name}</span>
                  <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => openNew(def)}>
                    <Plus className="w-3 h-3" /> Add
                  </Button>
                </div>
                <div className="divide-y">
                  {tpls.map((tpl) => (
                    <div key={tpl.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs">{tpl.name}</span>
                        {tpl.is_default && (
                          <span className="ml-1.5 text-[9px] px-1.5 py-px rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                            Auto-apply
                          </span>
                        )}
                      </div>
                      {/* Auto-apply toggle */}
                      <button
                        title={tpl.is_default ? 'Disable auto-apply' : 'Set as auto-apply'}
                        onClick={() => handleToggleDefault(tpl)}
                        className={cn(
                          'p-1 rounded text-xs transition-colors shrink-0',
                          tpl.is_default
                            ? 'text-primary hover:text-primary/70'
                            : 'text-muted-foreground/40 hover:text-muted-foreground',
                        )}
                      >
                        <Zap className={cn('w-3.5 h-3.5', tpl.is_default && 'fill-current')} />
                      </button>
                      <button onClick={() => openEdit(tpl, def)} className="text-muted-foreground hover:text-foreground p-1 rounded">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDelete(tpl)} className="text-muted-foreground hover:text-red-500 p-1 rounded">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Add template to a block that doesn't have any yet */}
          {defsWithout.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Add a default for</p>
              <div className="flex flex-wrap gap-1.5">
                {defsWithout.map((def) => {
                  const colors = getDefinitionColors(def.color)
                  return (
                    <button
                      key={def.id}
                      onClick={() => openNew(def)}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs border rounded-md hover:border-primary/60 hover:bg-primary/5 transition-all"
                    >
                      <div className={cn('h-4 w-4 rounded flex items-center justify-center shrink-0', colors.iconBg)}>
                        <span className="text-white text-[8px] font-bold">{def.name[0]}</span>
                      </div>
                      {def.name}
                      <Plus className="w-3 h-3 text-muted-foreground" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Template editor modal */}
      {modalOpen && selectedDef && (() => {
        const registry = BLOCK_REGISTRY[registryRenderKey(selectedDef)]
        const hasFields = selectedDef.fields.length > 0

        // For registry blocks: the block editor's own Save button drives the flow
        if (registry) {
          const syntheticBlock = makeSyntheticBlock(selectedDef, tplContent)
          const handleRegistrySave = async (content: Record<string, unknown>) => {
            if (!user || !tplName.trim()) return
            setSaving(true)
            // Clear existing default if needed
            if (tplDefault) {
              await supabase
                .from('user_block_templates')
                .update({ is_default: false })
                .eq('user_id', user.id)
                .eq('definition_id', selectedDef.id)
                .neq('id', editing?.id ?? '00000000-0000-0000-0000-000000000000')
              setTemplates((prev) =>
                prev.map((t) =>
                  t.definition_id === selectedDef.id && t.id !== editing?.id
                    ? { ...t, is_default: false } : t,
                ),
              )
            }
            if (editing) {
              const { data } = await supabase
                .from('user_block_templates')
                .update({ name: tplName.trim(), content, is_default: tplDefault })
                .eq('id', editing.id)
                .select().single()
              if (data) setTemplates((prev) => prev.map((t) => t.id === editing.id ? data as UserBlockTemplate : t))
            } else {
              const { data } = await supabase
                .from('user_block_templates')
                .insert({ user_id: user.id, definition_id: selectedDef.id, name: tplName.trim(), content, is_default: tplDefault, sort_order: templates.length })
                .select().single()
              if (data) setTemplates((prev) => [...prev, data as UserBlockTemplate])
            }
            setSaving(false)
            setModalOpen(false)
          }

          return (
            <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) setModalOpen(false) }}>
              <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle className="text-sm">
                    {editing ? 'Edit Template' : 'New Template'} — {selectedDef.name}
                  </DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto space-y-3 py-2">
                  {/* Name + auto-apply row */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Label className="text-xs">Name</Label>
                      <Input
                        className="mt-1"
                        placeholder="e.g. Routine Vitals, Standard SOAP…"
                        value={tplName}
                        onChange={(e) => setTplName(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="shrink-0 pt-5">
                      <button
                        type="button"
                        onClick={() => setTplDefault((v) => !v)}
                        title={tplDefault ? 'Disable auto-apply' : 'Enable auto-apply'}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all',
                          tplDefault
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/30',
                        )}
                      >
                        <Zap className={cn('w-3.5 h-3.5', tplDefault && 'fill-current')} />
                        Auto-apply
                      </button>
                    </div>
                  </div>
                  {!tplName.trim() && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">Enter a name before saving.</p>
                  )}
                  {/* Block's own editor — its Save button finalises the template */}
                  <div className="border rounded-lg overflow-hidden">
                    <div className="px-3 py-1.5 bg-muted/30 border-b">
                      <p className="text-[10px] text-muted-foreground">Fill in the content below, then click <strong>Save</strong> to save it as a default.</p>
                    </div>
                    <div className={cn('p-4', !tplName.trim() && 'pointer-events-none opacity-50')}>
                      <registry.Edit
                        block={syntheticBlock}
                        onSave={handleRegistrySave}
                        onCancel={() => setModalOpen(false)}
                      />
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )
        }

        // DynamicBlock or no-editor fallback
        return (
          <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) setModalOpen(false) }}>
            <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
              <DialogHeader>
                <DialogTitle className="text-sm">
                  {editing ? 'Edit Template' : 'New Template'} — {selectedDef.name}
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto space-y-4 py-2">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input
                    className="mt-1"
                    placeholder="e.g. Routine Follow-up, Post-op Note…"
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                  />
                </div>

                {/* Auto-apply toggle */}
                <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                  <div>
                    <p className="text-xs font-medium">Auto-apply</p>
                    <p className="text-[11px] text-muted-foreground">Skip the picker and add this block instantly.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTplDefault((v) => !v)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                      tplDefault ? 'bg-primary' : 'bg-muted',
                    )}
                  >
                    <span className={cn(
                      'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                      tplDefault ? 'translate-x-4' : 'translate-x-0',
                    )} />
                  </button>
                </div>

                <div>
                  <Label className="text-xs">Pre-filled Content</Label>
                  {hasFields ? (
                    <div className="mt-1 border rounded-lg p-3">
                      <DynamicBlockEdit
                        definition={selectedDef}
                        content={tplContent}
                        onChange={setTplContent}
                      />
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground italic border rounded-lg p-3 bg-muted/20">
                      This block has no configurable fields. The default will act as a quick-add shortcut.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={saving || !tplName.trim()}>
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {saving ? 'Saving…' : 'Save Default'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )
      })()}
    </div>
  )
}
