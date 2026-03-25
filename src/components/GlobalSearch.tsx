import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fullName, calcAge, getPatientDob, getPatientGender } from '../lib/utils'
import type { Patient } from '../types'
import { pushRecentPatient } from '../pages/DashboardPage'
import { Search, Loader2, Users } from 'lucide-react'

interface GlobalSearchProps {
  open: boolean
  onClose: () => void
}

export default function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const navigate  = useNavigate()
  const inputRef  = useRef<HTMLInputElement>(null)
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<Patient[]>([])
  const [loading, setLoading]   = useState(false)
  const [active, setActive]     = useState(0)
  const requestSeq = useRef(0)

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setLoading(false); return }
    const req = ++requestSeq.current
    setLoading(true)
    const { data } = await supabase
      .from('patients')
      .select('*')
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,mrn.ilike.%${q}%,phone.ilike.%${q}%`)
      .order('created_at', { ascending: false })
      .limit(8)
    if (req !== requestSeq.current) return
    setResults(data ?? [])
    setActive(0)
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => search(query), 200)
    return () => clearTimeout(t)
  }, [query, search])

  const go = (pt: Patient) => {
    pushRecentPatient({ id: pt.id, first_name: pt.first_name, last_name: pt.last_name, mrn: pt.mrn })
    navigate(`/patients/${pt.id}`)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && results[active]) go(results[active])
    if (e.key === 'Escape') onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          {loading
            ? <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
            : <Search className="h-4 w-4 text-muted-foreground shrink-0" />}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search patients by name, MRN, or phone…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:flex text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        {/* Results */}
        {results.length > 0 ? (
          <ul>
            {results.map((pt, i) => {
              const dob = getPatientDob(pt)
              const gen = getPatientGender(pt)
              return (
                <li key={pt.id}>
                  <button
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      i === active ? 'bg-accent' : 'hover:bg-accent/50'
                    }`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(pt)}
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                      {pt.first_name[0]}{pt.last_name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{fullName(pt)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {pt.mrn}
                        {calcAge(dob) ? ` · ${calcAge(dob)}` : ''}
                        {gen ? ` · ${gen}` : ''}
                        {pt.phone ? ` · ${pt.phone}` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground hidden sm:block">↵</span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : query.trim() && !loading ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <Users className="h-6 w-6 opacity-40" />
            <p className="text-sm">No patients found</p>
          </div>
        ) : !query.trim() ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            Start typing to search…
          </p>
        ) : null}

        {/* Footer hint */}
        <div className="border-t px-4 py-2 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span><kbd className="border border-border rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="border border-border rounded px-1">↵</kbd> open</span>
          <span><kbd className="border border-border rounded px-1">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
