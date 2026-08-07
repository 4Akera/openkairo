import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Button, Input, Label } from '../components/ui'
import { Loader2 } from 'lucide-react'
import Logo from '../components/Logo'

// Shown only when VITE_DEMO_LOGINS=true (the public demo). Self-hosted
// installs never render these.
const DEMO_ACCOUNTS = [
  { email: 'admin@demo.com',     label: 'Admin' },
  { email: 'dr.emily@demo.com',  label: 'Physician' },
  { email: 'nurse.sarah@demo.com', label: 'Nurse' },
  { email: 'reception@demo.com', label: 'Reception' },
  { email: 'billing@demo.com',   label: 'Billing' },
  { email: 'lab.tech@demo.com',  label: 'Lab' },
]
const DEMO_PASSWORD = 'Demo123!'
const SHOW_DEMO_LOGINS = import.meta.env.VITE_DEMO_LOGINS === 'true'

export default function LoginPage() {
  const { user, signIn } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) setError(error)
    setLoading(false)
  }

  const handleDemoLogin = async (demoEmail: string) => {
    setEmail(demoEmail)
    setPassword(DEMO_PASSWORD)
    setError(null)
    setLoading(true)
    const { error } = await signIn(demoEmail, DEMO_PASSWORD)
    if (error) setError(error)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <Logo size={36} className="rounded-lg shadow-lg shadow-blue-900/40" />
          <span className="text-xl font-semibold text-white tracking-tight">OpenKairo</span>
        </div>

        {/* Card */}
        <div className="bg-card rounded-xl shadow-2xl p-8 border border-border/50">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
            <p className="text-sm text-muted-foreground mt-1">Access your clinical workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="doctor@hospital.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          {SHOW_DEMO_LOGINS && (
            <div className="mt-6 pt-5 border-t border-border/60">
              <p className="text-xs font-medium text-muted-foreground mb-2.5">
                Try the demo — one click, no signup
              </p>
              <div className="flex flex-wrap gap-1.5">
                {DEMO_ACCOUNTS.map(({ email: demoEmail, label }) => (
                  <button
                    key={demoEmail}
                    type="button"
                    disabled={loading}
                    onClick={() => handleDemoLogin(demoEmail)}
                    className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-foreground hover:bg-primary/10 hover:border-primary/40 transition-colors disabled:opacity-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          OpenKairo · For authorized personnel only
        </p>
      </div>
    </div>
  )
}
