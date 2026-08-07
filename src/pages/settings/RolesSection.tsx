import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, Loader2, Check, Shield, AlertTriangle, Info } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import * as adminApi from '../../lib/adminUsers'
import type { Role, Permission } from '../../types'
import { PERMISSIONS, PERMISSION_LABELS } from '../../types'
import {
  Button, Input, Separator,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  ScrollArea,
} from '../../components/ui'
import { cn } from '../../lib/utils'

// ============================================================
// Role Management
// ============================================================

const PERM_CATEGORIES = [...new Set(PERMISSIONS.map((p) => PERMISSION_LABELS[p].category))]


function RoleModal({
  initial,
  allRoles,
  roleParentsMap,
  onClose,
  onSaved,
}: {
  initial?: Role
  allRoles: Role[]
  roleParentsMap: Record<string, string>  // child_slug → parent_slug
  onClose: () => void
  onSaved: (role: Role) => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [selected, setSelected] = useState<Set<Permission>>(
    new Set((initial?.permissions ?? []) as Permission[]),
  )
  const [parentSlug, setParentSlug] = useState<string>(
    initial ? (roleParentsMap[initial.slug] ?? '') : '',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const autoSlug = (n: string) =>
    n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  // Permissions from the selected parent role (must stay on the child row; not removable in UI)
  const parentRole = useMemo(() => allRoles.find((r) => r.slug === parentSlug), [allRoles, parentSlug])
  const inheritedPerms = useMemo(
    () => new Set((parentRole?.permissions ?? []) as Permission[]),
    [parentRole],
  )

  // Always merge parent permissions into selection when a parent is chosen
  useEffect(() => {
    if (!parentSlug) return
    const parent = allRoles.find((r) => r.slug === parentSlug)
    if (!parent) return
    const inherited = parent.permissions as Permission[]
    setSelected((prev) => new Set([...inherited, ...prev]))
  }, [parentSlug, allRoles])

  const toggle = (p: Permission) => {
    if (parentSlug && inheritedPerms.has(p)) return
    setSelected((prev) => {
      const s = new Set(prev)
      if (s.has(p)) s.delete(p)
      else s.add(p)
      return s
    })
  }

  const handleParentChange = (slug: string) => {
    setParentSlug(slug)
    if (slug) {
      const parent = allRoles.find((r) => r.slug === slug)
      if (parent) {
        setSelected((prev) => new Set([...(parent.permissions as Permission[]), ...prev]))
      }
    }
  }

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    if (!slug.trim()) { setError('Slug is required'); return }
    setSaving(true); setError(null)
    const parentPerms = (parentRole?.permissions ?? []) as Permission[]
    const mergedPerms = [...new Set([...parentPerms, ...selected])] as Permission[]
    const payload = { name: name.trim(), slug: slug.trim(), description: description.trim(), permissions: mergedPerms }
    const result = initial
      ? await adminApi.updateRole(initial.id, payload)
      : await adminApi.createRole(payload)
    if (result.error) { setSaving(false); setError(result.error); return }

    const savedRole = result.data!
    const childSlug = savedRole.slug

    // Sync role_parents: remove old entry then insert new one if a parent is chosen
    await supabase.from('role_parents').delete().eq('child_slug', childSlug)
    if (parentSlug) {
      await supabase.from('role_parents').insert({ child_slug: childSlug, parent_slug: parentSlug })
    }

    setSaving(false)
    onSaved(savedRole)
  }

  // Roles available as parents (all roles except the role being edited)
  const parentOptions = allRoles.filter((r) => !initial || r.slug !== initial.slug)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl h-[88vh] !flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            {initial ? 'Edit Role' : 'New Role'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Name *</label>
                <Input
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (!initial) setSlug(autoSlug(e.target.value)) }}
                  placeholder="e.g. Senior Physician"
                  className="mt-1"
                  disabled={initial?.is_system}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Slug * (unique, no spaces)</label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="senior_physician"
                  className="mt-1 font-mono text-sm"
                  disabled={initial?.is_system}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Description</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What can this role do?" className="mt-1" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Inherits from (optional)</label>
              <select
                value={parentSlug}
                onChange={(e) => handleParentChange(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— None —</option>
                {parentOptions.map((r) => (
                  <option key={r.id} value={r.slug}>{r.name}</option>
                ))}
              </select>
              {parentRole && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Role slug hierarchy uses <span className="font-medium">{parentRole.name}</span> for visibility checks.
                  All of that role&apos;s permissions are required on this role and <span className="font-medium">cannot be turned off</span> below; you may add extra permissions.
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Permissions</p>
              {PERM_CATEGORIES.map((cat) => (
                <div key={cat}>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">{cat}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PERMISSIONS.filter((p) => PERMISSION_LABELS[p].category === cat).map((perm) => {
                      const isInherited = inheritedPerms.has(perm)
                      const locked = !!parentSlug && isInherited
                      const checked = locked || selected.has(perm)
                      return (
                        <label
                          key={perm}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors',
                            locked ? 'cursor-default opacity-90' : 'cursor-pointer',
                            checked
                              ? 'border-primary/50 bg-primary/5 text-foreground'
                              : 'border-border text-muted-foreground hover:border-primary/30',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={locked}
                            onChange={() => toggle(perm)}
                            className="w-3.5 h-3.5 shrink-0 disabled:cursor-not-allowed"
                          />
                          <span className="flex-1">{PERMISSION_LABELS[perm].label}</span>
                          {locked && (
                            <span className="text-[8px] px-1 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-600 shrink-0">from parent</span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">{error}</p>}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-3 border-t mt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Role'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function RolesSection() {
  const [roles, setRoles] = useState<Role[]>([])
  const [roleParentsMap, setRoleParentsMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Role | 'new' | undefined>()

  const loadRoles = useCallback(async () => {
    const [rolesRes, parentsRes] = await Promise.all([
      supabase.from('roles').select('*').order('sort_order'),
      supabase.from('role_parents').select('child_slug, parent_slug'),
    ])
    if (rolesRes.data) setRoles(rolesRes.data as Role[])
    if (parentsRes.data) {
      const map: Record<string, string> = {}
      for (const row of parentsRes.data) map[row.child_slug] = row.parent_slug
      setRoleParentsMap(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadRoles() }, [loadRoles])

  const handleSaved = (role: Role) => {
    setRoles((prev) => prev.find((r) => r.id === role.id) ? prev.map((r) => r.id === role.id ? role : r) : [...prev, role])
    // Re-fetch role_parents to pick up any changes made during save
    loadRoles()
  }

  const handleDelete = async (role: Role) => {
    const sysWarn = role.is_system
      ? '\n\nThis is a system role. If it is still used for visibility, privacy, or templates, deleting it can break access until you reconfigure those settings.'
      : ''
    if (!confirm(`Delete role "${role.name}"?${sysWarn}`)) return
    const res = await adminApi.deleteRole(role.id)
    if (res.error) { alert(res.error); return }
    setRoles((prev) => prev.filter((r) => r.id !== role.id))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Roles</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define what each role can do. System roles can be deleted.
          </p>
          <div className="mt-2 flex gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2">
            <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-snug">
              <span className="font-medium text-foreground">How roles fit together.</span>{' '}
              Permissions control what actions someone can take (billing, templates, adding blocks, and so on).
              Role <span className="font-mono text-[10px]">slug</span> values are separate: they drive who can see restricted encounters,
              block privacy, shared templates, and department routing. A user's effective access is the combination of both—permissions
              plus slug-based visibility—so the two layers together form the full privacy model.
            </p>
          </div>
          <div className="mt-2 flex gap-2 rounded-md border border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/25 px-2.5 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" />
            <p className="text-[11px] text-amber-900/90 dark:text-amber-200/90 leading-snug">
              <span className="font-medium">Warning:</span> Removing roles that are already in use can break access and behaviour.
              The app relies on role slugs internally for encounter visibility, block privacy, templates, and department routing—deleting
              or renaming a role users still depend on may leave people unable to see encounters or shared content until you fix assignments
              and configuration.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setEditing('new')} className="shrink-0 self-start">
          <Plus className="w-3.5 h-3.5" /> New Role
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {roles.map((role) => (
            <div key={role.id} className="flex items-start gap-3 p-3 rounded-lg border">
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{role.name}</p>
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{role.slug}</span>
                  {role.is_system && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">system</span>}
                  {roleParentsMap[role.slug] && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-600">
                      inherits {roles.find((r) => r.slug === roleParentsMap[role.slug])?.name ?? roleParentsMap[role.slug]}
                    </span>
                  )}
                </div>
                {role.description && <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {role.permissions.map((p) => (
                    <span key={p} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/5 border border-primary/10 text-primary/80">{p}</span>
                  ))}
                </div>
              </div>
              <div className="flex gap-0.5 shrink-0">
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing(role)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(role)} className="hover:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== undefined && (
        <RoleModal
          initial={editing !== 'new' ? editing : undefined}
          allRoles={roles}
          roleParentsMap={roleParentsMap}
          onClose={() => setEditing(undefined)}
          onSaved={(role) => { handleSaved(role); setEditing(undefined) }}
        />
      )}
    </div>
  )
}
