import { useState, useEffect } from 'react'
import { useAuthStore } from '../../stores/authStore'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Button, Input, Label, Badge,
} from '../ui'
import { User, ShieldCheck, Loader2, Save } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When true, user cannot dismiss until they enter a name */
  required?: boolean
}

export default function ProfileModal({ open, onOpenChange, required = false }: Props) {
  const { user, profile, updateProfile } = useAuthStore()
  const [fullName, setFullName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (profile) setFullName(profile.full_name)
  }, [profile])

  const handleSave = async () => {
    const trimmed = fullName.trim()
    if (!trimmed) { setError('Name is required'); return }
    setSaving(true)
    setError(null)
    const { error } = await updateProfile({ full_name: trimmed })
    if (error) { setError(error); setSaving(false); return }
    setSaving(false)
    onOpenChange(false)
  }

  const handleOpenChange = (next: boolean) => {
    // If required (no name set yet), block closing
    if (!next && required && !profile?.full_name?.trim()) return
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-4 w-4" />
            {required ? 'Set up your profile' : 'Your Profile'}
          </DialogTitle>
        </DialogHeader>

        {required && (
          <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-sm text-primary">
            Please enter your name before continuing. It will appear on all clinical blocks you create.
          </div>
        )}

        <div className="space-y-4 mt-1">
          {/* Avatar preview */}
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
              {fullName.trim()
                ? fullName.trim().split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
                : <User className="h-5 w-5" />
              }
            </div>
            <div>
              <p className="text-sm font-medium">{fullName.trim() || 'Your Name'}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              placeholder="Dr. Jane Smith"
              value={fullName}
              onChange={e => { setFullName(e.target.value); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Role</Label>
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-muted/50">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm">Administrator</span>
              <Badge variant="default" className="ml-auto text-xs">Admin</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Role management will be available in a future update.</p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            {!required && (
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            )}
            <Button onClick={handleSave} disabled={saving || !fullName.trim()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {required ? 'Save & Continue' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
