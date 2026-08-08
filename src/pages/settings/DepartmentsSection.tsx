import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, Loader2, Search, Check, ClipboardList } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import type { BlockDefinition, Department, DepartmentMember, DepartmentBlockType } from '../../types'
import { Button, Input, Badge, ScrollArea, Label } from '../../components/ui'
import { cn } from '../../lib/utils'
import { deptColorClasses } from '../../lib/deptIcons'
import { isQueueDept } from '../../lib/queues'
import { BLOCK_REGISTRY } from '../../components/timeline/BlockRegistry'

// ============================================================
// DepartmentsSection — "Queues" (patient lanes) + "Departments" (order units)
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

export function DepartmentsSection() {
  const { user } = useAuthStore()
  const [departments, setDepartments] = useState<Department[]>([])
  const [allUsers, setAllUsers]       = useState<DeptMemberProfile[]>([])
  const [members, setMembers]         = useState<Record<string, string[]>>({})
  const [blockTypes, setBlockTypes]   = useState<Record<string, DepartmentBlockType[]>>({}) // deptId → block types
  const [blockDefs, setBlockDefs]     = useState<BlockDefinition[]>([])
  const [loading, setLoading]         = useState(true)
  const [editingDept, setEditingDept] = useState<Department | null | 'new'>(null)
  const [savingDept, setSavingDept]   = useState(false)

  const [form, setForm] = useState({
    name: '', slug: '', description: '',
    icon: 'building-2', color: 'slate',
    can_receive_orders: true, can_create_direct: true, can_receive_patients: false, active: true,
  })

  // queues (pure patient lanes) — one-field create + inline rename
  const [newQueueName, setNewQueueName]   = useState('')
  const [creatingQueue, setCreatingQueue] = useState(false)
  const [editingQueue, setEditingQueue]   = useState<Department | null>(null)
  const [queueForm, setQueueForm]         = useState({ name: '', color: 'blue' })

  // per-department block type inline editor
  const [editingBT, setEditingBT] = useState<{ deptId: string; bt: DepartmentBlockType | null } | null>(null)
  const [btForm, setBtForm]       = useState({ name: '', description: '', order_block_def_id: '', entry_block_def_id: '', built_in_type: '', active: true })
  const [savingBT, setSavingBT]   = useState(false)

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

  const queues     = departments.filter(isQueueDept)
  const orderDepts = departments.filter(d => !isQueueDept(d))

  // ── Queue CRUD (a queue = a department row with no capabilities) ──

  const createQueue = async () => {
    const name = newQueueName.trim()
    if (!name) return
    setCreatingQueue(true)
    await supabase.from('departments').insert({
      name,
      slug: name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || `queue_${queues.length + 1}`,
      icon: 'stethoscope',
      color: DEPT_COLORS[(queues.length + 1) % DEPT_COLORS.length],
      can_receive_orders: false, can_create_direct: false, can_receive_patients: true,
      active: true,
      created_by: user?.id,
    })
    setCreatingQueue(false)
    setNewQueueName('')
    load()
  }

  const saveQueue = async () => {
    if (!editingQueue || !queueForm.name.trim()) return
    await supabase.from('departments')
      .update({ name: queueForm.name.trim(), color: queueForm.color })
      .eq('id', editingQueue.id)
    setEditingQueue(null)
    load()
  }

  const deleteQueue = async (id: string) => {
    if (!confirm('Delete this queue? Past visits keep their records.')) return
    await supabase.from('departments').delete().eq('id', id)
    load()
  }

  // ── Department CRUD ──────────────────────────────────────────

  const openNewDept = () => {
    setEditingDept('new')
    setForm({ name:'', slug:'', description:'', icon:'building-2', color:'slate', can_receive_orders:true, can_create_direct:true, can_receive_patients:false, active:true })
  }

  const openEditDept = (dept: Department) => {
    setEditingDept(dept)
    setForm({ name:dept.name, slug:dept.slug, description:dept.description??'', icon:dept.icon, color:dept.color, can_receive_orders:dept.can_receive_orders, can_create_direct:dept.can_create_direct, can_receive_patients:dept.can_receive_patients ?? false, active:dept.active })
  }

  const cancelDept = () => setEditingDept(null)

  const saveDept = async () => {
    if (!form.name.trim() || !form.slug.trim()) return
    setSavingDept(true)
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase().replace(/[^a-z0-9_]/g,'_'),
      description: form.description.trim() || null,
      icon: form.icon, color: form.color,
      can_receive_orders: form.can_receive_orders,
      can_create_direct: form.can_create_direct,
      can_receive_patients: form.can_receive_patients,
      active: form.active,
      created_by: user?.id,
    }
    if (editingDept && editingDept !== 'new') {
      await supabase.from('departments').update(payload).eq('id', editingDept.id)
    } else {
      await supabase.from('departments').insert(payload)
    }
    setSavingDept(false)
    setEditingDept(null)
    load()
  }

  const deleteDept = async (id: string) => {
    if (!confirm('Delete this department? All block types and member assignments will be removed.')) return
    await supabase.from('departments').delete().eq('id', id)
    load()
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

  const isNewDeptOpen = editingDept !== null

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="max-w-3xl space-y-10">
      {/* ── Queues — patient lanes on Today; a name is all a clinic needs ── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Queues</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Patient lanes on Today&apos;s Front Desk. A clinic is just a queue — a name is all it needs.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={newQueueName}
            onChange={e => setNewQueueName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void createQueue() }}
            placeholder="New queue name — e.g. Cardiology"
            className="h-8 text-sm max-w-xs"
          />
          <Button size="sm" onClick={createQueue} disabled={creatingQueue || !newQueueName.trim()}>
            {creatingQueue ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add queue
          </Button>
        </div>
        {queues.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No queues yet — add one above; it appears in Today&apos;s queue switcher.</p>
        ) : (
          <div className="space-y-1.5">
            {queues.map(q => editingQueue?.id === q.id ? (
              <div key={q.id} className="flex items-center gap-2 border rounded-md px-2 py-1.5 bg-muted/20">
                <Input
                  value={queueForm.name}
                  onChange={e => setQueueForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') void saveQueue() }}
                  className="h-7 text-xs max-w-[12rem]"
                  autoFocus
                />
                <select
                  className="h-7 px-2 text-xs rounded-md border border-border bg-background"
                  value={queueForm.color}
                  onChange={e => setQueueForm(f => ({ ...f, color: e.target.value }))}
                >
                  {DEPT_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="ml-auto flex gap-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingQueue(null)}>Cancel</Button>
                  <Button size="sm" className="h-7 text-xs" onClick={saveQueue} disabled={!queueForm.name.trim()}>Save</Button>
                </div>
              </div>
            ) : (
              <div key={q.id} className="flex items-center gap-2.5 border rounded-md px-3 py-1.5">
                <span className={cn('h-6 w-6 rounded-md flex items-center justify-center shrink-0', deptColorClasses(q.color))}>
                  <ClipboardList className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-medium">{q.name}</span>
                {!q.active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                <div className="ml-auto flex gap-0.5">
                  <Button variant="ghost" size="icon-sm" onClick={() => { setEditingQueue(q); setQueueForm({ name: q.name, color: q.color }) }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => deleteQueue(q.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Departments — order-fulfilling units only ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Departments</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Units that fulfil orders (lab, radiology, pharmacy…): services, result blocks, and staff.
          </p>
        </div>
        <Button size="sm" onClick={openNewDept}><Plus className="h-3.5 w-3.5" /> New Department</Button>
      </div>

      {/* New/Edit department form */}
      {isNewDeptOpen && (
        <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
          <h3 className="text-sm font-medium">{editingDept === 'new' ? 'New Department' : `Edit: ${(editingDept as Department).name}`}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: f.slug || e.target.value.toLowerCase().replace(/\s+/g,'_') }))} placeholder="Haematology Lab" />
            </div>
            <div className="space-y-1.5">
              <Label>Slug * <span className="text-muted-foreground text-[10px]">(routing key)</span></Label>
              <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'') }))} placeholder="haem_lab" className="font-mono text-xs" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
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
          <div className="flex items-center gap-6 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.can_receive_patients} onChange={e => setForm(f => ({ ...f, can_receive_patients: e.target.checked }))} className="accent-primary" />
              Also sees patients — own queue on Today
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="accent-primary" />
              Active
            </label>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={cancelDept}>Cancel</Button>
            <Button size="sm" onClick={saveDept} disabled={savingDept || !form.name.trim() || !form.slug.trim()}>
              {savingDept && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editingDept === 'new' ? 'Create Department' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}

      {orderDepts.length === 0 && !isNewDeptOpen && (
        <p className="text-sm text-muted-foreground text-center py-8">No departments yet. Create one to get started.</p>
      )}

      <div className="space-y-4">
        {orderDepts.map(dept => {
          const deptMembers = members[dept.id] ?? []
          const deptBTs     = blockTypes[dept.id] ?? []
          const isBTEditing = editingBT?.deptId === dept.id

          return (
            <div key={dept.id} className="border rounded-lg overflow-hidden">
              {/* Department header */}
              <div className="flex items-start justify-between gap-2 p-4 bg-muted/10">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{dept.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{dept.slug}</span>
                    {!dept.active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                  </div>
                  {dept.description && <p className="text-xs text-muted-foreground mt-0.5">{dept.description}</p>}
                  {dept.can_receive_patients && (
                    <div className="mt-1 text-[10px] text-muted-foreground">● Also has a patient queue on Today</div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon-sm" onClick={() => openEditDept(dept)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => deleteDept(dept.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>

              {/* Block Types */}
              <div className="p-4 border-t space-y-2">
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

              {/* Members — searchable + scrollable for large orgs */}
              <div className="p-4 border-t">
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
          )
        })}
      </div>
    </div>
  )
}
