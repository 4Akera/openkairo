// The one place packs are named (spec 06). Importing a pack registers its bench steps, reply forms and renderers.
import * as pharmacy from './pharmacy'
import * as lis from './lis'
import * as billing from './billing'
import * as radiology from './radiology'
import * as oncology from './oncology'
import * as surgery from './surgery'
import * as theatre from './theatre'
export const packs = { pharmacy, lis, billing, radiology, oncology, surgery, theatre }
