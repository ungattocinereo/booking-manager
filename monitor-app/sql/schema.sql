-- Monitor App schema — separate tables that the main booking-manager does NOT touch.
-- Run once: psql "$POSTGRES_URL" -f monitor-app/sql/schema.sql

CREATE TABLE IF NOT EXISTS monitor_booking_events (
  id SERIAL PRIMARY KEY,
  property_id VARCHAR(50) NOT NULL,
  platform VARCHAR(50) NOT NULL DEFAULT 'airbnb',
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('created','cancelled','updated')),
  booking_key TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  guest_name VARCHAR(255),
  reservation_url TEXT,
  confirmation_code VARCHAR(50),
  source VARCHAR(30) NOT NULL CHECK (source IN ('bookings_table','export_airbnb_csv','export_booking_xls')),
  source_ref TEXT,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  booking_created_at TIMESTAMP,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_mbe_detected ON monitor_booking_events (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_mbe_key ON monitor_booking_events (booking_key, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_mbe_property_detected ON monitor_booking_events (property_id, detected_at DESC);

CREATE TABLE IF NOT EXISTS monitor_exports_log (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  source VARCHAR(20) NOT NULL CHECK (source IN ('airbnb','booking')),
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  records_total INTEGER,
  events_created INTEGER DEFAULT 0,
  events_cancelled INTEGER DEFAULT 0,
  events_updated INTEGER DEFAULT 0,
  UNIQUE (filename, checksum)
);

CREATE INDEX IF NOT EXISTS idx_mel_imported ON monitor_exports_log (imported_at DESC);
