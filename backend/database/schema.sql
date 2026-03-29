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
  status TEXT DEFAULT 'confirmed',
  raw_summary TEXT,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

-- Cleaners table
CREATE TABLE IF NOT EXISTS cleaners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (cleaner_id) REFERENCES cleaners(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bookings_property ON bookings(property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_date ON cleaning_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_cleaner ON cleaning_tasks(cleaner_id);
