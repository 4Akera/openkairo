import { useState } from 'react'
import {
  User, Blocks, ShieldCheck, Users, Globe, LayoutTemplate, Building2,
  ChevronLeft, ChevronRight, Star, Settings2,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { cn } from '../lib/utils'
import { CustomBlocksSection, StandardBlocksSection } from './settings/blocksSections'
import { TemplatesSection } from './settings/TemplatesSection'
import { ProfileSection } from './settings/ProfileSection'
import { RolesSection } from './settings/RolesSection'
import { UsersSection } from './settings/UsersSection'
import { PatientFieldsSection } from './settings/PatientFieldsSection'
import { DepartmentsSection } from './settings/DepartmentsSection'
import { ServiceItemsSection } from './settings/ServiceItemsSection'
import { GeneralSection } from './settings/GeneralSection'

// ============================================================
// Settings Page
// ============================================================

const SETTINGS_NAV = (isAdmin: boolean, canManageSettings: boolean, canManageBlocks: boolean, canTemplates: boolean, canBlocks: boolean, canManageFees: boolean) => [
  { id: 'profile',       label: 'Profile',         icon: User,          show: true },
  { id: 'blocks',        label: 'My Blocks',        icon: Blocks,        show: canBlocks },
  { id: 'templates',     label: 'Templates',        icon: LayoutTemplate, show: canTemplates },
  { id: 'standard',      label: 'Block Library',    icon: Globe,         show: canManageBlocks },
  { id: 'patient-fields',label: 'Patient Fields',   icon: User,          show: isAdmin },
  { id: 'roles',         label: 'Roles',            icon: ShieldCheck,   show: isAdmin },
  { id: 'users',         label: 'Users',            icon: Users,         show: isAdmin },
  { id: 'departments',   label: 'Departments',      icon: Building2,     show: isAdmin },
  { id: 'service-items', label: 'Service Items',    icon: Star,          show: canManageFees },
  { id: 'general',       label: 'General',          icon: Settings2,     show: canManageSettings },
].filter(n => n.show)

export default function SettingsPage() {
  const { can, hasRole } = useAuthStore()
  const isAdmin           = can('admin.manage_users')
  const canManageSettings = can('admin.manage_settings')
  const canManageBlocks   = can('admin.manage_blocks')
  const canTemplates      = can('template.create') && hasRole('physician')
  const canBlocks         = can('block.add')
  const canManageFees     = can('billing.manage_fees')

  const nav = SETTINGS_NAV(isAdmin, canManageSettings, canManageBlocks, canTemplates, canBlocks, canManageFees)
  const [active, setActive]       = useState(nav[0]?.id ?? 'profile')
  const [collapsed, setCollapsed] = useState(false)

  const current = nav.find(n => n.id === active)

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Mobile: horizontal scrollable tab strip (< md) ── */}
      <div className="md:hidden flex overflow-x-auto border-b bg-muted/20 shrink-0 no-scrollbar">
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={cn(
              'flex items-center gap-1.5 px-4 min-h-[44px] text-sm whitespace-nowrap border-b-2 transition-colors shrink-0',
              active === id
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Desktop layout: sidebar + content ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

      {/* ── Left sidebar nav (md+) ── */}
      <aside
        className={cn(
          'relative hidden md:flex flex-col border-r bg-muted/20 shrink-0 transition-[width] duration-200 overflow-hidden',
          collapsed ? 'w-[52px]' : 'w-[200px]',
        )}
      >
        {/* Header */}
        <div className={cn(
          'flex items-center border-b px-3 py-4 shrink-0 gap-2',
          collapsed ? 'justify-center' : 'justify-between',
        )}>
          {!collapsed && <span className="text-sm font-semibold">Settings</span>}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={cn(
                'relative w-full flex items-center gap-2.5 px-3 py-3 text-sm transition-colors',
                active === id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                collapsed ? 'justify-center' : '',
              )}
              title={collapsed ? label : undefined}
            >
              {active === id && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Section header (desktop only — on mobile the tab strip serves as header) */}
        <header className="hidden md:block border-b px-6 py-4 shrink-0">
          <h1 className="text-sm font-semibold">{current?.label ?? 'Settings'}</h1>
        </header>

        <div className="flex-1 overflow-auto p-6">
          {active === 'profile'        && <ProfileSection />}
          {active === 'blocks'         && canBlocks       && <CustomBlocksSection />}
          {active === 'templates'      && canTemplates    && <TemplatesSection />}
          {active === 'standard'       && canManageBlocks && <StandardBlocksSection />}
          {active === 'patient-fields' && isAdmin         && <PatientFieldsSection />}
          {active === 'roles'          && isAdmin         && <RolesSection />}
          {active === 'users'          && isAdmin         && <UsersSection />}
          {active === 'departments'    && isAdmin         && <DepartmentsSection />}
          {active === 'service-items'  && canManageFees   && <ServiceItemsSection />}
          {active === 'general'        && canManageSettings && <GeneralSection />}
        </div>
      </div>

      </div>
    </div>
  )
}
