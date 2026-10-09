// The one place packs are named (spec 06). Importing a pack registers its bench steps, reply forms and renderers.
import * as pharmacy from './pharmacy'
import * as lis from './lis'
import * as billing from './billing'
import * as bedside from './bedside'
import * as intensive from './intensive'
export const packs = { pharmacy, lis, billing, bedside, intensive }
