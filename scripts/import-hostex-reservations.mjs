#!/usr/bin/env node
// Copy Hostex reservations into Booking Manager as reservation evidence.
//
// Booking.com iCal shows both reservations and closed dates as the same
// "CLOSED - Not available" marker, so Booking Manager hides marker-only rows
// for Hostex rooms. This script supplies the missing evidence: every live
// Hostex reservation becomes (or enriches) a named Booking Manager row, so real
// guests stay visible and get checkout cleaning tasks.
//
// Dry run by default. Add --apply to write. Run through Gateway exec so the
// protected HOSTEX_ACCESS_TOKEN is available to hostex.mjs.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = process.env.BOOKING_MANAGER_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOSTEX = process.env.HOSTEX_HELPER || resolve(process.env.HOME, '.openclaw/workspace/skills/hostex/scripts/hostex.mjs');
const requireFromApp = createRequire(resolve(APP_DIR, 'package.json'));
requireFromApp('dotenv').config({ path: resolve(APP_DIR, '.env.local'), quiet: true });
const { Pool } = requireFromApp('pg');

const { reservationRow: toRow, guestChanges } = createRequire(import.meta.url)('../lib/hostex-reservations');

function args(argv) {
  const out = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') out.apply = true;
    else if (argv[i] === '--quiet') out.quiet = true;
    else if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[++i];
  }
  return out;
}

function romeDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d);
}

function connectionString() {
  const raw = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!raw) throw new Error('Booking Manager database credentials are unavailable');
  const url = new URL(raw);
  if (['prefer', 'require', 'verify-ca'].includes(url.searchParams.get('sslmode'))) {
    url.searchParams.set('sslmode', 'verify-full');
  }
  return url.toString();
}

function hostexReservations(from, to) {
  const out = execFileSync('node', [HOSTEX, 'reservations', '--from', from, '--to', to], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out).reservations || [];
}

async function main() {
  const opts = args(process.argv.slice(2));
  const from = opts.from || romeDate(-30);
  const to = opts.to || romeDate(365);
  const rows = hostexReservations(from, to).map(toRow).filter(Boolean);
  if (rows.some(row => !row.code)) throw new Error('Hostex returned a reservation without an identity');
  const pool = new Pool({ connectionString: connectionString() });
  const report = { from, to, apply: opts.apply, hostex: rows.length, insert: [], enrich: [], cancel: [], unchanged: 0 };
  try {
    for (const row of rows) {
      const key = [row.property_id, row.platform, row.start_date, row.end_date];
      const { rows: [existing] } = await pool.query(
        `SELECT id, active, guest_name, guest_count, raw_summary FROM bookings
         WHERE property_id = $1 AND platform = $2 AND start_date = $3::date AND end_date = $4::date`,
        key
      );
      const label = `${row.property_id} ${row.channel} ${row.start_date}..${row.end_date}`;

      if (row.cancelled) {
        // Only retire rows this script created; iCal sync owns the others.
        if (existing && existing.active !== false && String(existing.raw_summary || '').startsWith('Hostex:')) {
          report.cancel.push(label);
          if (opts.apply) {
            await pool.query('UPDATE bookings SET active = FALSE, missing_since = NOW() WHERE id = $1', [existing.id]);
          }
        } else report.unchanged++;
        continue;
      }

      if (!existing) {
        report.insert.push(label);
        if (opts.apply) {
          await pool.query(
            `INSERT INTO bookings (property_id, platform, start_date, end_date, raw_summary, guest_name, guest_count, booking_type, active, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'reservation', TRUE, NOW())`,
            [...key, row.raw_summary, row.guest_name, row.guest_count]
          );
        }
        continue;
      }

      const { needsName, needsCount, needsActive } = guestChanges(existing, row);
      if (!needsName && !needsCount && !needsActive) {
        report.unchanged++;
        continue;
      }
      report.enrich.push(`${label}${needsActive ? ' (reactivate)' : ''}`);
      if (opts.apply) {
        await pool.query(
          `UPDATE bookings SET
             guest_name = COALESCE(NULLIF($2, ''), guest_name),
             guest_count = CASE WHEN $3 > 0 THEN $3 ELSE guest_count END,
             booking_type = 'reservation',
             active = TRUE,
             missing_since = NULL
           WHERE id = $1`,
          [existing.id, row.guest_name, row.guest_count]
        );
      }
    }
  } finally {
    await pool.end();
  }
  // --quiet: print NO_REPLY when nothing changed, so scheduled runs stay silent.
  // Changes are logged to a file, never sent to chat (Greg already gets push notifications).
  if (opts.quiet) {
    if (report.insert.length || report.enrich.length || report.cancel.length) {
      const { appendFileSync, mkdirSync } = await import('node:fs');
      const dir = resolve(process.env.HOME, '.openclaw/workspace/logs');
      mkdirSync(dir, { recursive: true });
      appendFileSync(resolve(dir, 'hostex-to-bm.log'), `${new Date().toISOString()} ${JSON.stringify(report)}\n`);
    }
    process.stdout.write('NO_REPLY\n');
    return;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
