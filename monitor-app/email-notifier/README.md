# Monitor Atrani email notifier

The notifier sends one Italian daily digest for new and cancelled Harmony, Royal, and Carina bookings. A cancellation-only day still produces an email, so an event detected after today's run is delivered the next morning.

## Runtime

- Schedule: `.github/workflows/email-notifier.yml`, daily at 07:17 UTC.
- Source: `monitor-app/data/monitor.json` from `monitor/nuove-prenotazioni`.
- Delivery: Mailgun EU API from `Monitor Atrani <monitor@amalfi.day>`.
- Recipients: `dipinorosario@gmail.com`, `greg@cinereo.it`.
- Window: 48 hours, to tolerate a delayed or missed scheduled run.
- Dedupe: event IDs are recorded in `monitor-app/data/email-sent.json` on the monitor branch. The same creation or cancellation timestamp is never sent twice.

Delivery is disabled by default: scheduled and manual runs stay in dry-run mode until the repository Actions variable `BOOKING_EMAIL_ENABLED` is explicitly set to `true`. This preserves the existing production behavior when the notifier code is consolidated into `main`. Dry runs do not write notification state.

Actual delivery also requires the repository secret `MAILGUN_API_KEY`. Do not commit the key or print it in workflow logs.

## Manual verification

The workflow's manual trigger defaults to `dry_run: true`. It selects current events and renders the subject without sending or changing dedupe state. Set `dry_run: false` only when an actual delivery is intended and `BOOKING_EMAIL_ENABLED=true` has been authorized and configured.

Local dry run against a checked-out monitor snapshot:

```bash
DRY_RUN=true \
MONITOR_JSON_PATH=/path/to/monitor-app/data/monitor.json \
EMAIL_STATE_PATH=/tmp/atrani-email-state.json \
node monitor-app/email-notifier/send.js
```

Run unit tests with:

```bash
node --test tests/email-notifier.test.js
```

## Failure behavior

Network errors, HTTP 429, and Mailgun 5xx responses are retried three times after the first attempt. Configuration and other 4xx errors fail immediately, leaving the event unsent so the next workflow run can retry it. The state file is updated only after Mailgun returns a message ID.
