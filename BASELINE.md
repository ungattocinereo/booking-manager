# Design 2.0 baseline

## Status

**Design 2.0 / Orbit** is the current Atrani Booking Manager product and interface generation. The canonical source is `main`, and Vercel production is connected to `main`.

The functional baseline was audited and verified at:

- Commit: `25665231b112bf8c280c25f3a9a60f1267a701c3`
- Durable rollback tag: `rollback/design-2.0-live-2026-08-07`
- Vercel production deployment at designation time: `dpl_8puDqEHT3pgFQp9zN24r8hW4hMU6`

The baseline includes the Orbit interface and all later calendar, cleaner, statistics, tourist-tax, reporting, sync-reliability, and access-boundary work that had already reached `main`. Historical branches named `design2.0` contain older partial implementations and are not release candidates.

“Design 2.0” is the design-generation name. It is intentionally separate from the historical package/changelog release named `2.0.0 Docker Edition`.

## Source-of-truth rules

### Working version consolidation — 2026-09-14

The working production source before consolidation was `0424edf1b73c83916fda531626617e2afc27203f`, deployed as `dpl_9WNoGszgehGLbKGQASfig3zYNoHK`. The immutable `rollback/pre-consolidation-2026-09-14` tag preserves that code alongside the original Design 2.0 rollback tag.

The September consolidation brings the current README and email-notifier implementation into `main`. The notifier stays in dry-run mode unless the repository Actions variable `BOOKING_EMAIL_ENABLED` is explicitly set to `true`; merging this code does not enable email delivery. The application frontend, API, database schema, sync implementation, dependency lockfile, and existing production cron configuration remain identical to the pre-consolidation source.

The local calendar-authority branch is patch-equivalent to merged PR #12; the accumulated dark-theme branch is patch-equivalent to merged PR #7. They contain no outstanding product changes. `monitor/nuove-prenotazioni` remains the operational data/Pages branch and is not merged into the application. Local `.agents/` tooling and `skills-lock.json` are preserved on the operator's Mac and excluded from Git and Vercel uploads.

The `rollback/working-2026-09-14` tag identifies the consolidated release after CI and production verification. Both September tags protect source code only; no database migration or data restore is part of this consolidation.

### Ongoing workflow

1. `main` is the sole product-development and production source of truth.
2. Start each change from the latest `origin/main`.
3. Use a short-lived topic branch such as `codex/fix-calendar-filter`.
4. Merge only through a pull request after the required CI check passes.
5. Delete the topic branch after merge; do not keep version-named development branches.
6. Do not merge from or base work on `monitor/nuove-prenotazioni`. It is a long-lived operational data/GitHub Pages branch and is deliberately excluded from Vercel deployments.

## Verification boundary

At designation time, the complete `npm run test:ci` suite passed: JavaScript syntax checks, 89 unit tests, booking lifecycle checks, and Playwright UI coverage. Production dependencies had no high or critical audit findings; one moderate transitive `undici` advisory remained through `sqlite3`/`node-gyp`.

The browser suite covered the calendar, statistics, tourist tax, reporting workspace, and the public maid page, including desktop and mobile scenarios where applicable. Direct browser coverage of the cleaner-management tab remains a known gap. Changes that touch shared styling or routing must still consider every route.

## Rollback

The rollback tag is immutable and points to the exact application code running when Design 2.0 was designated:

```bash
git fetch origin --tags
git show rollback/design-2.0-live-2026-08-07
```

Prefer a normal revert or a fresh recovery branch from the tag; do not rewrite `main` history. Promoting or deploying a rollback is a separate production action and must still pass the relevant safety checks.

The Git tag protects source code only. Before any rollback involving schema or reporting data, separately verify:

- the current Postgres schema and migration compatibility;
- a recoverable database backup or provider snapshot;
- retention of `REPORTING_PII_ENCRYPTION_KEY` values needed by existing encrypted records;
- the state of `REPORTING_EXTERNAL_SEND_ENABLED` and external reporting submissions.

## Known follow-up risks

The baseline audit identified work that should be handled in focused follow-up pull requests rather than silently changing the designated baseline:

- replace unsafe `innerHTML` rendering of imported guest/cleaner data and validate reservation URL schemes;
- add direct browser coverage for the cleaner-management tab;
- strengthen the application-side Cloudflare Access check beyond header presence; Vercel SSO Deployment Protection was verified enabled on 2026-08-07 and must remain enabled for previews that share production data;
- add a documented Postgres snapshot and reporting-key rotation/restore procedure;
- align or explicitly pin the supported Node.js versions across local development, GitHub CI (currently Node 20), and Vercel production (currently Node 24);
- progressively split the large single-file dashboard and consolidate the legacy plus Orbit CSS layers.
