# Building the clinics group (spec §5.8) — four lanes at once

The owner, 2026-10-08: "drawn choice for all, start building in parallel make it fast like 8 hrs all". Every answer is the drawn
choice on its picture; the 36 pictures (`/pictures.html#clinics-map` … `#family-checks`, `src/pictures/{clinics,obgyn,paeds,medicine,
haemonc,surgery,family}.tsx`, shots in `spec/shots/2026-10-08/clinics/`) are the agreed screens. Build day one exactly as drawn; the
"later, not day one" lists stay later.

## The lanes

| lane | branch / session | builds, in this order | pack keys | migrations | role blocks | ports |
|---|---|---|---|---|---|---|
| L1 | `clinics-shared` | the approved core changes (C1–C5 below, first, then tag `clinics-core-ready`) · Vaccines · Chronic care · Family | `vaccines`, `chroniccare`, `familycare` | 22 core (only if SQL is needed), 23, 24, 25 | e0, e1, e2 | db/api prefix 59 · vite 3050–3054 |
| L2 | `clinics-mother-child` | Paediatrics (with the children's ward) · ObGyn's clinic part | `paeds` (+ `obgyn`, created here: role block d3) | 26, 27 | e3 (+ obgyn's own) | 60 · 3060–3064 |
| L3 | `clinics-medicine` | Cardiology (+ the Echo room) · Nephrology · Respiratory · Haematology · the Blood bank on the laboratory pack | `cardio`, `nephrology`, `lungs`, `haemato` (+ `lis`) | 28, 29, 30, 31, 32 (lis) | e4, e5, e6, e7 | 61 · 3070–3074 |
| L4 | `clinics-theatre` | Oncology (+ the day unit) · Surgery · Theatre · Anaesthesia (+ Recovery) | `oncology`, `surgical`, `theatre`, `anaesthesia` | 33, 34, 35, 36 | e8, e9, ea, eb | 62 · 3080–3084 |

Migrations are `supabase/migrations/202609260000NN_<key>.sql`. The privileges migration must stay last: every lane renames it to
`20260926000099_privileges.sql` (same name in every lane, so merges agree) and adds its packs' two lines there. The beds lane
(another session, branch `beds`) owns 17–21 and role blocks d0–d4 (`bedside`, `casualty`, `intensive`, `obgyn`, `haemodialysis`).

**Pack keys never collide with a word in core or another pack** (the guardrail `eslint/no-pack-names.js` matches a key as a word in
any case, in code, strings and comments; it stays as it is). Hence `chroniccare`, `familycare`, `paeds`, `cardio`, `lungs`, `haemato`,
`surgical` — the labels the user reads stay as drawn (Chronic care, Family, Paediatrics, Cardiology, Respiratory, Haematology,
Surgery). Before choosing any other machine word, `grep -rniw <word> src/core src/packs` must find nothing.

## The approved core and base changes (L1 builds them first; everyone else uses them)
- **C1 · a pack's line under a base card**: a pack the department uses may add one line (words, a state tone) under the base's `/rx`
  card and its draft, and under `/v`'s card (Q23, Q33, Q22). Paediatrics: the dose per kg; nephrology: the renal list; paediatrics: the
  z-scores under `/v`. A notice, never a stop. One registry, like `registerTileLine` / `registerRowMark`.
- **C2 · `/v` reads length and head** (`len`, `hc`) into the base keys `height` (method lying) and `head`, and its card shows Length
  and Head for a child (Q22).
- **C3 · a pack command that is not an order offered by "works for"** (Q36): `/transfuse` shows wherever the department using the
  pack (the Blood bank) works for this one, as `/blood` does (§5.1 rule 1's added text).
- **C4 · a pack's step in the desk's New patient** (Q49): the family pack asks "join a family file or start one" (setting
  `family.ask_at_new_patient`), as bookings' walk-in third step (hook j) does.
- **C5 · a pack's own rows under the board** (beds Q2, approved for the chemotherapy day unit): rows of today's work not yet in a
  place, under the base's board, with the base's Admit here as their Start. Coordinate with the beds lane, which needs the same for
  dialysis: if the beds branch already has it, merge theirs instead of writing a second one.
Already in core-v3 and to be used, not rebuilt: a pack order type extending `order` and the facts handed to its card (radiology,
§5.5 a, b: `/op`, `/blood`, `/chemo`), row marks, tile lines and buttons, banner words, sections with fits, scores, settings forms,
row actions (billing), the bench and walk-ins, bookings' booking lines (where merged).
**Nothing else in core or base.** If a lane finds it needs another core or base door, it stops that piece, writes the question in its
report, and builds the rest.

## How every lane works
1. Its own worktree `/Users/yusif/openCare-lanes/<branch>` on its own branch cut from `clinics` (made by the lead, `node_modules`
   linked). Its own Supabase stack: `supabase/config.toml` already says `project_id = "openCare-<branch>"` with every port's leading
   `54` changed to the lane's prefix (59/60/61/62), and is marked skip-worktree: never commit it. Start it lean: `npx supabase start -x studio,imgproxy,
   inbucket,logflare,vector,postgres-meta,supavisor,edge-runtime`. The machine has 16 GB and five other stacks: stop yours when done
   (`npx supabase stop`).
2. Read the model pack first: `src/packs/radiology/` and `supabase/migrations/20260926000014_radiology.sql`, its seed, demo and tests
   (`supabase/seeds/radiology.sql`, `supabase/demo/radiology.sql`, `supabase/tests/radiology.sql`, `scripts/test-radiology.ts`), and
   spec §5, §5.1, §5.2, §5.5 (as built). A pack: key, schema, role, declarations inside its prefix, client under `src/packs/<key>/`,
   registered in `src/packs/index.ts`, a starter setup per department kind, its own demo (rule 9: 2–3 patients each, unique names,
   believable values, the people who use it as demo logins), its suites.
3. Build each pack as its pictures draw it: the same words, the same places, the same keys. Base entries wherever the base has the
   idea; a pack type only where the pictures say so (§5.8's list). Scores as declared tables through `core.declare_score` (EPDS, ACT,
   CAT, mMRC, GOLD group, CHA₂DS₂-VASc, RCRI, STOP-BANG, Aldrete, Brighton PEWS). Reference lists (WHO growth, GLI-2012, Hadlock,
   the MOHP schedule) as demo samples marked "demo sample, not the full list" (rule 7), never the licensed full list.
4. Done for a pack = `npm run typecheck`, `npm run lint`, the node suites (`test:*`, add `test:<key>`), `npm run db:test` all green;
   `npm run db:demo` loads; one browser check per main screen as its demo user (a dev server on the lane's ports, screenshots
   compared with the picture). Commit on the lane branch after each pack (`<Pack>: … (spec §5.8)`), with the attribution line.
5. Spec: add a short "*Built 2026-10-08*" paragraph per pack under §5.8 (what was built, its keys, migration, role block, any
   difference from the picture and why). Never write "owner" for Claude's own choices.
6. Merge order at the end (the lead does it): L1 → L2 → L3 → L4 into `clinics`, then `clinics` into `core-v3` after the beds lane.
   Lanes never merge into `core-v3` or touch `/Users/yusif/openCare`.
