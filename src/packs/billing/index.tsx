// The billing pack's client (spec/openCare.md §5.4): its three screens — the Cashier (who owes, the payment card folded out under the
// row, receipts), Today (the day's totals, closing the drawer) and Prices (Billing → Prices) — and the words for its refusals. Money
// never reaches the chart: these screens read billing's own tables through its operations, and only where a department uses billing.
import { registerScreen } from '@core/screens/registry'
import { registerWords } from '@core/db/words'
import { Cashier } from './Cashier'
import { Today } from './Today'
import { Prices } from './Prices'
import { REFUSALS } from './words'

registerScreen('billing.cashier', Cashier)
registerScreen('billing.today', Today)
registerScreen('billing.prices', Prices)
registerWords(REFUSALS)
export const key = 'billing'
