import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { signIn, useAuth } from '../auth'
import { useChoice } from '../hooks/organization'
import { Button, Input, Field } from '../ui'
import { DEMO_GROUPS, DEMO_PASSWORD } from './logins.generated'
const DEMO = import.meta.env.VITE_DEMO_LOGINS === 'true'
export function Login() {
  const status = useAuth((s) => s.status)
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  if (status === 'signed_in') return <Navigate to="/" replace />
  // a demo login opens in the department it is listed under (§5.1 rule 9: every screen checked as the person who uses it)
  async function go(e: string, p: string, departmentId: string | null = null) {
    setBusy(true); setError(null); useChoice.getState().setDepartment(departmentId)
    try { await signIn(e, p) } catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed') } finally { setBusy(false) }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void go(email, password) }
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-sm">
        <h1 className="mb-1 text-18 font-semibold tracking-tight">openCare</h1>
        <p className="mb-5 text-14 text-faint">Sign in to your department</p>
        <div className="mb-3"><Field label="Email"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required /></Field></div>
        <div className="mb-4"><Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field></div>
        {error && <p className="mb-3 text-14 text-danger" role="alert">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        {DEMO && <div className="mt-6 border-t border-line pt-4">
          <p className="mb-2 text-11 font-semibold uppercase tracking-wider text-faint">Demo · one click</p>
          <div className="grid gap-3">{DEMO_GROUPS.map((g) => <section key={g.department} aria-label={g.department}>
            <h2 className="mb-1 text-12 font-medium text-muted">{g.department}</h2>
            <ul className="grid grid-cols-2 gap-1.5">{g.people.map((u) => <li key={u.email}><button type="button" onClick={() => go(u.email, DEMO_PASSWORD, g.departmentId)} disabled={busy} className="w-full rounded-md border border-line px-2.5 py-1.5 text-left hover:border-accent hover:bg-accent-soft disabled:opacity-50"><span className="block text-14 font-medium">{u.name}</span><span className="block text-11 text-faint">{u.role}</span></button></li>)}</ul>
          </section>)}</div>
        </div>}
      </form>
    </div>
  )
}
