import { useRef, useState } from 'react'
import { usePatientSearch } from '../hooks/reads'
import { useRegister } from '../hooks/writes'
import { useDepartment } from '../hooks/organization'
import type { PatientHit } from '../db/types'
import { Button, Callout, Input, Field, PatientLine, Select, errorText } from '../ui'
import { newPatientStepDefs, newPatientStepsFor } from './newPatientSteps'

/** New patient: four fields and a phone (spec 03), with a live duplicate warning. Used by reception and ⌘K.
 *  `onRegisterOnly` adds a second button that registers without the submit label's next step (reception's send).
 *  A pack on for the clinic may add its step after the phone (§5.7 C4: the family file); once registered, the pack does its own with
 *  the new patient before the desk goes on, and a step that fails says so with Continue, never silently. */
export function NewPatient({ seed, orgId, onDone, onCancel, submitLabel = 'Register', onRegisterOnly }: { seed: string; orgId: string; onDone: (p: PatientHit) => void; onCancel: () => void; submitLabel?: string; onRegisterOnly?: (p: PatientHit) => void }) {
  const parts = /\d/.test(seed) ? [] : seed.trim().split(/\s+/); const [given, setGiven] = useState(parts[0] ?? ''); const [family, setFamily] = useState(parts.slice(1).join(' '))
  const [sex, setSex] = useState('female'); const [born, setBorn] = useState(''); const [age, setAge] = useState(''); const [phone, setPhone] = useState(/^[\d\s+()-]{6,}$/.test(seed.trim()) ? seed.trim() : '')
  const reg = useRegister(); const only = useRef(false); const form = useRef<HTMLFormElement>(null)
  const { org } = useDepartment(); const packSteps = newPatientStepsFor(newPatientStepDefs(), org)
  const [values, setValues] = useState<Record<string, unknown>>({}); const [stepError, setStepError] = useState<{ text: string; go: () => void } | null>(null)
  const stepMissing = packSteps.map((s) => s.missing?.(values[s.pack] ?? null) ?? null).find(Boolean) ?? null
  const dup = usePatientSearch(orgId, family.length >= 2 ? family : '')
  const bornOn = born || (age ? String(new Date().getFullYear() - Number(age)) : '')
  // registered: each pack's step does its own with the new patient, then the desk goes on
  const after = async (p: PatientHit, go: (p: PatientHit) => void) => {
    for (const s of packSteps) {
      try { await s.after(values[s.pack] ?? null, p, org!) } catch (e) { setStepError({ text: `Registered, but ${s.pack}: ${errorText(e)}`, go: () => go(p) }); return }
    }
    go(p)
  }
  return <form ref={form} onSubmit={(e) => { e.preventDefault(); const justRegister = only.current && onRegisterOnly
    reg.mutate({ given_name: given, family_name: family, sex, born_on: bornOn, phone_text: phone || null }, { onSuccess: (p) => void after(p as PatientHit, justRegister || onDone) }) }} className="grid gap-3 rounded-lg border border-line bg-surface p-4">
    <h2 className="text-14 font-semibold">New patient</h2>
    <div className="grid grid-cols-2 gap-3"><Field label="Given name"><Input value={given} onChange={(e) => setGiven(e.target.value)} autoFocus required /></Field><Field label="Family name"><Input value={family} onChange={(e) => setFamily(e.target.value)} required /></Field></div>
    <div className="grid grid-cols-3 gap-3"><Field label="Sex"><Select value={sex} onChange={(e) => setSex(e.target.value)}><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></Select></Field>
      <Field label="Born on"><Input type="date" value={born} onChange={(e) => setBorn(e.target.value)} /></Field><Field label="…or age"><Input type="number" min={0} max={130} value={age} onChange={(e) => setAge(e.target.value)} disabled={!!born} /></Field></div>
    <Field label="Phone (optional)"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
    {org && packSteps.map((s) => <s.Part key={s.pack} org={org} seed={{ given, family, phone }} value={values[s.pack] ?? null} onChange={(v) => setValues((x) => ({ ...x, [s.pack]: v }))} />)}
    {stepError && <Callout tone="danger" title="Not finished">{stepError.text} <Button type="button" size="sm" variant="outline" onClick={() => { const go = stepError.go; setStepError(null); go() }}>Continue</Button></Callout>}
    {(dup.data ?? []).length > 0 && <Callout tone="warn" role="status" title="Possible existing patient">{dup.data!.slice(0, 3).map((p) => <div key={p.id} className="flex items-center justify-between gap-2 py-0.5"><PatientLine p={p} /><Button type="button" size="sm" variant="outline" onClick={() => onDone(p)}>Use this</Button></div>)}</Callout>}
    {reg.error && <p className="text-14 text-danger">{reg.error.message}</p>}
    <div className="flex justify-end gap-2">{stepMissing && <span className="me-auto self-center text-12 text-warn">{stepMissing}</span>}
      <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      {onRegisterOnly && <Button type="button" variant="outline" disabled={reg.isPending || !bornOn || !!stepMissing || !!stepError} onClick={() => { only.current = true; form.current?.requestSubmit(); only.current = false }}>Register only</Button>}
      <Button type="submit" disabled={reg.isPending || !bornOn || !!stepMissing || !!stepError}>{submitLabel}</Button></div>
  </form>
}
