// The one place packs are named (spec 06). Importing a pack registers its bench steps, reply forms and renderers.
import * as pharmacy from './pharmacy'
import * as lis from './lis'
import * as billing from './billing'
import * as radiology from './radiology'
import * as vaccines from './vaccines'
import * as chroniccare from './chroniccare'
import * as familycare from './familycare'
export const packs = { pharmacy, lis, billing, radiology, vaccines, chroniccare, familycare }
