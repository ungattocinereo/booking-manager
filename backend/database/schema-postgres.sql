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
  task_type VARCHAR(50) DEFAULT 'checkout_cleaning' CHECK (task_type IN ('checkout_cleaning', 'general_cleaning', 'deep_cleaning')),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  completed_at TIMESTAMP,
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bookings_property ON bookings(property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_property ON cleaning_tasks(property_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_cleaner ON cleaning_tasks(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_date ON cleaning_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_stats_snapshots_captured ON booking_stats_snapshots(captured_at);
CREATE INDEX IF NOT EXISTS idx_stats_snapshots_season ON booking_stats_snapshots(season_year, captured_at);

-- Add guest_country column (migration)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_country VARCHAR(5);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_count INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS missing_since TIMESTAMP;
UPDATE bookings SET active = TRUE WHERE active IS NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_active ON bookings(active);

-- Add slug column to cleaners (migration)
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS slug VARCHAR(100) UNIQUE;

-- Add city tax tracking columns (migration)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tax_paid BOOLEAN DEFAULT FALSE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tax_paid_at TIMESTAMP;
