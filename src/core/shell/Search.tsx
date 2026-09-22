import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePatientSearch } from '../hooks/reads'
import { useChoice } from '../hooks/organization'
import { Input } from '../ui'
import { PatientLine } from '../renderers/PatientLine'

/** ⌘K: one input for a patient by name, phone or record number (spec 05). */
export function Search({ onClose }: { onClose: () => void }) {
  const orgId = useChoice((s) => s.organizationId)
  const [q, setQ] = useState(''); const [d, setD] = useState(''); const [cursor, setCursor] = useState(0)
  const navigate = useNavigate(); const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { const t = setTimeout(() => setD(q), 120); return () => clearTimeout(t) }, [q])
  const { data = [] } = usePatientSearch(orgId, d)
  const c = Math.min(cursor, Math.max(0, data.length - 1))
  const pick = (i: number) => { const p = data[i]; if (p) { navigate(`/patient/${p.id}`); onClose() } }
  return (
    <div className="fixed inset-0 z-50 bg-black/30 p-4 pt-[12vh]" onMouseDown={onClose}>
      <div className="mx-auto w-full max-w-xl rounded-lg border border-neutral-200 bg-white p-2 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <Input ref={ref} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or record number…" className="h-11 text-base"
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((x) => Math.min(x + 1, data.length - 1)) } if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((x) => Math.max(x - 1, 0)) } if (e.key === 'Enter') pick(c) }} />
        {data.length > 0 && <ul className="mt-2 divide-y divide-neutral-100">{data.map((p, i) => <li key={p.id} onMouseEnter={() => setCursor(i)} onMouseDown={() => pick(i)} className={`cursor-pointer px-3 py-2 text-sm ${i === c ? 'bg-teal-50' : ''}`}><PatientLine p={p} /></li>)}</ul>}
      </div>
    </div>
  )
}
