// Families (spec/openCare.md §5.7, Q49; picture #family-day): the family pack's own screen — find a file by its number, a phone, an
// address or a member's name; open it: its members and what each is due (a name opens the chart); add a member, or start a new file.
import { useEffect, useState } from 'react'
import { usePatientSearch } from '@core/hooks/reads'
import { useDepartment } from '@core/hooks/organization'
import type { ScreenProps } from '@core/screens/registry'
import { Button, Card, Chip, Empty, Input, ScreenFrame, Spinner, errorText } from '@core/ui'
import { RELATIONS, useFileWrites, useFiles, type File } from './data'
import { MemberRow } from './Member'

export function Families({ dept }: ScreenProps) {
  const { can } = useDepartment()
  const [q, setQ] = useState(''); const [d, setD] = useState('')
  useEffect(() => { const t = setTimeout(() => setD(q.trim()), 200); return () => clearTimeout(t) }, [q])
  const byName = usePatientSearch(null, /\d/.test(d) || d.length < 3 ? '' : d)
  const ids = (byName.data ?? []).map((p) => p.id)
  const files = useFiles(/\d/.test(d) || d.length < 3 ? d : '', dept.id, ids)
  const [open, setOpen] = useState<string | null>(null)
  const shown = d && !/\d/.test(d) && d.length >= 3 ? (files.data ?? []).filter((f) => f.members.some((m) => ids.includes(m.patient_id)) || (f.address ?? '').toLowerCase().includes(d.toLowerCase())) : files.data ?? []
  return <ScreenFrame search={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="File number, phone, address or a member's name" aria-label="Find a family file" className="w-full sm:w-80" />}>
    {files.isLoading ? <Spinner label="Reading the files" /> : files.error ? <p className="text-14 text-danger">{errorText(files.error)}</p>
      : !shown.length ? <Card><Empty>{d ? `No file for “${d}”.` : 'No family file yet: the desk starts one with New patient.'}</Empty></Card>
      : <div className="grid gap-2">{shown.map((f) => <FileCard key={f.id} f={f} open={open === f.id} onOpen={() => setOpen(open === f.id ? null : f.id)} dept={dept} canChange={can('manage:patients')} />)}</div>}
  </ScreenFrame>
}

function FileCard({ f, open, onOpen, dept, canChange }: { f: File; open: boolean; onOpen: () => void; dept: ScreenProps['dept']; canChange: boolean }) {
  return <Card className="p-0">
    <button type="button" onClick={onOpen} aria-expanded={open} className="flex w-full flex-wrap items-baseline gap-x-3 px-4 py-2.5 text-start hover:bg-hover focus-ring">
      <span className="font-mono text-12 text-faint">file {f.number}</span><span className="text-14 font-medium text-fg">{f.address ?? 'no address'}</span>
      <span className="text-12 text-muted">{f.phone ?? ''}</span><span className="ms-auto text-12 text-faint">{f.members.length} {f.members.length === 1 ? 'member' : 'members'}</span></button>
    {open && <div className="grid gap-2 border-t border-line px-4 py-2">
      <ul className="divide-y divide-line">{f.members.map((m) => <MemberRow key={m.patient_id} m={m} dept={dept} viewer="head" here={false} />)}</ul>
      {canChange && <AddMember f={f} deptId={dept.id} />}
    </div>}
  </Card>
}

function AddMember({ f, deptId }: { f: File; deptId: string }) {
  const [q, setQ] = useState(''); const hits = usePatientSearch(null, q.trim().length >= 2 ? q : ''); const [rel, setRel] = useState('son'); const w = useFileWrites()
  return <div className="grid gap-1.5 rounded-md bg-sunken p-2">
    <div className="flex flex-wrap items-center gap-1.5"><span className="text-12 text-faint">Add a member</span>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or number" className="h-8 w-56" />
      {RELATIONS.filter((r) => r !== 'head').map((r) => <Chip key={r} on={rel === r} onClick={() => setRel(r)}>{r}</Chip>)}</div>
    {(hits.data ?? []).filter((p) => !f.members.some((m) => m.patient_id === p.id)).slice(0, 5).map((p) => <div key={p.id} className="flex items-center gap-2 text-13">
      <span className="font-mono text-12 text-faint">{p.record_number}</span><span>{p.given_name} {p.family_name}</span><span className="text-12 text-faint">{p.age} {p.sex[0]?.toUpperCase()}</span>
      <Button size="xs" variant="outline" className="ms-auto" loading={w.join.isPending} onClick={() => w.join.mutate({ dept: deptId, household_id: f.id, patient_id: p.id, relation: rel }, { onSuccess: () => setQ('') })}>Join as {rel}</Button></div>)}
    {w.join.error && <p className="text-12 text-danger">{errorText(w.join.error)}</p>}
  </div>
}
