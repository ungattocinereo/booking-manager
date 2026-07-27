-- Properties table
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bookings table (consolidated from all platforms)
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  guest_name TEXT,
  guest_country TEXT,
  guest_count INTEGER,
  reservation_url TEXT,
  phone_last4 TEXT,
  booking_type TEXT DEFAULT 'reservation',
  status TEXT DEFAULT 'confirmed',
  active INTEGER DEFAULT 1,
  missing_since DATETIME,
  raw_summary TEXT,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

-- Cleaners table
CREATE TABLE IF NOT EXISTS cleaners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Cleaner assignments (which properties each cleaner handles)
CREATE TABLE IF NOT EXISTS cleaner_properties (
  cleaner_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  PRIMARY KEY (cleaner_id, property_id),
  FOREIGN KEY (cleaner_id) REFERENCES cleaners(id),
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

-- Cleaning tasks (generated from bookings)
CREATE TABLE IF NOT EXISTS cleaning_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id TEXT NOT NULL,
  cleaner_id TEXT,
  scheduled_date DATE NOT NULL,
  task_type TEXT DEFAULT 'checkout_cleaning',
  status TEXT DEFAULT 'pending',
  notes TEXT,
  active INTEGER DEFAULT 1,
  missing_since DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (cleaner_id) REFERENCES cleaners(id)
);

-- Historical aggregate snapshots for the statistics page
CREATE TABLE IF NOT EXISTS booking_stats_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  source TEXT DEFAULT 'sync',
  season_year INTEGER NOT NULL,
  booking_count INTEGER NOT NULL DEFAULT 0,
  occupied_nights INTEGER NOT NULL DEFAULT 0,
  guest_count INTEGER NOT NULL DEFAULT 0,
  occupancy_percent REAL NOT NULL DEFAULT 0,
  avg_stay REAL NOT NULL DEFAULT 0,
  monthly_nights TEXT NOT NULL DEFAULT '{}',
  monthly_bookings TEXT NOT NULL DEFAULT '{}',
  platform_counts TEXT NOT NULL DEFAULT '{}',
  country_counts TEXT NOT NULL DEFAULT '{}',
  payload TEXT NOT NULL DEFAULT '{}'
);

-- Durable history of calendar sync attempts for health checks and UI freshness.
CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'running',
  events_synced INTEGER NOT NULL DEFAULT 0,
  feed_errors TEXT NOT NULL DEFAULT '[]',
  error_message TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bookings_property ON bookings(property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_date ON cleaning_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_cleaner ON cleaning_tasks(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_stats_snapshots_captured ON booking_stats_snapshots(captured_at);
CREATE INDEX IF NOT EXISTS idx_stats_snapshots_season ON booking_stats_snapshots(season_year, captured_at);
CREATE INDEX IF NOT EXISTS idx_sync_runs_completed ON sync_runs(completed_at DESC);

-- Guest reporting: Comune TXT -> Alloggiati Web -> ISTAT/Sinfonia Turismo SMART
CREATE TABLE IF NOT EXISTS reporting_units (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  property_ids TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guest_import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporting_unit_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'needs_review',
  record_count INTEGER NOT NULL DEFAULT 0,
  stay_count INTEGER NOT NULL DEFAULT 0,
  arrival_from DATE,
  arrival_to DATE,
  imported_by TEXT,
  imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  alloggiati_tested_at DATETIME,
  alloggiati_sent_at DATETIME,
  receipt_received_at DATETIME,
  pii_purged_at DATETIME,
  FOREIGN KEY (reporting_unit_id) REFERENCES reporting_units(id),
  UNIQUE (reporting_unit_id, content_fingerprint)
);

CREATE TABLE IF NOT EXISTS guest_stays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  group_index INTEGER NOT NULL,
  head_record_type TEXT NOT NULL,
  arrival_date DATE NOT NULL,
  departure_date DATE NOT NULL,
  guest_count INTEGER NOT NULL DEFAULT 1,
  booking_id INTEGER,
  property_id TEXT,
  rooms_occupied INTEGER NOT NULL DEFAULT 1,
  origin_confirmed INTEGER NOT NULL DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'needs_review',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES guest_import_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (property_id) REFERENCES properties(id),
  UNIQUE (batch_id, group_index)
);

CREATE TABLE IF NOT EXISTS guest_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  stay_id INTEGER NOT NULL,
  line_number INTEGER NOT NULL,
  record_type TEXT NOT NULL,
  arrival_date DATE NOT NULL,
  departure_date DATE NOT NULL,
  record_fingerprint TEXT NOT NULL,
  encrypted_record TEXT,
  encryption_key_version TEXT,
  origin_kind TEXT,
  origin_code TEXT,
  origin_label TEXT,
  alloggiati_status TEXT NOT NULL DEFAULT 'pending',
  alloggiati_error_code TEXT,
  alloggiati_error_detail TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES guest_import_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (stay_id) REFERENCES guest_stays(id) ON DELETE CASCADE,
  UNIQUE (batch_id, line_number)
);

CREATE TABLE IF NOT EXISTS alloggiati_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporting_unit_id TEXT NOT NULL,
  batch_id INTEGER,
  operation TEXT NOT NULL,
  payload_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL,
  valid_records INTEGER,
  total_records INTEGER,
  response_summary TEXT NOT NULL DEFAULT '{}',
  operator_email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporting_unit_id) REFERENCES reporting_units(id),
  FOREIGN KEY (batch_id) REFERENCES guest_import_batches(id)
);

CREATE TABLE IF NOT EXISTS alloggiati_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporting_unit_id TEXT NOT NULL,
  receipt_date DATE NOT NULL,
  pdf_data BLOB NOT NULL,
  pdf_sha256 TEXT NOT NULL,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporting_unit_id) REFERENCES reporting_units(id),
  UNIQUE (reporting_unit_id, receipt_date)
);

CREATE TABLE IF NOT EXISTS istat_month_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporting_unit_id TEXT NOT NULL,
  month TEXT NOT NULL,
  payload TEXT NOT NULL,
  payload_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  remote_snapshot TEXT,
  operator_email TEXT,
  submitted_at DATETIME,
  verified_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reporting_unit_id) REFERENCES reporting_units(id),
  UNIQUE (reporting_unit_id, month)
);

CREATE INDEX IF NOT EXISTS idx_guest_batches_unit_date ON guest_import_batches(reporting_unit_id, arrival_from);
CREATE INDEX IF NOT EXISTS idx_guest_stays_dates ON guest_stays(arrival_date, departure_date);
CREATE INDEX IF NOT EXISTS idx_guest_records_origin ON guest_records(origin_kind, origin_code);
CREATE INDEX IF NOT EXISTS idx_alloggiati_submissions_batch ON alloggiati_submissions(batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alloggiati_receipts_date ON alloggiati_receipts(receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_istat_month_unit ON istat_month_submissions(reporting_unit_id, month DESC);
