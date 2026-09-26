import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { usePatientSearch } from '../hooks/reads'
import { useDepartment } from '../hooks/organization'
import type { PatientHit } from '../db/types'
import { Input, Spinner, cn, movedMouse } from '../ui'
import { PatientLine } from '../renderers/PatientLine'
import { NewPatient } from './NewPatient'
import { readRecent, rememberPatient, type Recent } from '../hooks/recent'

/** ⌘K: one input for a patient by name, phone or record number; the last row makes a new patient (spec 05).
 *  Only the keys move the selection (↑↓, typing puts it back on the first); the mouse shades the row under it once it
 *  really moves, and a click opens that row. Results appearing under a still pointer never take the selection. */
export function Search({ onClose }: { onClose: () => void }) {
  const orgId = null
  const { can } = useDepartment()
  const [q, setQ] = useState(''); const [d, setD] = useState(''); const [cursor, setCursor] = useState(0); const [creating, setCreating] = useState(false)
  const [kbd, setKbd] = useState(true)                    // the keys are in use: no hover until the mouse really moves
  const navigate = useNavigate()
  useEffect(() => { const t = setTimeout(() => setD(q), 120); return () => clearTimeout(t) }, [q])
  const searching = d.trim().length >= 2
  const search = usePatientSearch(orgId, d)
  const hits: Recent[] = searching ? search.data ?? [] : readRecent()
  const canCreate = can('manage:patients')
  const rows = hits.length + (canCreate ? 1 : 0)            // the last row is "New patient"
  const c = Math.min(cursor, Math.max(0, rows - 1))
  const open = (p: Recent) => { rememberPatient(p); navigate(`/patient/${p.id}`); onClose() }
  const pick = (i: number) => { if (i < hits.length) open(hits[i]); else if (canCreate) setCreating(true) }
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setKbd(true); setCursor(Math.min(c + 1, rows - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setKbd(true); setCursor(Math.max(c - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(c) }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/30 p-4 pt-[10vh]" onMouseDown={onClose}>
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        {creating ? <div className="p-3"><NewPatient seed={q} orgId={orgId ?? ''} submitLabel="Register & open" onDone={(p) => open(p)} onCancel={() => setCreating(false)} /></div> : <>
          <div className="relative border-b border-neutral-100 p-2">
            <Input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setCursor(0); setKbd(true) }} onKeyDown={key} placeholder="Name, phone or record number…" className="h-11 border-0 text-base focus:ring-0" />
            {searching && search.isFetching && <span className="absolute right-4 top-1/2 -translate-y-1/2"><Spinner label="" /></span>}
          </div>
          <p className="px-4 pt-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{searching ? (hits.length ? `${hits.length} found` : search.isFetching ? 'Searching' : 'No patient found') : hits.length ? 'Recent' : 'Type at least two letters or digits'}</p>
          <ul className="max-h-[50vh] overflow-y-auto py-1" onMouseMove={(e) => kbd && movedMouse(e) && setKbd(false)}>
            {hits.map((p, i) => { const h = p as PatientHit; return <li key={p.id} onMouseDown={() => pick(i)} className={cn('cursor-pointer px-4 py-2 text-sm', i === c ? 'bg-teal-50 shadow-[inset_3px_0_0_var(--color-teal-700)]' : !kbd && 'hover:bg-neutral-50')}>
              <PatientLine p={p} />
              {h.open_visits?.length > 0 && <span className="mt-0.5 block text-xs text-teal-800">{h.open_visits.map((v) => `${v.department_name} · ${v.status.replace('_', ' ')}${v.present ? '' : ' · away'}`).join(' — ')}</span>}
            </li> })}
            {canCreate && <li onMouseDown={() => pick(hits.length)} className={cn('flex cursor-pointer items-center gap-2 border-t border-neutral-100 px-4 py-2.5 text-sm text-teal-800', c === hits.length ? 'bg-teal-50 shadow-[inset_3px_0_0_var(--color-teal-700)]' : !kbd && 'hover:bg-neutral-50')}>
              <UserPlus className="h-4 w-4" />New patient{q.trim() && <span className="text-neutral-500">“{q.trim()}”</span>}<kbd className="ml-auto text-[10px] text-neutral-400">↵</kbd></li>}
          </ul>
          <p className="border-t border-neutral-100 px-4 py-1.5 text-[10px] text-neutral-400">↑↓ move · ↵ open · esc close</p>
        </>}
      </div>
    </div>
  )
}
