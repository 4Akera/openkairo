import { NavLink, useMatch, useNavigate } from 'react-router-dom'
import type { ComponentType } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useThemeStore } from '../../stores/themeStore'
import { useDeptPendingCounts } from '../../hooks/useDeptPendingCounts'
import { useHasWards } from '../../hooks/useHasWards'
import { deptIconComponent } from '../../lib/deptIcons'
import { isWorkDept, isWard } from '../../lib/queues'
import { cn } from '../../lib/utils'
import { LogOut, Settings, Search, Sun, Moon, ClipboardList, BedDouble, Building2 } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '../ui'
import Logo from '../Logo'

/**
 * One nav item serving both sidebar modes: an icon-only rail below xl and a
 * labeled 224px sidebar at xl+. Labels and count pills are shown at xl;
 * below that the icon carries a corner badge and a tooltip.
 */
function NavItem({
  to,
  end,
  match,
  icon: Icon,
  label,
  count = 0,
}: {
  to: string
  end?: boolean
  /** Highlight on this path pattern instead of `to` (e.g. any /dept/*) */
  match?: string
  icon: ComponentType<{ className?: string }>
  label: string
  count?: number
}) {
  // Active state is computed here rather than via NavLink's function
  // className: TooltipTrigger's asChild Slot joins className props with
  // .join(' '), which stringifies a function — the class attribute would
  // become the function's source code.
  const active = useMatch({ path: match ?? to, end: end ?? false }) !== null
  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>
        <NavLink
          to={to}
          end={end}
          className={cn(
            'relative flex items-center justify-center h-10 w-full rounded-lg transition-colors duration-150',
            'xl:h-9 xl:justify-start xl:gap-2.5 xl:px-2.5',
            active
              ? 'bg-white/[0.09] text-white'
              : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-200',
          )}
        >
          <Icon className={cn('h-[18px] w-[18px] shrink-0', active && 'text-blue-400')} />
          <span className="hidden xl:block flex-1 min-w-0 truncate text-[13px] font-medium">
            {label}
          </span>
          {count > 0 && (
            <>
              {/* Rail: corner badge hugging the icon */}
              <span className="xl:hidden absolute top-1 right-1 flex items-center justify-center min-w-4 h-4 px-0.5 rounded-full bg-blue-500 text-white text-[9px] font-bold leading-none">
                {count > 99 ? '99+' : count}
              </span>
              {/* Expanded: count pill on the right */}
              <span className="hidden xl:flex items-center rounded-md px-1.5 h-[18px] bg-blue-500/20 text-blue-300 text-[11px] font-semibold tabular-nums leading-none">
                {count > 99 ? '99+' : count}
              </span>
            </>
          )}
          <span className="sr-only">{label}</span>
        </NavLink>
      </TooltipTrigger>
      {/* Tooltips only make sense in rail mode — the label is visible at xl */}
      <TooltipContent side="right" className="xl:hidden text-xs font-medium">
        {label}
        {count > 0 && <span className="ml-1 opacity-60">· {count} open</span>}
      </TooltipContent>
    </Tooltip>
  )
}

