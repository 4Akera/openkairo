Nine decisions only you can make. Each has my recommendation and one sentence of why.

1. One type per department, queues derived from services. Recommend yes. A department that does two things (a clinic that runs its own bench tests) is two departments in the same site, because the type picks one screen and the queue already exists whenever a department has a live service; two types on one row would mean two screens and a second source of truth the database never reads.

2. Presets as client-shipped data, applied by looping save_… with client-minted ids. Recommend yes. Nothing in the database ever points at a preset, an improved preset in a later release must not change a running practice, and re-runnable saves make a dropped connection at row 37 a re-run rather than a repair; preset tables would be a curation project bigger than the spec.

3. Site as a label (departments.site_name), with trim and case-fold at save. Recommend yes, now. A branch is a label on four departments and nothing in v1 needs a site to own anything; a sites table is one additive migration the day a site needs its own address or phone number.

4. The name of the core department type for request-only departments (PFT lab, physiotherapy, audiometry). Recommend `ancillary`. "The PFT lab is an ancillary department" is ordinary hospital English, and the two alternatives collide: `general` with two screen names, `service` with the services table in every sentence.

5. `is_visited` versus `is_visitable` on department_types. Recommend `is_visited`. It states a fact about the type (patients are seen here), which matches the `is_` convention for facts rather than permissions, and it must be fixed before migration one because the column ships on a table that never changes.

6. MFA required for every manage: action from day one, including the solo GP. Recommend on. The owner of a one-person practice holds every manage: action, so that one login is the whole organization; recovery is you unenrolling the factor in the dashboard, which is a five-minute chore against a day-one account takeover.

7. The hold model: asynchronous hold seconds after send (accepted) versus born-held requests (services.is_held_first). Recommend asynchronous now, born-held only if a real leak is observed. The window is the seconds a patient takes to walk to the cashier, and a Billing failure must never stop a sample being drawn; born-held is one boolean and one branch later if it is ever needed.

8. The record-open window for the read audit: 12 hours, with record_not_open on the other reads. Recommend 12 hours. It covers one shift without re-opening, makes every human read of a patient one attributable row, and shortening it later is a constant, not a migration.

9. Where migration one runs: managed Supabase or self-hosted Postgres. Recommend managed now, verified in migration one. Two things depend on host privileges (revoking pg_advisory_* from PUBLIC, running pg_cron as pack_runner); the spec has a stated fallback for each (the pack-body scan plus the runner's 5 s timeout; SET ROLE inside the procedure), and test B2 proves the runner either way, so the choice does not change the design, only which guard B9 records as active.
