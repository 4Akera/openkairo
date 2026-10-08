// The one place packs are named (spec 06). Importing a pack registers its bench steps, reply forms and renderers.
import * as pharmacy from './pharmacy'
import * as lis from './lis'
import * as billing from './billing'
import * as radiology from './radiology'
import * as vaccines from './vaccines'
import * as chronic_care from './chronic_care'
import * as family_medicine from './family_medicine'
export const packs = { pharmacy, lis, billing, radiology, vaccines, chronic_care, family_medicine }
