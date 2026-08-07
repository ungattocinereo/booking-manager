# Development workflow

All product work starts from **Design 2.0 / Orbit** on `main`.

## Required flow

1. Update local references and switch to the latest `main`.
2. Create one short-lived branch named `codex/<type>-<topic>`.
3. Keep the branch focused on one change and include tests appropriate to its risk.
4. Run `npm run test:ci` before publication.
5. Open a pull request to `main`; merge only after the required CI check passes.
6. Delete the branch after merge and start the next change from the new `main`.

Do not revive or branch from `codex/design2.0`, `codex/new-design-2.0`, or any other historical design branch. Their useful changes are already superseded by `main`.

`monitor/nuove-prenotazioni` is an operational data/GitHub Pages branch, not an application-development branch. It remains long-lived, is excluded from Vercel deployment, and must not be merged into `main`.

## Pull-request checklist

- The branch was created from the latest `origin/main`.
- The change preserves the Design 2.0 visual language unless the pull request explicitly proposes a new design generation.
- Calendar, cleaners, statistics, tourist tax, reporting, and public maid routes were considered when shared UI or routing changed.
- `npm run test:ci` passes.
- Schema changes include a migration and a database rollback/backup plan.
- No secrets, guest PII, calendar URLs, or environment-file contents are committed.
- The pull request describes production and data migration risk, if any.

The release boundary and durable recovery reference are documented in [BASELINE.md](BASELINE.md).
