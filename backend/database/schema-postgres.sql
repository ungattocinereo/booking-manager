-- Properties (apartments)
CREATE TABLE IF NOT EXISTS properties (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bookings from iCal
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  property_id VARCHAR(50) NOT NULL REFERENCES properties(id),
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('airbnb', 'booking', 'direct')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  raw_summary TEXT,
  guest_name VARCHAR(255),
  reservation_url TEXT,
  phone_last4 VARCHAR(10),
  booking_type VARCHAR(50) DEFAULT 'reservation' CHECK (booking_type IN ('reservation', 'blocked', 'unavailable')),
  active BOOLEAN DEFAULT TRUE,
  missing_since TIMESTAMP,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (property_id, platform, start_date, end_date)
);

-- Cleaners
CREATE TABLE IF NOT EXISTS cleaners (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE,
  phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cleaner-Property assignments
CREATE TABLE IF NOT EXISTS cleaner_properties (
  cleaner_id VARCHAR(50) NOT NULL REFERENCES cleaners(id),
  property_id VARCHAR(50) NOT NULL REFERENCES properties(id),
  PRIMARY KEY (cleaner_id, property_id)
);

-- Cleaning tasks
CREATE TABLE IF NOT EXISTS cleaning_tasks (
  id SERIAL PRIMARY KEY,
  property_id VARCHAR(50) NOT NULL REFERENCES properties(id),
  cleaner_id VARCHAR(50) REFERENCES cleaners(id),
  scheduled_date DATE NOT NULL,
  task_type VARCHAR(50) DEFAULT 'checkout_cleaning' CHECK (task_type IN ('checkout_cleaning', 'general_cleaning', 'deep_cleaning', 'manual')),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  completed_at TIMESTAMP,
  active BOOLEAN DEFAULT TRUE,
  missing_since TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (property_id, scheduled_date, task_type)
);

-- Historical aggregate snapshots for the statistics page
CREATE TABLE IF NOT EXISTS booking_stats_snapshots (
  id SERIAL PRIMARY KEY,
  captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  source VARCHAR(50) DEFAULT 'sync',
  season_year INTEGER NOT NULL,
  booking_count INTEGER NOT NULL DEFAULT 0,
  occupied_nights INTEGER NOT NULL DEFAULT 0,
  guest_count INTEGER NOT NULL DEFAULT 0,
  occupancy_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  avg_stay NUMERIC(6,2) NOT NULL DEFAULT 0,
  monthly_nights JSONB NOT NULL DEFAULT '{}'::jsonb,
  monthly_bookings JSONB NOT NULL DEFAULT '{}'::jsonb,
  platform_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  country_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Durable history of calendar sync attempts for health checks and UI freshness.
CREATE TABLE IF NOT EXISTS sync_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  source VARCHAR(50) NOT NULL DEFAULT 'manual',
  status VARCHAR(20) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'partial', 'failed')),
  events_synced INTEGER NOT NULL DEFAULT 0,
  feed_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bookings_property ON bookings(property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_property ON cleaning_tasks(property_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_cleaner ON cleaning_tasks(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_date ON cleaning_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_stats_snapshots_captured ON booking_stats_snapshots(captured_at);
CREATE INDEX IF NOT EXISTS idx_stats_snapshots_season ON booking_stats_snapshots(season_year, captured_at);
CREATE INDEX IF NOT EXISTS idx_sync_runs_completed ON sync_runs(completed_at DESC);

-- Add guest_country column (migration)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_country VARCHAR(5);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_count INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS missing_since TIMESTAMP;
UPDATE bookings SET active = TRUE WHERE active IS NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_active ON bookings(active);

-- Soft archive generated cleaning tasks when their source checkout disappears.
ALTER TABLE cleaning_tasks ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE cleaning_tasks ADD COLUMN IF NOT EXISTS missing_since TIMESTAMP;
UPDATE cleaning_tasks SET active = TRUE WHERE active IS NULL;
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_active ON cleaning_tasks(active);

-- Keep the task type constraint compatible with manually-created tasks.
ALTER TABLE cleaning_tasks DROP CONSTRAINT IF EXISTS cleaning_tasks_task_type_check;
ALTER TABLE cleaning_tasks
  ADD CONSTRAINT cleaning_tasks_task_type_check
  CHECK (task_type IN ('checkout_cleaning', 'general_cleaning', 'deep_cleaning', 'manual'));

-- Add slug column to cleaners (migration)
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS slug VARCHAR(100) UNIQUE;

-- Add city tax tracking columns (migration)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tax_paid BOOLEAN DEFAULT FALSE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tax_paid_at TIMESTAMP;

-- Guest reporting: Comune TXT -> Alloggiati Web -> ISTAT/Sinfonia Turismo SMART
CREATE TABLE IF NOT EXISTS reporting_units (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  property_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guest_import_batches (
  id BIGSERIAL PRIMARY KEY,
  reporting_unit_id VARCHAR(50) NOT NULL REFERENCES reporting_units(id),
  filename VARCHAR(255) NOT NULL,
  content_fingerprint VARCHAR(128) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(40) NOT NULL DEFAULT 'needs_review',
  record_count INTEGER NOT NULL DEFAULT 0,
  stay_count INTEGER NOT NULL DEFAULT 0,
  arrival_from DATE,
  arrival_to DATE,
  imported_by VARCHAR(255),
  imported_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  alloggiati_tested_at TIMESTAMPTZ,
  alloggiati_sent_at TIMESTAMPTZ,
  receipt_received_at TIMESTAMPTZ,
  pii_purged_at TIMESTAMPTZ,
  UNIQUE (reporting_unit_id, content_fingerprint)
);

CREATE TABLE IF NOT EXISTS guest_stays (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES guest_import_batches(id) ON DELETE CASCADE,
  group_index INTEGER NOT NULL,
  head_record_type VARCHAR(2) NOT NULL,
  arrival_date DATE NOT NULL,
  departure_date DATE NOT NULL,
  guest_count INTEGER NOT NULL DEFAULT 1,
  booking_id INTEGER REFERENCES bookings(id),
  property_id VARCHAR(50) REFERENCES properties(id),
  rooms_occupied INTEGER NOT NULL DEFAULT 1,
  origin_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  review_status VARCHAR(40) NOT NULL DEFAULT 'needs_review',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (batch_id, group_index)
);

CREATE TABLE IF NOT EXISTS guest_records (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES guest_import_batches(id) ON DELETE CASCADE,
  stay_id BIGINT NOT NULL REFERENCES guest_stays(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  record_type VARCHAR(2) NOT NULL,
  arrival_date DATE NOT NULL,
  departure_date DATE NOT NULL,
  record_fingerprint VARCHAR(128) NOT NULL,
  encrypted_record TEXT,
  encryption_key_version VARCHAR(40),
  origin_kind VARCHAR(20),
  origin_code VARCHAR(20),
  origin_label VARCHAR(255),
  alloggiati_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  alloggiati_error_code VARCHAR(100),
  alloggiati_error_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (batch_id, line_number)
);

CREATE TABLE IF NOT EXISTS alloggiati_submissions (
  id BIGSERIAL PRIMARY KEY,
  reporting_unit_id VARCHAR(50) NOT NULL REFERENCES reporting_units(id),
  batch_id BIGINT REFERENCES guest_import_batches(id),
  operation VARCHAR(30) NOT NULL,
  payload_fingerprint VARCHAR(128) NOT NULL,
  status VARCHAR(30) NOT NULL,
  valid_records INTEGER,
  total_records INTEGER,
  response_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  operator_email VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alloggiati_receipts (
  id BIGSERIAL PRIMARY KEY,
  reporting_unit_id VARCHAR(50) NOT NULL REFERENCES reporting_units(id),
  receipt_date DATE NOT NULL,
  pdf_data BYTEA NOT NULL,
  pdf_sha256 VARCHAR(64) NOT NULL,
  received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (reporting_unit_id, receipt_date)
);

CREATE TABLE IF NOT EXISTS istat_baseline_stays (
  id BIGSERIAL PRIMARY KEY,
  reporting_unit_id VARCHAR(50) NOT NULL REFERENCES reporting_units(id),
  source_key VARCHAR(160) NOT NULL,
  property_id VARCHAR(50) REFERENCES properties(id),
  arrival_date DATE NOT NULL,
  departure_date DATE NOT NULL,
  rooms_occupied INTEGER NOT NULL DEFAULT 1,
  origins JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (reporting_unit_id, source_key)
);

CREATE TABLE IF NOT EXISTS istat_month_submissions (
  id BIGSERIAL PRIMARY KEY,
  reporting_unit_id VARCHAR(50) NOT NULL REFERENCES reporting_units(id),
  month VARCHAR(7) NOT NULL,
  payload JSONB NOT NULL,
  payload_fingerprint VARCHAR(128) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  remote_snapshot JSONB,
  operator_email VARCHAR(255),
  submitted_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (reporting_unit_id, month)
);

CREATE INDEX IF NOT EXISTS idx_guest_batches_unit_date ON guest_import_batches(reporting_unit_id, arrival_from);
CREATE INDEX IF NOT EXISTS idx_guest_stays_dates ON guest_stays(arrival_date, departure_date);
CREATE INDEX IF NOT EXISTS idx_guest_records_origin ON guest_records(origin_kind, origin_code);
CREATE INDEX IF NOT EXISTS idx_alloggiati_submissions_batch ON alloggiati_submissions(batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alloggiati_receipts_date ON alloggiati_receipts(receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_istat_baseline_unit_dates ON istat_baseline_stays(reporting_unit_id, arrival_date, departure_date);
CREATE INDEX IF NOT EXISTS idx_istat_month_unit ON istat_month_submissions(reporting_unit_id, month DESC);
