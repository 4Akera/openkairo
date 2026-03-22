import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { cn } from '../../lib/utils'
import { Activity, Users, LogOut, Settings } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui'
import ProfileModal from '../profile/ProfileModal'

const NAV = [
  { to: '/', label: 'Patients', icon: Users, end: true },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
]

export default function Sidebar() {
  const { user, profile, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const initials = profile?.full_name?.trim()
    ? profile.full_name.trim().split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : (user?.email?.[0] ?? '?').toUpperCase()

  const displayName = profile?.full_name?.trim() || user?.email || 'Account'
  const role = profile?.role ?? 'admin'

  return (
    <>
      <aside className="w-[64px] flex flex-col items-center py-4 bg-sidebar border-r border-white/5 shrink-0 relative">

        {/* Logo mark */}
        <div className="mb-6 shrink-0">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-900/40">
            <Activity className="h-[18px] w-[18px] text-white" />
          </div>
        </div>

        {/* Divider */}
        <div className="w-8 h-px bg-white/10 mb-3 shrink-0" />

        {/* Nav links */}
        <nav className="flex-1 flex flex-col gap-0.5 w-full px-2.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <Tooltip key={to} delayDuration={200}>
              <TooltipTrigger asChild>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center justify-center h-10 w-full rounded-xl transition-all duration-150',
                      isActive
                        ? 'bg-white/15 text-white shadow-inner'
                        : 'text-slate-500 hover:bg-white/8 hover:text-slate-200',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* Active pill indicator */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-400 rounded-r-full" />
                      )}
                      <Icon className="h-[18px] w-[18px]" />
                      <span className="sr-only">{label}</span>
                    </>
                  )}
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs font-medium">
                {label}
              </TooltipContent>
            </Tooltip>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="flex flex-col items-center gap-1 w-full px-2.5">
          {/* Divider */}
          <div className="w-8 h-px bg-white/10 mb-2" />

          {/* Avatar */}
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setProfileOpen(true)}
                className="group relative flex items-center justify-center h-9 w-9 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 text-white text-xs font-bold hover:from-blue-600 hover:to-blue-700 transition-all duration-150 shadow-md"
              >
                {initials}
                {/* Online dot */}
                <span className="absolute bottom-0.5 right-0.5 h-2 w-2 bg-emerald-400 border-2 border-sidebar rounded-full" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold">{displayName}</p>
                <p className="text-[10px] text-white/60 capitalize">{role} · Edit profile</p>
              </div>
            </TooltipContent>
          </Tooltip>

          {/* Sign out */}
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                onClick={handleSignOut}
                className="flex items-center justify-center h-9 w-full rounded-xl text-slate-500 hover:bg-red-500/15 hover:text-red-400 transition-all duration-150"
              >
                <LogOut className="h-[17px] w-[17px]" />
                <span className="sr-only">Sign out</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Sign out</TooltipContent>
          </Tooltip>
        </div>
      </aside>

      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  )
}
