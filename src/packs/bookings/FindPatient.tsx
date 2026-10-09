// Who to book (the Book button on Booked today and the Diary): one search by name, phone or record number, ↑↓ ↵ picks; then the card
// the screen gives for that patient. Registering a new patient is the desk's own card (Reception), not this one's.
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { usePatientSearch } from '@core/hooks/reads'
import type { PatientHit } from '@core/db/types'
import { Input, Kbd, cn } from '@core/ui'
import { LABEL } from './words'

export function FindPatient({ children, onClose }: { children: (p: PatientHit) => ReactNode; onClose: () => void }) {
  const [q, setQ] = useState(''); const [d, setD] = useState(''); const [c, setC] = useState(0); const [who, setWho] = useState<PatientHit | null>(null)
  useEffect(() => { const t = setTimeout(() => setD(q), 120); return () => clearTimeout(t) }, [q])
  const hits = usePatientSearch(null, d); const list = d.trim().length >= 2 ? hits.data ?? [] : []
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setC(Math.max(0, Math.min(list.length - 1, c + (e.key === 'ArrowDown' ? 1 : -1)))) }
    else if (e.key === 'Enter' && list[c]) { e.preventDefault(); setWho(list[c]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }
  return <div className="grid gap-3">
    <div className="flex items-center gap-2"><p className={LABEL}>Book · who</p><span className="text-12 text-faint">name, phone or record number</span>
      <button type="button" onClick={onClose} aria-label="Close" className="ms-auto inline-flex items-center gap-1 rounded-md px-1 text-faint hover:text-fg focus-ring"><Kbd>esc</Kbd><X className="size-3.5" /></button></div>
    {who ? <p className="flex flex-wrap items-baseline gap-2 rounded-lg bg-accent-soft px-3 py-2 text-14"><span className="font-mono text-12 text-faint">#{who.record_number}</span>
        <span className="font-medium text-fg">{who.given_name} {who.family_name}</span><span className="text-12 text-muted">{who.age} {who.sex?.[0]?.toUpperCase()}{who.phone_text ? ` · ${who.phone_text}` : ''}</span>
        <button type="button" onClick={() => setWho(null)} className="ms-auto rounded-sm text-12 text-accent hover:underline focus-ring">change</button></p>
      : <><Input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setC(0) }} onKeyDown={onKey} aria-label="Find the patient — ↑↓ choose · ↵ pick" className="h-11 text-16" />
        <ul role="listbox" aria-label="Patients found" className="grid">{list.map((p, i) => <li key={p.id} role="option" aria-selected={i === c}>
          <button type="button" onClick={() => setWho(p)} className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2 text-start focus-ring', i === c ? 'rail bg-hover' : 'hover:bg-hover')}>
            <span className="font-mono text-12 text-faint">{p.record_number}</span><span className="text-14 font-medium text-fg">{p.given_name} {p.family_name}</span>
            <span className="text-12 text-muted">{p.age} {p.sex?.[0]?.toUpperCase()}{p.phone_text ? ` · ${p.phone_text}` : ''}</span>{i === c && <Kbd className="ms-auto text-accent">↵</Kbd>}</button></li>)}
          {d.trim().length >= 2 && hits.isSuccess && !list.length && <li className="px-3 py-2 text-13 text-faint">Nobody found — register them at the desk first.</li>}</ul></>}
    {who && children(who)}
  </div>
}
