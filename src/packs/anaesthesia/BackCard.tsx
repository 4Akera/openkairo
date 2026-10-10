// Recovery's leaving card under the composer's line (spec/openCare.md §5.8, Q48; Recovery's picture): back to a ward or home;
// the ward preset to the one the patient came from (the stay Recovery's came from, beds Q3), with the patient's bed there when it is free, the ward's other
// free beds, or "the ward chooses"; the latest Aldrete in this bay, under 9 a notice, never a stop; what the ward will see. Sign writes it
// (backsave.ts). Kit parts only; inline, never an overlay.
import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { read } from '@core/db/rpc'
import type { PresenceRow, TableRead } from '@core/db/types'
import { useDepartment } from '@core/hooks/organization'
import type { CardEditorProps } from '@core/screens/visit/commands'
import { Chip, FormRow, Tag } from '@core/ui'
import { aldreteNotice, freeBeds, wardsFor, type BackParams } from './back'
import type { RecRow } from './model'

const presence = async (dept: string, where: Record<string, unknown>) =>
  (await read<TableRead<PresenceRow>>({ shape: 'table', table: 'base.presence', department_id: dept, where, entries: false })).rows

export function BackCard({ q, set, ctx }: CardEditorProps) {
  const p = q as Partial<BackParams>; const { org } = useDepartment(); const here = ctx.departmentId; const patient = ctx.record?.patient?.id
  // the bay's stay and the stay it came from (where the patient was before Recovery)
  const stay = useQuery({ queryKey: ['anaesthesia.back', here, patient], enabled: !!patient, staleTime: 15_000, queryFn: async () => {
    const s = (await presence(here, { patient_id: patient, department_id: here, kind: 'stay', state: 'admitted' }))[0] ?? null
    const came = s?.came_from ? (await presence(here, { item: s.came_from }))[0] ?? null : null
    return { stay: s, came } } })
  const came = stay.data?.came ?? null
  useEffect(() => { if (stay.data && p.came === undefined) {
    const d = came && org?.allDepartments.find((x) => x.id === came.department_id && x.id !== here)
    set({ came: came ? { department_id: came.department_id, place_id: came.place_id } : null,
      ...(p.to !== 'home' && !p.department_id && d ? { department_id: d.id, department: d.name, place_id: undefined } : {}) }) } }, [stay.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const wards = useMemo(() => wardsFor(org?.allDepartments ?? [], here), [org, here])
  // the chosen ward's beds held now, for its free beds
  const held = useQuery({ queryKey: ['anaesthesia.back.beds', here, p.department_id], enabled: !!p.department_id, staleTime: 15_000,
    queryFn: () => presence(here, { department_id: p.department_id, kind: 'stay', state: 'admitted' }) })
  const free = p.department_id && org ? freeBeds(org.places, p.department_id, held.data ?? []) : []
  const hers = came && came.department_id === p.department_id ? free.find((b) => b.id === came.place_id) : undefined
  // the patient's bed preset once the ward's beds are read, while still free and nothing else chosen
  useEffect(() => { if (hers && p.place_id === undefined) set({ place_id: hers.id, place: hers.name }) }, [hers?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const recovery = useQuery({ queryKey: ['anaesthesia.recovery', here, patient], enabled: !!patient, staleTime: 15_000,
    queryFn: async () => (await read<TableRead<RecRow>>({ shape: 'table', table: 'anaesthesia.recovery', department_id: here, where: { patient_id: patient }, entries: false })).rows })
  const since = stay.data?.stay?.checked_in_at
  const aldrete = (recovery.data ?? []).filter((r) => r.kind === 'aldrete' && (!since || r.at >= since)).sort((a, b) => a.at.localeCompare(b.at)).pop()?.value
  const notice = recovery.data ? aldreteNotice(aldrete) : null
  const cameName = came ? org?.allDepartments.find((d) => d.id === came.department_id)?.name : null
  const toWard = (id: string) => { const d = wards.find((x) => x.id === id); if (d) set({ to: 'ward', department_id: d.id, department: d.name, place_id: undefined, place: undefined }) }
  return <div className="grid gap-3 p-3">
    <FormRow label="To" inline><div className="flex flex-wrap gap-1.5">
      {wards.map((d) => <Chip key={d.id} on={p.to !== 'home' && p.department_id === d.id} onClick={() => toWard(d.id)}>{d.name}{came?.department_id === d.id ? ' · came from there' : ''}</Chip>)}
      <Chip on={p.to === 'home'} onClick={() => set({ to: 'home', department_id: undefined, department: undefined, place_id: undefined, place: undefined })}>Home (a day case)</Chip></div></FormRow>
    {p.to !== 'home' && p.department_id && <FormRow label="Bed" inline><div className="flex flex-wrap gap-1.5">
      {free.map((b) => <Chip key={b.id} on={p.place_id === b.id} onClick={() => set({ place_id: b.id, place: b.name })}>{b.name}{b.id === came?.place_id ? ' · the patient’s' : ''}</Chip>)}
      <Chip on={!p.place_id} onClick={() => set({ place_id: null, place: undefined })}>the ward chooses</Chip>
      {held.isLoading && <span className="text-12 text-faint">reading the ward's beds…</span>}</div></FormRow>}
    <p className="flex flex-wrap items-center gap-2 text-13 text-muted">
      {came ? <span>Came from {cameName ?? 'a ward'}{came.place_id ? ` · ${org?.places.find((b) => b.id === came.place_id)?.name ?? 'a bed'}` : ''}</span>
        : stay.data?.stay ? <span>Admitted to Recovery directly: choose the ward</span>
        : stay.data ? <Tag tone="warn">For a patient in a bay here: Sign will say so</Tag> : null}
      {notice && <Tag tone="warn">{notice}</Tag>}</p>
    <p className="rounded-lg bg-info-soft px-3 py-2 text-13 text-fg ring-1 ring-inset ring-info-line">{p.to === 'home'
      ? 'At Sign the Recovery stay ends: home from here.'
      : 'At Sign the Recovery stay ends (the bay frees) and the ward’s stay goes on from it in one Done: the ward sees the patient on its board, the record the same.'}</p>
  </div>
}