export default function Sidebar({ onSearchOpen }: { onSearchOpen?: () => void }) {
  const { user, profile, signOut, inDept, myDepartments, hasBilling, permissions, hasRole } = useAuthStore()
  const isDeptOnly = inDept && permissions.length === 0
  const hasFrontDesk = hasRole('receptionist') || hasRole('physician') || hasRole('nurse') || hasRole('admin')
  // Pure patient queues live on Today and wards on the census page, not in
  // the nav — only order-fulfilling departments get their own entry. And it
  // is ONE entry no matter how many such departments the user belongs to:
  // the nav stays the same size, the per-dept switcher lives inside the
  // work view. The badge is the sum of open orders across them.
  const navDepts = myDepartments.filter(isWorkDept)
  const deptCounts = useDeptPendingCounts(navDepts.map(d => d.slug))
  const deptTotal = navDepts.reduce((n, d) => n + (deptCounts[d.slug] ?? 0), 0)
  const deptEntry = navDepts.length === 0 ? null : navDepts.length === 1
    ? { to: `/dept/${navDepts[0].slug}`, match: undefined, label: navDepts[0].name, icon: deptIconComponent(navDepts[0].icon) }
    : { to: `/dept/${navDepts[0].slug}`, match: '/dept', label: 'Departments', icon: Building2 }
  // Wards nav appears once the org has a ward — creating one IS the toggle.
  // Ward members always get the entry (the census IS their surface).
  const hasWards = useHasWards()
  const showWards = hasWards && (myDepartments.some(isWard) || (!isDeptOnly && hasFrontDesk))

  // The registry lives behind search (⌘K) and Today — no nav entry. Billing
  // staff get Today too: the Cashier lane there IS their surface (/billing
  // is only the per-patient money view it opens).
  const showToday = hasFrontDesk || hasBilling
  const { theme, toggle } = useThemeStore()
  const navigate = useNavigate()
  // Mobile: the merged Departments tab lights on ANY /dept/* route (NavLink
  // only matches its own `to`); single-dept entries keep exact matching.
  const anyDeptOpen = useMatch({ path: '/dept', end: false }) !== null && deptEntry?.match !== undefined

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
      {/* ── Desktop sidebar: icon rail (md–lg) that expands with labels at xl+ ── */}
      <aside className="hidden md:flex w-16 xl:w-56 flex-col items-center xl:items-stretch pt-4 pb-3 bg-sidebar border-r border-white/5 shrink-0">

        {/* Brand */}
        <div className="flex items-center justify-center xl:justify-start xl:gap-2.5 xl:px-4 mb-4 shrink-0">
          <Logo size={32} className="rounded-[10px] shadow-lg shadow-blue-950/50 shrink-0" />
          <span className="hidden xl:block text-[15px] font-semibold tracking-tight text-white">
            OpenKairo
          </span>
        </div>

        {/* Search — icon button in the rail, faux input field when expanded */}
        {!isDeptOnly && (
          <Tooltip delayDuration={250}>
            <TooltipTrigger asChild>
              <button
                onClick={onSearchOpen}
                className="group flex items-center justify-center h-9 w-9 xl:w-auto xl:justify-start xl:gap-2 xl:px-2.5 xl:mx-3 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.05] xl:bg-white/[0.05] xl:border xl:border-white/[0.06] xl:hover:bg-white/[0.08] transition-colors duration-150 mb-1 shrink-0"
              >
                <Search className="h-[17px] w-[17px] shrink-0" />
                <span className="hidden xl:block flex-1 text-left text-[13px] text-slate-500 group-hover:text-slate-400">
                  Search
                </span>
                <kbd className="hidden xl:flex items-center h-[18px] px-1 rounded border border-white/10 bg-white/[0.04] text-[10px] font-medium text-slate-500">
                  ⌘K
                </kbd>
                <span className="sr-only">Search patients</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="xl:hidden text-xs font-medium">
              Search
              <kbd className="ml-1.5 text-[10px] opacity-60">⌘K</kbd>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Nav — scrolls when memberships outgrow the viewport */}
        <nav className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-0.5 w-full px-2.5 xl:px-3 pt-2">
          {!isDeptOnly && showToday && (
            <NavItem to="/" end label="Today" icon={ClipboardList} />
          )}
          {showWards && <NavItem to="/wards" label="Wards" icon={BedDouble} />}

          {/* Departments — one entry; multi-membership switches inside the work view */}
          {deptEntry && (
            <NavItem
              to={deptEntry.to}
              match={deptEntry.match}
              label={deptEntry.label}
              icon={deptEntry.icon}
              count={deptTotal}
            />
          )}
        </nav>

        {/* Bottom — Settings by the workspace controls, then the user row */}
        <div className="w-full px-2.5 xl:px-3 pt-2 mt-2 border-t border-white/[0.06] flex flex-col gap-0.5">
          {!isDeptOnly && <NavItem to="/settings" label="Settings" icon={Settings} />}

          <div className="flex flex-col xl:flex-row items-center gap-1 xl:gap-0.5 pt-1.5">
            {/* Profile — avatar only in the rail, avatar + name at xl */}
            <Tooltip delayDuration={250}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate('/settings')}
                  className="flex items-center justify-center xl:justify-start gap-2.5 xl:flex-1 xl:min-w-0 xl:self-stretch rounded-lg xl:px-1.5 xl:py-1 hover:bg-white/[0.05] transition-colors duration-150"
                >
                  <span className="relative flex items-center justify-center h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 text-white text-[11px] font-bold">
                    {initials}
                    <span className="absolute -bottom-px -right-px h-2 w-2 bg-emerald-400 rounded-full ring-2 ring-sidebar" />
                  </span>
                  <span className="hidden xl:block min-w-0 text-left leading-tight">
                    <span className="block text-[12.5px] font-medium text-slate-200 truncate">{displayName}</span>
                    <span className="block text-[10.5px] text-slate-500 capitalize truncate">{role}</span>
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="xl:hidden">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold">{displayName}</p>
                  <p className="text-[10px] text-white/60 capitalize">{role} · Profile</p>
                </div>
              </TooltipContent>
            </Tooltip>

            {/* Theme toggle */}
            <Tooltip delayDuration={250}>
              <TooltipTrigger asChild>
                <button
                  onClick={toggle}
                  className="flex items-center justify-center h-8 w-8 shrink-0 rounded-lg text-slate-500 hover:bg-white/[0.05] hover:text-slate-200 transition-colors duration-150"
                >
                  {isDark
                    ? <Sun className="h-4 w-4" />
                    : <Moon className="h-4 w-4" />
                  }
                  <span className="sr-only">{isDark ? 'Switch to light mode' : 'Switch to dark mode'}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {isDark ? 'Light mode' : 'Dark mode'}
              </TooltipContent>
            </Tooltip>

            {/* Sign out — quiet until hovered */}
            <Tooltip delayDuration={250}>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSignOut}
                  className="flex items-center justify-center h-8 w-8 shrink-0 rounded-lg text-slate-500 hover:bg-red-500/10 hover:text-red-300 transition-colors duration-150"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="sr-only">Sign out</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Sign out</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </aside>

      {/* ── Mobile bottom nav (< md) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-white/10 flex items-center justify-around h-14 px-2 pb-safe overflow-x-auto no-scrollbar">
        {/* Today — the app opens on the day (billing staff live in its Cashier lane) */}
        {!isDeptOnly && showToday && (
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
                <ClipboardList className={cn('h-5 w-5', isActive && 'text-blue-400')} />
                <span className="text-xs font-medium">Today</span>
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

        {/* Wards — census page, same gate as the desktop entry */}
        {showWards && (
          <NavLink
            to="/wards"
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-3 min-h-[44px] justify-center rounded-lg transition-colors',
                isActive ? 'text-white' : 'text-slate-500',
              )
            }
          >
            {({ isActive }) => (
              <>
                <BedDouble className={cn('h-5 w-5', isActive && 'text-blue-400')} />
                <span className="text-xs font-medium">Wards</span>
              </>
            )}
          </NavLink>
        )}

        {/* Departments — the same single entry as the desktop nav */}
        {deptEntry && (() => {
          const DeptIcon = deptEntry.icon
          return (
            <NavLink
              to={deptEntry.to}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-col items-center gap-0.5 px-3 min-h-[44px] justify-center rounded-lg transition-colors',
                  (isActive || anyDeptOpen) ? 'text-white' : 'text-slate-500',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <DeptIcon className={cn('h-5 w-5', (isActive || anyDeptOpen) && 'text-blue-400')} />
                  {deptTotal > 0 && (
                    <span className="absolute top-0.5 right-1 flex items-center justify-center min-w-4 h-4 px-0.5 rounded-full bg-blue-500 text-white text-[9px] font-bold leading-none">
                      {deptTotal > 99 ? '99+' : deptTotal}
                    </span>
                  )}
                  <span className="text-xs font-medium truncate max-w-[64px]">
                    {navDepts.length > 1 ? 'Depts' : deptEntry.label}
                  </span>
                </>
              )}
            </NavLink>
          )
        })()}

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
          <div className="relative h-7 w-7 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white text-xs font-bold">
            {initials}
            <span className="absolute bottom-0 right-0 h-1.5 w-1.5 bg-emerald-400 border border-sidebar rounded-full" />
          </div>
          <span className="text-xs font-medium">Profile</span>
        </button>
      </nav>

    </>
  )
}
