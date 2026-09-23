import { useState } from 'react'
import { usePatientSearch } from '../hooks/reads'
import { useRegister } from '../hooks/writes'
import type { PatientHit } from '../db/types'
import { Button, Input, Field, Select } from '../ui'
import { PatientLine } from '../renderers/PatientLine'

/** New patient: four fields and a phone (spec 03), with a live duplicate warning. Used by reception and ⌘K. */
export function NewPatient({ seed, orgId, onDone, onCancel, submitLabel = 'Register' }: { seed: string; orgId: string; onDone: (p: PatientHit) => void; onCancel: () => void; submitLabel?: string }) {
  const parts = /\d/.test(seed) ? [] : seed.trim().split(/\s+/); const [given, setGiven] = useState(parts[0] ?? ''); const [family, setFamily] = useState(parts.slice(1).join(' '))
  const [sex, setSex] = useState('female'); const [born, setBorn] = useState(''); const [age, setAge] = useState(''); const [phone, setPhone] = useState(/^[\d\s+()-]{6,}$/.test(seed.trim()) ? seed.trim() : '')
  const reg = useRegister(orgId)
  const dup = usePatientSearch(orgId, family.length >= 2 ? family : '')
  const bornOn = born || (age ? String(new Date().getFullYear() - Number(age)) : '')
  return <form onSubmit={(e) => { e.preventDefault(); reg.mutate({ given_name: given, family_name: family, sex, born_on: bornOn, phone_text: phone || null }, { onSuccess: (p) => onDone(p as PatientHit) }) }} className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4">
    <h2 className="text-sm font-semibold">New patient</h2>
    <div className="grid grid-cols-2 gap-3"><Field label="Given name"><Input value={given} onChange={(e) => setGiven(e.target.value)} autoFocus required /></Field><Field label="Family name"><Input value={family} onChange={(e) => setFamily(e.target.value)} required /></Field></div>
    <div className="grid grid-cols-3 gap-3"><Field label="Sex"><Select value={sex} onChange={(e) => setSex(e.target.value)}><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select></Field>
      <Field label="Born on"><Input type="date" value={born} onChange={(e) => setBorn(e.target.value)} /></Field><Field label="…or age"><Input type="number" min={0} max={130} value={age} onChange={(e) => setAge(e.target.value)} disabled={!!born} /></Field></div>
    <Field label="Phone (optional)"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
    {(dup.data ?? []).length > 0 && <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm"><p className="mb-1 font-medium text-amber-900">Possible existing patient</p>{dup.data!.slice(0, 3).map((p) => <div key={p.id} className="flex items-center justify-between py-0.5"><PatientLine p={p} /><Button type="button" size="sm" variant="outline" onClick={() => onDone(p)}>Use this</Button></div>)}</div>}
    {reg.error && <p className="text-sm text-red-700">{reg.error.message}</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={reg.isPending || !bornOn}>{submitLabel}</Button></div>
  </form>
}
