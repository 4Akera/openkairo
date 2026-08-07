import { useState, useEffect } from 'react'
import { Loader2, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { Button, Input } from '../../components/ui'

// ============================================================
// Profile Section
// ============================================================

export function ProfileSection() {
  const { user, profile, updateProfile, roleNames, hasRole } = useAuthStore()
  const { billingEnabled } = useSettingsStore()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [encounterFee, setEncounterFee] = useState(String(profile?.encounter_fee ?? ''))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setName(profile?.full_name ?? '')
    setEncounterFee(profile?.encounter_fee != null ? String(profile.encounter_fee) : '')
  }, [profile])

  const handleSave = async () => {
    setSaving(true)
    await updateProfile({ full_name: name.trim() })
    if (billingEnabled && hasRole('physician')) {
      const fee = parseFloat(encounterFee)
      await supabase.from('profiles').update({ encounter_fee: isNaN(fee) ? null : fee }).eq('id', user!.id)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <h3 className="text-sm font-semibold">Profile</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Your name appears on every block you create.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Full Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dr. Jane Smith"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Email</label>
          <Input value={user?.email ?? ''} readOnly className="mt-1 bg-muted text-muted-foreground" />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Role</label>
          <Input
            value={roleNames.length > 0 ? roleNames.join(', ') : '—'}
            readOnly
            className="mt-1 bg-muted text-muted-foreground"
          />
        </div>

        {billingEnabled && hasRole('physician') && (
          <div>
            <label className="text-xs text-muted-foreground">Encounter Fee</label>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Auto-added as a charge when you close an encounter assigned to you.
            </p>
            <Input
              type="number"
              value={encounterFee}
              onChange={(e) => setEncounterFee(e.target.value)}
              placeholder="0.00"
              className="mt-1"
            />
          </div>
        )}
      </div>

      <Button onClick={handleSave} disabled={saving || !name.trim()} size="sm">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : null}
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Profile'}
      </Button>
    </div>
  )
}
