import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useThemeStore } from '../../stores/themeStore'
import { cn } from '../../lib/utils'
import { Users, LogOut, Settings, Search, Building2, Sun, Moon, Receipt } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '../ui'
import Logo from '../Logo'

const NAV = [
  { to: '/', label: 'Patients', icon: Users, end: true },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
]

export default function Sidebar({ onSearchOpen }: { onSearchOpen?: () => void }) {
  const { user, profile, signOut, inDept, hasBilling, permissions } = useAuthStore()
  const isDeptOnly = inDept && permissions.length === 0
  const { theme, toggle } = useThemeStore()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const initials = profile?.full_name?.trim()
    ? profile.full_name.trim().split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : (user?.email?.[0] ?? '?').toUpperCase()

  const displayName = profile?.full_name?.trim() || user?.email || 'Account'
  const role = profile?.role ?? 'admin'
  const isDark = theme === 'dark'

  return (
    <>
      {/* ── Desktop sidebar (md+) ── */}
      <aside className="hidden md:flex w-[64px] flex-col items-center py-4 bg-sidebar border-r border-white/5 shrink-0 relative">

        {/* Logo mark */}
        <div className="mb-4 shrink-0">
          <Logo size={36} className="rounded-xl shadow-lg shadow-blue-900/40" />
        </div>

        {/* Search button */}
        {!isDeptOnly && (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                onClick={onSearchOpen}
                className="flex items-center justify-center h-9 w-9 rounded-xl text-slate-500 hover:bg-white/8 hover:text-slate-200 transition-all duration-150 mb-2 shrink-0"
              >
                <Search className="h-[17px] w-[17px]" />
                <span className="sr-only">Search patients</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs font-medium">
              Search
              <kbd className="ml-1.5 text-[10px] opacity-60">⌘K</kbd>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Divider */}
        <div className="w-8 h-px bg-white/10 mb-3 shrink-0" />

        {/* Nav links */}
        <nav className="flex-1 flex flex-col gap-0.5 w-full px-2.5">
          {!isDeptOnly && NAV.map(({ to, label, icon: Icon, end }) => (
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

          {inDept && (
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <NavLink
                  to="/portal"
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
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-400 rounded-r-full" />
                      )}
                      <Building2 className="h-[18px] w-[18px]" />
                      <span className="sr-only">Portal</span>
                    </>
                  )}
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs font-medium">Portal</TooltipContent>
            </Tooltip>
          )}

          {hasBilling && (
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <NavLink
                  to="/billing"
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
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-400 rounded-r-full" />
                      )}
                      <Receipt className="h-[18px] w-[18px]" />
                      <span className="sr-only">Billing</span>
                    </>
                  )}
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs font-medium">Billing</TooltipContent>
            </Tooltip>
          )}
        </nav>

        {/* Bottom section */}
        <div className="flex flex-col items-center gap-1 w-full px-2.5">
          <div className="w-8 h-px bg-white/10 mb-2" />

          {/* Theme toggle */}
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                onClick={toggle}
                className="flex items-center justify-center h-9 w-9 rounded-xl text-slate-500 hover:bg-white/8 hover:text-slate-200 transition-all duration-150"
              >
                {isDark
                  ? <Sun className="h-[17px] w-[17px]" />
                  : <Moon className="h-[17px] w-[17px]" />
                }
                <span className="sr-only">{isDark ? 'Switch to light mode' : 'Switch to dark mode'}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {isDark ? 'Light mode' : 'Dark mode'}
            </TooltipContent>
          </Tooltip>

          {/* Avatar */}
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                onClick={() => navigate('/settings')}
                className="group relative flex items-center justify-center h-9 w-9 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 text-white text-xs font-bold hover:from-blue-600 hover:to-blue-700 transition-all duration-150 shadow-md"
              >
                {initials}
                <span className="absolute bottom-0.5 right-0.5 h-2 w-2 bg-emerald-400 border-2 border-sidebar rounded-full" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold">{displayName}</p>
                <p className="text-[10px] text-white/60 capitalize">{role} · Profile</p>
              </div>
            </TooltipContent>
          </Tooltip>

          {/* Sign out */}
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                onClick={handleSignOut}
                className="flex items-center justify-center h-9 w-9 rounded-xl text-red-400 bg-red-500/20 hover:bg-red-500/35 transition-all duration-150"
              >
                <LogOut className="h-[17px] w-[17px]" />
                <span className="sr-only">Sign out</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Sign out</TooltipContent>
          </Tooltip>
        </div>
      </aside>

      {/* ── Mobile bottom nav (< md) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-white/10 flex items-center justify-around h-14 px-2 pb-safe">
        {/* Patients */}
        {!isDeptOnly && (
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-3 min-h-[44px] justify-center rounded-lg transition-colors',
                isActive ? 'text-white' : 'text-slate-500',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Users className={cn('h-5 w-5', isActive && 'text-blue-400')} />
                <span className="text-xs font-medium">Patients</span>
              </>
            )}
          </NavLink>
        )}

        {/* Search */}
        {!isDeptOnly && (
          <button
            onClick={onSearchOpen}
            className="flex flex-col items-center gap-0.5 px-3 min-h-[44px] justify-center rounded-lg text-slate-500 transition-colors active:text-white"
          >
            <Search className="h-5 w-5" />
            <span className="text-xs font-medium">Search</span>
          </button>
        )}

        {/* Settings */}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-0.5 px-3 min-h-[44px] justify-center rounded-lg transition-colors',
              isActive ? 'text-white' : 'text-slate-500',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Settings className={cn('h-5 w-5', isActive && 'text-blue-400')} />
              <span className="text-xs font-medium">Settings</span>
            </>
          )}
        </NavLink>

        {inDept && (
          <NavLink
            to="/portal"
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-3 min-h-[44px] justify-center rounded-lg transition-colors',
                isActive ? 'text-white' : 'text-slate-500',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Building2 className={cn('h-5 w-5', isActive && 'text-blue-400')} />
                <span className="text-xs font-medium">Portal</span>
              </>
            )}
          </NavLink>
        )}

        {hasBilling && (
          <NavLink
            to="/billing"
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-3 min-h-[44px] justify-center rounded-lg transition-colors',
                isActive ? 'text-white' : 'text-slate-500',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Receipt className={cn('h-5 w-5', isActive && 'text-blue-400')} />
                <span className="text-xs font-medium">Billing</span>
              </>
            )}
          </NavLink>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="flex flex-col items-center gap-0.5 px-3 min-h-[44px] justify-center rounded-lg text-slate-500 transition-colors active:text-white"
        >
          {isDark
            ? <Sun className="h-5 w-5" />
            : <Moon className="h-5 w-5" />
          }
          <span className="text-xs font-medium">{isDark ? 'Light' : 'Dark'}</span>
        </button>

        {/* Profile */}
        <button
          onClick={() => navigate('/settings')}
          className="relative flex flex-col items-center gap-0.5 px-3 min-h-[44px] justify-center rounded-lg text-slate-500 transition-colors active:text-white"
        >
          <div className="relative h-7 w-7 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white text-xs font-bold">
            {initials}
            <span className="absolute bottom-0 right-0 h-1.5 w-1.5 bg-emerald-400 border border-sidebar rounded-full" />
          </div>
          <span className="text-xs font-medium">Profile</span>
        </button>
      </nav>

    </>
  )
}
