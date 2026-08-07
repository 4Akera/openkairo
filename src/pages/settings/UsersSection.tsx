import { useState, useEffect, useMemo } from 'react'
import { Plus, Pencil, Trash2, Loader2, Search, Check, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import * as adminApi from '../../lib/adminUsers'
import { useAuthStore } from '../../stores/authStore'
import type { Role, UserWithRoles } from '../../types'
import {
  Button, Input,
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../components/ui'
import { cn } from '../../lib/utils'

// ============================================================
// User Management
// ============================================================

function UserModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: UserWithRoles
  onClose: () => void
  onSaved: (u: UserWithRoles) => void
}) {
  const [email, setEmail] = useState(initial?.email ?? '')
  const [fullName, setFullName] = useState(initial?.full_name ?? '')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!email.trim()) { setError('Email is required'); return }
    if (!initial && !password.trim()) { setError('Password is required for new users'); return }
    setSaving(true); setError(null)

    if (initial) {
      // Update display name via admin RPC (profiles_update RLS blocks cross-user updates)
      const profileRes = await adminApi.updateProfile(initial.id, fullName.trim())
      if (profileRes.error) { setError(profileRes.error); setSaving(false); return }
      if (password.trim()) {
        const res = await adminApi.resetPassword(initial.id, password)
        if (res.error) { setError(res.error); setSaving(false); return }
      }
      onSaved({ ...initial, full_name: fullName.trim() })
    } else {
      const res = await adminApi.createUser(email.trim(), password, fullName.trim())
      if (res.error) { setError(res.error); setSaving(false); return }
      onSaved({
        id: res.data!.id, email: email.trim(), full_name: fullName.trim(),
        created_at: new Date().toISOString(), role_ids: [], role_slugs: [], role_names: [],
      })
    }
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            {initial ? 'Edit User' : 'Add User'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <label className="text-xs text-muted-foreground">Full Name</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Dr. Jane Smith" className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Email {initial && '(read-only)'}</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="mt-1" readOnly={!!initial} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              {initial ? 'New Password (leave blank to keep current)' : 'Password *'}
            </label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={initial ? '••••••••' : 'Min 6 characters'} className="mt-1" />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : initial ? 'Save' : 'Create User'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RolePills({
  targetUser,
  allRoles,
  currentUserId: _currentUserId,
  onUpdated,
}: {
  targetUser: UserWithRoles
  allRoles: Role[]
  currentUserId: string
  onUpdated: (u: UserWithRoles) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)

  const toggle = async (role: Role) => {
    setBusy(role.id)
    const hasRole = targetUser.role_ids.includes(role.id)
    const res = hasRole
      ? await adminApi.removeRole(targetUser.id, role.id)
      : await adminApi.assignRole(targetUser.id, role.id)

    if (!res.error) {
      const newIds   = hasRole ? targetUser.role_ids.filter((id) => id !== role.id) : [...targetUser.role_ids, role.id]
      const newSlugs = hasRole ? targetUser.role_slugs.filter((s) => s !== role.slug) : [...targetUser.role_slugs, role.slug]
      const newNames = hasRole ? targetUser.role_names.filter((_, i) => targetUser.role_ids[i] !== role.id) : [...targetUser.role_names, role.name]
      onUpdated({ ...targetUser, role_ids: newIds, role_slugs: newSlugs, role_names: newNames })
    } else {
      alert(res.error)
    }
    setBusy(null)
  }

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {allRoles.map((role) => {
        const active = targetUser.role_ids.includes(role.id)
        return (
          <button
            key={role.id}
            disabled={!!busy}
            onClick={() => toggle(role)}
            className={cn(
              'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors',
              active ? 'bg-primary/10 border-primary/40 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/40',
              busy === role.id && 'opacity-50',
            )}
          >
            {busy === role.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : active ? <Check className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5" />}
            {role.name}
          </button>
        )
      })}
    </div>
  )
}

export function UsersSection() {
  const { user: currentUser } = useAuthStore()
  const [users, setUsers] = useState<UserWithRoles[]>([])
  const [allRoles, setAllRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<UserWithRoles | 'new' | undefined>()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [userSearch, setUserSearch] = useState('')

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => {
      const name = (u.full_name ?? '').toLowerCase()
      const email = (u.email ?? '').toLowerCase()
      const roles = [
        ...(u.role_names ?? []),
        ...(u.role_slugs ?? []),
      ].join(' ').toLowerCase()
      const id = u.id.toLowerCase()
      return name.includes(q) || email.includes(q) || roles.includes(q) || id.includes(q)
    })
  }, [users, userSearch])

  useEffect(() => {
    Promise.all([
      supabase.rpc('get_users_with_roles'),
      supabase.from('roles').select('*').order('sort_order'),
    ]).then(([{ data: uData }, { data: rData }]) => {
      if (uData) setUsers(uData as UserWithRoles[])
      if (rData) setAllRoles(rData as Role[])
      setLoading(false)
    })
  }, [])

  const upsertUser = (u: UserWithRoles) =>
    setUsers((prev) => prev.find((x) => x.id === u.id) ? prev.map((x) => x.id === u.id ? u : x) : [...prev, u])

  const handleDelete = async (u: UserWithRoles) => {
    if (!confirm(`Delete user "${u.email}"? This cannot be undone.`)) return
    setDeleting(u.id)
    const res = await adminApi.deleteUser(u.id)
    if (res.error) { alert(res.error) } else { setUsers((prev) => prev.filter((x) => x.id !== u.id)) }
    setDeleting(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Users</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Create accounts and assign roles. Click a role pill to toggle.</p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="w-3.5 h-3.5" /> Add User
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search by name, email, role, or ID…"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              className="h-8 pl-8 text-sm"
              autoComplete="off"
              spellCheck={false}
            />
            {userSearch.trim() && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums">
                {filteredUsers.length}/{users.length}
              </span>
            )}
          </div>
          {userSearch.trim() && filteredUsers.length === 0 && users.length > 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center border rounded-lg border-dashed">
              No users match “{userSearch.trim()}”.
            </p>
          ) : null}
          {filteredUsers.map((u) => {
            const initials = u.full_name?.trim()
              ? u.full_name.trim().split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
              : u.email[0].toUpperCase()
            const isSelf = u.id === currentUser?.id
            return (
              <div key={u.id} className="flex items-start gap-3 p-3 rounded-lg border">
                <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-xs font-bold text-primary relative">
                  {initials}
                  {isSelf && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 bg-emerald-400 border-2 border-background rounded-full" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium">{u.full_name || '(no name)'}</p>
                    {isSelf && <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">you</span>}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{u.email}</p>
                  <RolePills targetUser={u} allRoles={allRoles} currentUserId={currentUser?.id ?? ''} onUpdated={upsertUser} />
                </div>
                <div className="flex gap-0.5 shrink-0 mt-0.5">
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(u)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button
                    variant="ghost" size="icon-sm"
                    onClick={() => handleDelete(u)}
                    disabled={isSelf || deleting === u.id}
                    className="hover:text-red-500 disabled:opacity-30"
                  >
                    {deleting === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing !== undefined && (
        <UserModal
          initial={editing !== 'new' ? editing : undefined}
          onClose={() => setEditing(undefined)}
          onSaved={(u) => { upsertUser(u); setEditing(undefined) }}
        />
      )}
    </div>
  )
}
