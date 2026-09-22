import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { _db as db } from '../db/rpc'
import { Button, Input } from '../ui'

/** manage: actions need a second factor (spec 02). This turns one on (TOTP) or steps the session up to aal2. */
export function Mfa({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient()
  const [level, setLevel] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null); const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  useEffect(() => { void refresh() }, [])
  async function refresh() {
    const { data } = await db.auth.mfa.getAuthenticatorAssuranceLevel(); setLevel(data?.currentLevel ?? 'aal1')
    const f = await db.auth.mfa.listFactors(); const totp = f.data?.totp.find((x) => x.status === 'verified'); setFactorId(totp?.id ?? null)
  }
  async function enroll() {
    setBusy(true); setErr(null)
    const { data, error } = await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'openCare' })
    setBusy(false); if (error) { setErr(error.message); return }
    setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret)
  }
  async function verify() {
    if (!factorId) return; setBusy(true); setErr(null)
    const ch = await db.auth.mfa.challenge({ factorId }); if (ch.error) { setErr(ch.error.message); setBusy(false); return }
    const v = await db.auth.mfa.verify({ factorId, challengeId: ch.data.id, code: code.trim() })
    setBusy(false); if (v.error) { setErr(v.error.message); return }
    setQr(null); setSecret(null); setCode(''); await refresh(); qc.invalidateQueries(); onDone?.()
  }
  if (level === null || level === 'aal2') return null
  return <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
    <p className="mb-2 font-medium text-amber-900">Changing settings needs a second factor.</p>
    {!factorId && !qr && <Button size="sm" onClick={enroll} disabled={busy}>Turn on an authenticator app</Button>}
    {qr && <div className="mb-3 flex items-start gap-4"><img src={qr} alt="QR code" className="h-36 w-36 rounded bg-white p-1" /><p className="text-xs text-neutral-600">Scan with your authenticator app, or enter this key:<br /><code className="select-all font-mono">{secret}</code></p></div>}
    {factorId && <form onSubmit={(e) => { e.preventDefault(); void verify() }} className="flex items-center gap-2"><Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="6-digit code" className="w-36" autoFocus /><Button type="submit" size="sm" disabled={busy || code.trim().length < 6}>Confirm</Button></form>}
    {err && <p className="mt-2 text-red-700">{err}</p>}
  </div>
}
