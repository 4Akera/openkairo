import { useRef, useState } from 'react'
import { usePatientSearch } from '../hooks/reads'
import { useRegister } from '../hooks/writes'
import type { PatientHit } from '../db/types'
import { Button, Callout, Input, Field, Select } from '../ui'
import { PatientLine } from '../renderers/PatientLine'

/** New patient: four fields and a phone (spec 03), with a live duplicate warning. Used by reception and ⌘K.
 *  `onRegisterOnly` adds a second button that registers without the submit label's next step (reception's send). */
export function NewPatient({ seed, orgId, onDone, onCancel, submitLabel = 'Register', onRegisterOnly }: { seed: string; orgId: string; onDone: (p: PatientHit) => void; onCancel: () => void; submitLabel?: string; onRegisterOnly?: (p: PatientHit) => void }) {
  const parts = /\d/.test(seed) ? [] : seed.trim().split(/\s+/); const [given, setGiven] = useState(parts[0] ?? ''); const [family, setFamily] = useState(parts.slice(1).join(' '))
  const [sex, setSex] = useState('female'); const [born, setBorn] = useState(''); const [age, setAge] = useState(''); const [phone, setPhone] = useState(/^[\d\s+()-]{6,}$/.test(seed.trim()) ? seed.trim() : '')
  const reg = useRegister(); const only = useRef(false); const form = useRef<HTMLFormElement>(null)
  const dup = usePatientSearch(orgId, family.length >= 2 ? family : '')
  const bornOn = born || (age ? String(new Date().getFullYear() - Number(age)) : '')
  return <form ref={form} onSubmit={(e) => { e.preventDefault(); const justRegister = only.current && onRegisterOnly
    reg.mutate({ given_name: given, family_name: family, sex, born_on: bornOn, phone_text: phone || null }, { onSuccess: (p) => (justRegister || onDone)(p as PatientHit) }) }} className="grid gap-3 rounded-lg border border-line bg-surface p-4">
    <h2 className="text-14 font-semibold">New patient</h2>
    <div className="grid grid-cols-2 gap-3"><Field label="Given name"><Input value={given} onChange={(e) => setGiven(e.target.value)} autoFocus required /></Field><Field label="Family name"><Input value={family} onChange={(e) => setFamily(e.target.value)} required /></Field></div>
    <div className="grid grid-cols-3 gap-3"><Field label="Sex"><Select value={sex} onChange={(e) => setSex(e.target.value)}><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select></Field>
      <Field label="Born on"><Input type="date" value={born} onChange={(e) => setBorn(e.target.value)} /></Field><Field label="…or age"><Input type="number" min={0} max={130} value={age} onChange={(e) => setAge(e.target.value)} disabled={!!born} /></Field></div>
    <Field label="Phone (optional)"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
    {(dup.data ?? []).length > 0 && <Callout tone="warn" role="status" title="Possible existing patient">{dup.data!.slice(0, 3).map((p) => <div key={p.id} className="flex items-center justify-between gap-2 py-0.5"><PatientLine p={p} /><Button type="button" size="sm" variant="outline" onClick={() => onDone(p)}>Use this</Button></div>)}</Callout>}
    {reg.error && <p className="text-14 text-danger">{reg.error.message}</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      {onRegisterOnly && <Button type="button" variant="outline" disabled={reg.isPending || !bornOn} onClick={() => { only.current = true; form.current?.requestSubmit(); only.current = false }}>Register only</Button>}
      <Button type="submit" disabled={reg.isPending || !bornOn}>{submitLabel}</Button></div>
  </form>
}
