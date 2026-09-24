import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { signIn, useAuth } from '../auth'
import { useChoice } from '../hooks/organization'
import { Button, Input, Field } from '../ui'
const DEMO = import.meta.env.VITE_DEMO_LOGINS === 'true'
const USERS = [['admin@demo.com', 'Admin', 'owner'], ['reception@demo.com', 'Receptionist', 'Front desk'], ['nurse@demo.com', 'Nurse', 'Internal Medicine'], ['dr.ali@demo.com', 'Dr. Ali', 'Internal Medicine'], ['lab@demo.com', 'Lab tech', 'Laboratory'], ['psych@demo.com', 'Dr. Salma', 'Psychiatry']]
export function Login() {
  const status = useAuth((s) => s.status)
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  if (status === 'signed_in') return <Navigate to="/" replace />
  async function go(e: string, p: string) {
    setBusy(true); setError(null); useChoice.getState().setDepartment(null)
    try { await signIn(e, p) } catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed') } finally { setBusy(false) }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void go(email, password) }
  return (
    <div className="grid min-h-screen place-items-center bg-neutral-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold tracking-tight">openCare</h1>
        <p className="mb-5 text-sm text-neutral-500">Sign in to your department</p>
        <div className="mb-3"><Field label="Email"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required /></Field></div>
        <div className="mb-4"><Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field></div>
        {error && <p className="mb-3 text-sm text-red-700" role="alert">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        {DEMO && <div className="mt-6 border-t border-neutral-200 pt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Demo · one click</p>
          <ul className="grid grid-cols-2 gap-1.5">{USERS.map(([e, l, r]) => <li key={e}><button type="button" onClick={() => go(e, 'Demo123!')} disabled={busy} className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-left hover:border-teal-700 hover:bg-teal-50 disabled:opacity-50"><span className="block text-sm font-medium">{l}</span><span className="block text-[11px] text-neutral-500">{r}</span></button></li>)}</ul>
        </div>}
      </form>
    </div>
  )
}
