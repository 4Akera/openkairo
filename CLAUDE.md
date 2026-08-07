# OpenKairo — Agent Charter

OpenKairo is a block-based EHR. **North star: simple yet powerful.** The block
is the clinical primitive; visits are the logistics primitive; departments own
queues (orders and/or patients). Judge every change against this.

## Autonomous iteration rules

When working autonomously (e.g. via /loop), follow this contract:

1. **One item per iteration.** Pick the single highest-value item from the
   backlog below, in priority order: simplify existing code → fix UX rough
   edges → backlog features. Never invent new features not on the backlog.
2. **Complexity budget.** A change may not increase the number of concepts a
   user must understand. When adding a config option, remove or merge one.
   Prefer opinionated defaults over new settings.
3. **Definition of done** — all of, before an item counts as finished:
   - `npx tsc --noEmit` clean, `npx eslint` clean on touched files
   - `npm test` fully green (add tests for new logic in `src/lib`)
   - verified working in the browser preview when the change is visible
   - committed as ONE small commit on the `agent/autonomy` branch — never
     commit to `main`
4. **Hard limits.** Never apply schema changes or SQL to the remote Supabase
   without explicit user approval — write the SQL into `supabase/schema.sql`
   and stop with a note instead. Never delete user data. Never push.
5. **Log every iteration** in `AGENT_LOG.md`: date, what was done, why it was
   the highest-value item, anything blocked.
6. **Blocked?** Leave a note in `AGENT_LOG.md` and pick a different item.
   Never mark an item done with failing checks.

## Backlog (edit freely — user curates this list)

### Simplify (highest priority)
- [x] Patient-flow pass: reduce the check-in dialog to name-first (search →
      one tap → in queue); assign physician and reason inline in the queue row
      afterwards instead of upfront fields. (2026-08-07)
- [ ] Unify "template" naming: encounter templates keep the name "Templates";
      rename user content templates to "My defaults" everywhere in the UI.
- [ ] Collapse block-visibility booleans (`is_builtin`/`is_universal`/
      `is_dept_only`/`active`/preferred/pinned) into one clear status concept
      in the Settings UI (schema can stay; simplify presentation first).
- [ ] Split BlockDefinitionModal into Simple (name, icon, fields) and
      Advanced (capabilities, dept pairing, billing) with progressive
      disclosure.

### UX rough edges
- [ ] Walk-in check-in button on a clinic's own Patients tab (departments with
      can_receive_patients).
- [ ] Show referral chain on queue rows ("← from <dept>") using
      referred_from_visit_id.
- [ ] "Avg wait today" stat on the Front Desk header.
- [ ] Label patient-facing departments as "Clinic" in Settings and pickers.

### Features (only after the above)
- [ ] Patient-level active-medication list wired to MedsBlock +
      PharmacyFulfillment (the "mx" module), with allergy cross-check.
- [ ] Voice typing into note-type blocks (Web Speech API first).

## Project conventions

- React + TypeScript + Vite + Tailwind + Supabase (RLS everywhere).
- DB schema lives in `supabase/schema.sql` as one idempotent file; there is no
  migrations folder.
- Hardcoded block renderers register in
  `src/components/timeline/BlockRegistry.tsx`; unknown slugs fall back to
  DynamicBlock.
- Run the dev server only via the preview tools (`.claude/launch.json`), not
  Bash.
