// The one place packs are named (spec 06). Importing a pack registers its bench steps, reply forms and renderers.
import * as pharmacy from './pharmacy'
import * as lis from './lis'
import * as billing from './billing'
import * as radiology from './radiology'
import * as cardiology from './cardiology'
import * as nephrology from './nephrology'
import * as respiratory from './respiratory'
import * as haematology from './haematology'
export const packs = { pharmacy, lis, billing, radiology, cardiology, nephrology, respiratory, haematology }
