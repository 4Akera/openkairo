import type { PatientBanner } from '../db/types'
const SEX: Record<string, string> = { male: 'M', female: 'F', other: 'X' }
export function PatientLine({ p, className = '' }: { p: Pick<PatientBanner, 'record_number' | 'given_name' | 'family_name' | 'sex' | 'age' | 'died_on'> & { phone_text?: string | null }; className?: string }) {
  return <span className={`flex items-baseline gap-2.5 ${className}`}>
    <span className="font-mono text-[11px] text-neutral-400">#{p.record_number}</span>
    <span className="font-medium text-neutral-900">{p.given_name} {p.family_name}</span>
    <span className="text-xs text-neutral-500">{p.age}{SEX[p.sex] ?? ''}</span>
    {p.phone_text && <span className="text-xs text-neutral-400">{p.phone_text}</span>}
    {p.died_on && <span className="text-[11px] font-semibold text-neutral-700">deceased</span>}
  </span>
}
