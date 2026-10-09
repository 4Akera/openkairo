// The words for billing's refusals (registerWords): the codes are the API, the screen only says them. A pack's words never answer another's
// code (the first to register a code keeps it), so billing's codes are its own: none is the core's or another pack's. Pure, for npm run test:billing.
export const REFUSALS: Record<string, string> = {
  not_a_desk: 'This department does not take payment here', not_this_desk: 'This desk takes only its own department\'s charges',
  already_paid: 'Already paid — look again', charge_void: 'That charge is void: the order was cancelled', price_missing: 'Type the price of the line priced at the order (up to 10,000,000)',
  not_open_price: 'That line has its price already', bad_discount: 'A discount is at most what is ticked, to the piastre', unknown_reason: 'Pick the discount\'s reason from the clinic\'s list',
  total_changed: 'What is owed changed since the card opened — look again', not_enough_cash: 'The cash received is less than the total', bad_method: 'Cash or card',
  nothing_to_pay: 'Tick a line to take', bad_line: 'Each line needs a name, a quantity and an amount', nothing_to_send: 'Nothing to send',
  already_refunded: 'Already given back', is_a_refund: 'A refund is not given back', drawer_count: 'Count the drawer in pounds and piastres',
  already_priced: 'That already has a price — change that one', price_or_order: 'A price, or At the order — one of them', too_much: 'At most 10,000,000',
  not_its_service: 'Not one of this department\'s services', too_many: 'Too many at once',
  priced_at_its_counter: 'Its department prices this itself: take it with that department\'s lines',
}
/** a small heading inside a card (the kit's label look) */
export const LABEL = 'text-11 font-semibold uppercase tracking-[0.06em] text-faint'
