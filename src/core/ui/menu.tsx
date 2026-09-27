// The Radix dropdown, skinned once (design-system.md §4.3): the header's menus (department, user) and small action menus.
// Entry aids never use it: the composer's cards stay inline, under the line.
import type { ReactNode } from 'react'
import * as RadixMenu from '@radix-ui/react-dropdown-menu'
import type { LucideIcon } from 'lucide-react'
import { cn } from './tone'

export function Menu({ trigger, align = 'start', children, className }: { trigger: ReactNode; align?: 'start' | 'end'; children: ReactNode; className?: string }) {
  return <RadixMenu.Root>
    <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
    <RadixMenu.Portal><RadixMenu.Content align={align} sideOffset={6} className={cn('z-popover min-w-56 animate-pop rounded-lg border border-line bg-raised p-1 text-14 text-fg shadow-md', className)}>
      {children}
    </RadixMenu.Content></RadixMenu.Portal>
  </RadixMenu.Root>
}

/** one action; a hint under it says what it does */
export function MenuItem({ children, hint, icon: I, tone = 'default', onSelect, className }: { children: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: 'default' | 'danger'; onSelect: () => void; className?: string }) {
  return <RadixMenu.Item onSelect={onSelect} className={cn('flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-hover', tone === 'danger' && 'text-danger', className)}>
    {I && <I aria-hidden className={cn('mt-0.5 size-4 shrink-0', tone === 'danger' ? 'text-danger' : 'text-faint')} />}
    <span className="min-w-0 flex-1">{children}{hint && <span className="block text-12 text-faint">{hint}</span>}</span>
  </RadixMenu.Item>
}

/** a quiet overline over a group of items (the user menu's Theme) */
export const MenuLabel = ({ children }: { children: ReactNode }) => <RadixMenu.Label className="px-2 pb-1 pt-1.5 text-11 font-semibold uppercase tracking-[0.08em] text-faint">{children}</RadixMenu.Label>
export const MenuSeparator = () => <RadixMenu.Separator className="my-1 h-px bg-line" />
