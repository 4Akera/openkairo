import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, Loader2, Search, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import type { BlockDefinition, Department, DepartmentMember, DepartmentBlockType } from '../../types'
import { Button, Input, Badge, ScrollArea, Label } from '../../components/ui'
import { cn } from '../../lib/utils'
import { deptColorClasses, deptIconComponent } from '../../lib/deptIcons'
import { deptSummary } from '../../lib/queues'
import { BLOCK_REGISTRY } from '../../components/timeline/BlockRegistry'

// ============================================================
// DepartmentsSection — ONE list; a department composes capabilities
// (clinic queue / order fulfilment / direct entries). Kind presets on
// create; raw capability toggles live behind the Advanced disclosure.
// ============================================================

/** Staff row from `profiles` (used in department member picker). */
type DeptMemberProfile = { id: string; full_name: string; role: string }

function DepartmentMembersPicker({
  deptId,
  deptMembers,
  allUsers,
  onToggle,
}: {
  deptId: string
  deptMembers: string[]
  allUsers: DeptMemberProfile[]
  onToggle: (deptId: string, userId: string) => void
}) {
  const [q, setQ] = useState('')

  const displayedUsers = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = allUsers
    if (needle) {
      list = allUsers.filter(u => {
        const name = (u.full_name ?? '').toLowerCase()
        const role = (u.role ?? '').toLowerCase()
        return name.includes(needle) || role.includes(needle) || u.id.toLowerCase().includes(needle)
      })
    } else {
      list = [...allUsers].sort((a, b) => {
        const aIn = deptMembers.includes(a.id) ? 0 : 1
        const bIn = deptMembers.includes(b.id) ? 0 : 1
        if (aIn !== bIn) return aIn - bIn
        return (a.full_name || '').localeCompare(b.full_name || '', undefined, { sensitivity: 'base' })
      })
    }
    return list
  }, [allUsers, deptMembers, q])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Search by name, profile role, or user ID…"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="h-8 pl-8 pr-14 text-xs"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums">
          {displayedUsers.length}/{allUsers.length}
        </span>
      </div>
      <ScrollArea className="h-36 rounded-md border bg-background/50">
        <div className="flex flex-wrap gap-1.5 p-2">
          {displayedUsers.map(u => {
            const isMember = deptMembers.includes(u.id)
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => onToggle(deptId, u.id)}
                className={cn(
                  'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors max-w-full',
                  isMember ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-background border-border text-muted-foreground hover:border-primary/30',
                )}
                title={u.id}
              >
                {isMember && <Check className="h-2.5 w-2.5 shrink-0" />}
                <span className="truncate">{u.full_name?.trim() || u.id.slice(0, 8)}</span>
                {u.role && u.role !== 'user' && (
                  <span className="text-[9px] opacity-70 truncate max-w-[5rem]">({u.role})</span>
                )}
              </button>
            )
          })}
          {allUsers.length === 0 && (
            <span className="text-xs text-muted-foreground italic px-1 py-2">No users found</span>
          )}
          {allUsers.length > 0 && displayedUsers.length === 0 && (
            <span className="text-xs text-muted-foreground italic px-1 py-2">No matches for “{q.trim()}”.</span>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

const DEPT_COLORS = ['slate','blue','indigo','violet','purple','pink','rose','red','orange','amber','yellow','lime','green','emerald','teal','cyan']
const DEPT_ICON_OPTIONS = [
  { value: 'building-2', label: 'Building' },
  { value: 'test-tube', label: 'Lab' },
  { value: 'camera', label: 'Radiology' },
  { value: 'pill', label: 'Pharmacy' },
  { value: 'heart-pulse', label: 'Cardiology' },
  { value: 'brain', label: 'Neurology' },
  { value: 'stethoscope', label: 'Clinic' },
  { value: 'activity', label: 'ICU' },
  { value: 'users', label: 'Nursing' },
  { value: 'flask-conical', label: 'Microbiology' },
]

/** What the one-motion create makes; everything else is an Advanced edit. */
type DeptKind = 'clinic' | 'orders'

export function DepartmentsSection() {
  const { user } = useAuthStore()
  const [departments, setDepartments] = useState<Department[]>([])
  const [allUsers, setAllUsers]       = useState<DeptMemberProfile[]>([])
  const [members, setMembers]         = useState<Record<string, string[]>>({})
  const [blockTypes, setBlockTypes]   = useState<Record<string, DepartmentBlockType[]>>({}) // deptId → block types
  const [blockDefs, setBlockDefs]     = useState<BlockDefinition[]>([])
  const [loading, setLoading]         = useState(true)
  const [expanded, setExpanded]       = useState<Record<string, boolean>>({})

  // one-motion create
  const [newName, setNewName]   = useState('')
  const [newKind, setNewKind]   = useState<DeptKind>('clinic')
  const [creating, setCreating] = useState(false)

  // edit form (pencil) — Simple fields + Advanced disclosure
  const [editingDept, setEditingDept]   = useState<Department | null>(null)
  const [savingDept, setSavingDept]     = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [form, setForm] = useState({
    name: '', slug: '', description: '',
    icon: 'building-2', color: 'slate',
    can_receive_orders: true, can_create_direct: true, can_receive_patients: false, active: true,
  })

  // per-department block type inline editor
  const [editingBT, setEditingBT] = useState<{ deptId: string; bt: DepartmentBlockType | null } | null>(null)
  const [btForm, setBtForm]       = useState({ name: '', description: '', order_block_def_id: '', entry_block_def_id: '', built_in_type: '', active: true })
  const [savingBT, setSavingBT]   = useState(false)
  const [consultBusy, setConsultBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: depts }, { data: mems }, { data: users }, { data: defs }, { data: bts }] = await Promise.all([
      supabase.from('departments').select('*').order('sort_order').order('name'),
      supabase.from('department_members').select('*'),
      supabase.from('profiles').select('id,full_name,role'),
      supabase.from('block_definitions').select('id,name,slug').eq('active', true).order('name'),
      supabase.from('department_block_types').select('*').order('sort_order').order('name'),
    ])
    if (depts) setDepartments(depts as Department[])
    if (mems) {
      const map: Record<string, string[]> = {}
      ;(mems as DepartmentMember[]).forEach(m => {
        if (!map[m.department_id]) map[m.department_id] = []
        map[m.department_id].push(m.user_id)
      })
      setMembers(map)
    }
    if (users) setAllUsers(users as DeptMemberProfile[])
    if (defs) setBlockDefs(defs as unknown as BlockDefinition[])
    if (bts) {
      const map: Record<string, DepartmentBlockType[]> = {}
      ;(bts as DepartmentBlockType[]).forEach(bt => {
        if (!map[bt.department_id]) map[bt.department_id] = []
        map[bt.department_id].push(bt)
      })
      setBlockTypes(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Department CRUD ──────────────────────────────────────────

  const createDept = async () => {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    const preset = newKind === 'clinic'
      ? { can_receive_orders: false, can_create_direct: false, can_receive_patients: true,
          icon: 'stethoscope', color: DEPT_COLORS[(departments.length + 1) % DEPT_COLORS.length] }
      : { can_receive_orders: true, can_create_direct: true, can_receive_patients: false,
          icon: 'building-2', color: 'slate' }
    const { data } = await supabase.from('departments').insert({
      name,
      slug: name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || `dept_${departments.length + 1}`,
      ...preset,
      active: true,
      created_by: user?.id,
    }).select('id').single()
    setCreating(false)
    setNewName('')
    if (data && newKind === 'orders') setExpanded(x => ({ ...x, [data.id]: true }))
    load()
  }

  const openEditDept = (dept: Department) => {
    setEditingDept(dept)
    setShowAdvanced(false)
    setForm({ name:dept.name, slug:dept.slug, description:dept.description??'', icon:dept.icon, color:dept.color, can_receive_orders:dept.can_receive_orders, can_create_direct:dept.can_create_direct, can_receive_patients:dept.can_receive_patients ?? false, active:dept.active })
  }

  const saveDept = async () => {
    if (!editingDept || !form.name.trim() || !form.slug.trim()) return
    setSavingDept(true)
    await supabase.from('departments').update({
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase().replace(/[^a-z0-9_]/g,'_'),
      description: form.description.trim() || null,
      icon: form.icon, color: form.color,
      can_receive_orders: form.can_receive_orders,
      can_create_direct: form.can_create_direct,
      can_receive_patients: form.can_receive_patients,
      active: form.active,
    }).eq('id', editingDept.id)
    setSavingDept(false)
    setEditingDept(null)
    load()
  }

  const deleteDept = async (id: string) => {
    if (!confirm('Delete this department? Its services and member assignments are removed; past visits and records keep their data.')) return
    await supabase.from('departments').delete().eq('id', id)
    load()
  }

  /**
   * One tap wires a specialty for consults: a "Consult — <Dept>" request
   * block (dynamic def, one question field), a Consultation service whose
   * answer is the built-in Consultation block, and can_receive_orders on.
   * Off deactivates both and drops can_receive_orders when consults were
   * the only service.
   */
  const toggleConsults = async (dept: Department) => {
    setConsultBusy(dept.id)
    try {
      const deptBTs = blockTypes[dept.id] ?? []
      const consultBT = deptBTs.find(bt => bt.built_in_type === 'consultation')
      if (consultBT?.active) {
        await supabase.from('department_block_types').update({ active: false }).eq('id', consultBT.id)
        if (consultBT.order_block_def_id) {
          await supabase.from('block_definitions').update({ active: false }).eq('id', consultBT.order_block_def_id)
        }
        const others = deptBTs.filter(bt => bt.id !== consultBT.id && bt.active)
        if (others.length === 0 && dept.can_receive_orders) {
          await supabase.from('departments').update({ can_receive_orders: false }).eq('id', dept.id)
        }
      } else {
        const slug = `consult_${dept.slug}`
        // Revive-first: RLS only exposes universal/builtin defs, so a prior
        // half-created row is invisible until this update flips it universal.
        await supabase.from('block_definitions')
          .update({ active: true, is_universal: true })
          .eq('slug', slug)
        const { data: existing } = await supabase.from('block_definitions').select('id').eq('slug', slug).maybeSingle()
        let defId = (existing as { id: string } | null)?.id ?? null
        if (!defId) {
          const { data: def } = await supabase.from('block_definitions').insert({
            name: `Consult — ${dept.name}`,
            slug,
            icon: 'stethoscope',
            color: dept.color,
            description: `Ask ${dept.name} for an opinion — answered in this encounter.`,
            fields: [{ id: 'question', label: 'Question for the specialist', type: 'textarea', required: true, rows: 3, placeholder: 'What should they assess?' }],
            is_universal: true,
            active: true,
            created_by: user?.id,
          }).select('id').single()
          defId = (def as { id: string } | null)?.id ?? null
        }
        if (defId) {
          if (consultBT) {
            await supabase.from('department_block_types').update({ active: true, order_block_def_id: defId }).eq('id', consultBT.id)
          } else {
            await supabase.from('department_block_types').insert({
              department_id: dept.id,
              name: 'Consultation',
              description: 'Specialist opinion — answered in the encounter',
              order_block_def_id: defId,
              built_in_type: 'consultation',
              active: true,
            })
          }
          if (!dept.can_receive_orders) {
            await supabase.from('departments').update({ can_receive_orders: true }).eq('id', dept.id)
          }
        }
      }
    } finally {
      setConsultBusy(null)
      load()
    }
  }

  const toggleMember = async (deptId: string, userId: string) => {
    const cur = members[deptId] ?? []
    if (cur.includes(userId)) {
      await supabase.from('department_members').delete().eq('department_id', deptId).eq('user_id', userId)
    } else {
      await supabase.from('department_members').insert({ department_id: deptId, user_id: userId })
    }
    load()
  }

  // ── Block Type CRUD ──────────────────────────────────────────

  const openNewBT = (deptId: string) => {
    setEditingBT({ deptId, bt: null })
    setBtForm({ name:'', description:'', order_block_def_id:'', entry_block_def_id:'', built_in_type:'', active:true })
  }

  const openEditBT = (bt: DepartmentBlockType) => {
    setEditingBT({ deptId: bt.department_id, bt })
    setBtForm({ name:bt.name, description:bt.description??'', order_block_def_id:bt.order_block_def_id??'', entry_block_def_id:bt.entry_block_def_id??'', built_in_type:bt.built_in_type??'', active:bt.active })
  }

  const cancelBT = () => setEditingBT(null)

  const saveBT = async () => {
    if (!editingBT || !btForm.name.trim()) return
    setSavingBT(true)
    const payload = {
      department_id:      editingBT.deptId,
      name:               btForm.name.trim(),
      description:        btForm.description.trim() || null,
      order_block_def_id: btForm.order_block_def_id || null,
      entry_block_def_id: btForm.built_in_type ? null : (btForm.entry_block_def_id || null),
      built_in_type:      btForm.built_in_type || null,
      service_item_id:    null,
      active:             btForm.active,
    }
    if (editingBT.bt) {
      await supabase.from('department_block_types').update(payload).eq('id', editingBT.bt.id)
    } else {
      await supabase.from('department_block_types').insert(payload)
    }
    setSavingBT(false)
    setEditingBT(null)
    load()
  }

  const deleteBT = async (id: string) => {
    if (!confirm('Delete this block type?')) return
    await supabase.from('department_block_types').delete().eq('id', id)
    load()
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-sm font-semibold">Departments</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          One unit for everything: a clinic is a queue on Today; an order department fulfils
          services (lab, radiology, pharmacy…); a hybrid does both.
        </p>
      </div>

      {/* One-motion create — name + kind, presets do the rest */}
      <div className="flex gap-2 flex-wrap">
        <Input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void createDept() }}
          placeholder="New department name — e.g. Cardiology"
          className="h-8 text-sm max-w-xs"
        />
        <select
          className="h-8 px-2 text-xs rounded-md border border-border bg-background"
          value={newKind}
          onChange={e => setNewKind(e.target.value as DeptKind)}
        >
          <option value="clinic">Clinic — patient queue on Today</option>
          <option value="orders">Order department — lab, radiology…</option>
        </select>
        <Button size="sm" onClick={createDept} disabled={creating || !newName.trim()}>
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </Button>
      </div>

      {/* Edit form — Simple fields; capabilities live behind Advanced */}
      {editingDept && (
        <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
          <h3 className="text-sm font-medium">Edit: {editingDept.name}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <select className="w-full h-9 px-3 text-sm rounded-md border border-border bg-background" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}>
                {DEPT_ICON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <select className="w-full h-9 px-3 text-sm rounded-md border border-border bg-background" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}>
                {DEPT_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Advanced — capabilities &amp; routing
          </button>

          {showAdvanced && (
            <div className="space-y-3 border-t pt-3">
              <div className="space-y-1.5 max-w-xs">
                <Label>Slug <span className="text-muted-foreground text-[10px]">(order routing key)</span></Label>
                <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'') }))} className="font-mono text-xs" />
              </div>
              <div className="flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.can_receive_patients} onChange={e => setForm(f => ({ ...f, can_receive_patients: e.target.checked }))} className="accent-primary" />
                  Sees patients — own queue on Today
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.can_receive_orders} onChange={e => setForm(f => ({ ...f, can_receive_orders: e.target.checked }))} className="accent-primary" />
                  Fulfils orders — work view, services orderable from encounters
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.can_create_direct} onChange={e => setForm(f => ({ ...f, can_create_direct: e.target.checked }))} className="accent-primary" />
                  Direct entries — walk-ins without an order
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="accent-primary" />
                  Active
                </label>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={() => setEditingDept(null)}>Cancel</Button>
            <Button size="sm" onClick={saveDept} disabled={savingDept || !form.name.trim() || !form.slug.trim()}>
              {savingDept && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </div>
      )}

      {departments.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No departments yet — add your first above.</p>
      )}

      {/* ONE list — every flavor; rows self-describe via deptSummary */}
      <div className="space-y-2">
        {departments.map(dept => {
          const deptMembers = members[dept.id] ?? []
          const deptBTs     = blockTypes[dept.id] ?? []
          const activeBTs   = deptBTs.filter(bt => bt.active)
          const consultOn   = activeBTs.some(bt => bt.built_in_type === 'consultation')
          const isBTEditing = editingBT?.deptId === dept.id
          const isExpanded  = !!expanded[dept.id]
          const hasWork     = dept.can_receive_orders || dept.can_create_direct
          const Icon        = deptIconComponent(dept.icon)

          return (
            <div key={dept.id} className="border rounded-lg overflow-hidden">
              {/* Header row: chip · name · derived summary · expand/edit/delete */}
              <div className="flex items-center gap-1 pr-2">
                <button
                  type="button"
                  onClick={() => setExpanded(x => ({ ...x, [dept.id]: !x[dept.id] }))}
                  className="flex-1 flex items-center gap-2.5 p-3 text-left min-w-0 hover:bg-muted/20 transition-colors"
                >
                  <span className={cn('h-7 w-7 rounded-md flex items-center justify-center shrink-0', deptColorClasses(dept.color))}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium">{dept.name}</span>
                      {!dept.active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {deptSummary(dept, activeBTs.length, activeBTs.filter(bt => bt.built_in_type === 'consultation').length)}
                      {dept.description ? ` — ${dept.description}` : ''}
                    </span>
                  </span>
                  {isExpanded
                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                </button>
                <Button variant="ghost" size="icon-sm" onClick={() => openEditDept(dept)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => deleteDept(dept.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>

              {isExpanded && (
                <div className="border-t">
                  {/* Consults — one tap wires the request block + service + capability */}
                  {dept.can_receive_patients && (
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">Receives consults</p>
                        <p className="text-[10px] text-muted-foreground">
                          Doctors can ask this specialty for an opinion from any encounter; the
                          answer comes back into the same record.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleConsults(dept)}
                        disabled={consultBusy === dept.id}
                        className={cn(
                          'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors shrink-0',
                          consultOn
                            ? 'bg-primary/10 border-primary/30 text-primary'
                            : 'bg-background border-border text-muted-foreground hover:border-primary/30',
                        )}
                      >
                        {consultBusy === dept.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : consultOn && <Check className="h-3 w-3" />}
                        {consultOn ? 'On' : 'Off'}
                      </button>
                    </div>
                  )}

                  {/* Services / Block Types — only where order machinery exists */}
                  {hasWork && (
                    <div className={cn('p-4 space-y-2', dept.can_receive_patients && 'border-t')}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                          Services / Block Types ({deptBTs.length})
                        </p>
                        {!isBTEditing && (
                          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => openNewBT(dept.id)}>
                            <Plus className="h-3 w-3" /> Add Service
                          </Button>
                        )}
                      </div>

                      {/* Inline add/edit form for block types */}
                      {isBTEditing && (
                        <div className="border rounded-md p-3 space-y-3 bg-muted/20">
                          <p className="text-xs font-medium">{editingBT.bt ? 'Edit Service' : 'New Service'}</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="col-span-2 space-y-1">
                              <Label className="text-xs">Service Name *</Label>
                              <Input value={btForm.name} onChange={e => setBtForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. CBC, Chest X-Ray, Paracetamol" className="h-8 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Order block <span className="text-muted-foreground">(doctor places)</span></Label>
                              <select className="w-full h-8 px-2 text-xs rounded-md border border-border bg-background" value={btForm.order_block_def_id} onChange={e => setBtForm(f => ({ ...f, order_block_def_id: e.target.value }))}>
                                <option value="">— None —</option>
                                {blockDefs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Result block <span className="text-muted-foreground">(dept fills in)</span></Label>
                              <select
                                className="w-full h-8 px-2 text-xs rounded-md border border-border bg-background"
                                value={btForm.built_in_type ? `__builtin__${btForm.built_in_type}` : btForm.entry_block_def_id}
                                onChange={e => {
                                  const val = e.target.value
                                  if (val.startsWith('__builtin__')) {
                                    setBtForm(f => ({ ...f, built_in_type: val.replace('__builtin__', ''), entry_block_def_id: '' }))
                                  } else {
                                    setBtForm(f => ({ ...f, built_in_type: '', entry_block_def_id: val }))
                                  }
                                }}
                              >
                                <option value="">— None —</option>
                                <optgroup label="Built-in">
                                  {Object.keys(BLOCK_REGISTRY).map(slug => (
                                    <option key={slug} value={`__builtin__${slug}`}>
                                      {slug.charAt(0).toUpperCase() + slug.slice(1)}
                                    </option>
                                  ))}
                                </optgroup>
                                <optgroup label="Custom forms">
                                  {blockDefs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </optgroup>
                              </select>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <input type="checkbox" checked={btForm.active} onChange={e => setBtForm(f => ({ ...f, active: e.target.checked }))} className="accent-primary" />
                              Active
                            </label>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={cancelBT}>Cancel</Button>
                              <Button size="sm" className="h-7 text-xs" onClick={saveBT} disabled={savingBT || !btForm.name.trim()}>
                                {savingBT && <Loader2 className="h-3 w-3 animate-spin" />}
                                {editingBT.bt ? 'Save' : 'Add'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {deptBTs.length === 0 && !isBTEditing ? (
                        <p className="text-xs text-muted-foreground italic">No services defined yet. Add one to enable ordering and walk-in entries.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {deptBTs.map(bt => {
                            const orderDef = blockDefs.find(d => d.id === bt.order_block_def_id)
                            const entryDef = blockDefs.find(d => d.id === bt.entry_block_def_id)
                            return (
                              <div key={bt.id} className="flex items-center gap-3 text-xs py-1.5 px-2 rounded-md border bg-background">
                                <div className="flex-1 min-w-0">
                                  <span className={cn('font-medium', !bt.active && 'line-through text-muted-foreground')}>{bt.name}</span>
                                  <div className="flex gap-3 mt-0.5 text-muted-foreground flex-wrap">
                                    <span>Order: <span className="text-foreground">{orderDef?.name ?? '—'}</span></span>
                                    <span>Result: <span className="text-foreground">
                                      {bt.built_in_type
                                        ? `${bt.built_in_type.charAt(0).toUpperCase() + bt.built_in_type.slice(1)} ★`
                                        : (entryDef?.name ?? '—')}
                                    </span></span>
                                  </div>
                                </div>
                                <div className="flex gap-0.5 shrink-0">
                                  <Button variant="ghost" size="icon-sm" className="h-6 w-6" onClick={() => openEditBT(bt)}><Pencil className="h-3 w-3" /></Button>
                                  <Button variant="ghost" size="icon-sm" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => deleteBT(bt.id)}><Trash2 className="h-3 w-3" /></Button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Members — every flavor has staff; clinics need theirs for consult routing */}
                  <div className={cn('p-4', (hasWork || dept.can_receive_patients) && 'border-t')}>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                      Members ({deptMembers.length})
                    </p>
                    <p className="text-[10px] text-muted-foreground mb-2">
                      Search to find staff quickly. Checked = in this department.
                    </p>
                    <DepartmentMembersPicker
                      deptId={dept.id}
                      deptMembers={deptMembers}
                      allUsers={allUsers}
                      onToggle={toggleMember}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
