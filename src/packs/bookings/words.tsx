// Bookings' words: its refusals (registerWords: the codes are the API, the screens only say them) and the small pieces every screen of
// the pack shares.
import type { ReactNode } from 'react'
import { cn } from '@core/ui'

export const REFUSALS: Record<string, string> = {
  no_diary: 'That department keeps no diary (Settings → Departments → Sessions)', not_served: 'This desk does not book for that department',
  full: 'That session is full — pick another', taken: 'That time was just taken — pick another', not_a_time: 'Not a time of that session',
  in_past: 'That time has gone', too_far: 'Further ahead than this department books', closed: 'No session that day (a day off or leave)',
  order_missing: 'A bench books an order: book it from the order\'s row', already_booked: 'That order is booked already — move that booking',
  booking_closed: 'That booking is cancelled or the patient came', not_today: 'That booking is not today', reason_missing: 'Pick the reason',
  bad_outcome: 'Pick what they said', not_booked_here: 'That session does not book this service', order_closed: 'That order is closed',
  bad_hours: 'From must be before To', places_missing: 'How many places?', every_missing: 'Every how many minutes?', days_missing: 'Which days?',
  bad_dates: 'The leave ends before it starts', too_long: 'At most 200 letters', other_order: 'A move keeps its order: book the other order from its row',
}
/** a small heading inside a card (the kit's label look) */
export const LABEL = 'text-11 font-semibold uppercase tracking-[0.06em] text-faint'
/** what the patient hears, in Arabic */
export const Arabic = ({ children, className }: { children: ReactNode; className?: string }) =>
  <span dir="rtl" lang="ar" className={cn('text-14 text-fg', className)}>{children}</span>
