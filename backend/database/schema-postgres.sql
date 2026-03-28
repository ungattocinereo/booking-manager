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
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('airbnb', 'booking')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  raw_summary TEXT,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (property_id, platform, start_date, end_date)
);

-- Cleaners
CREATE TABLE IF NOT EXISTS cleaners (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bookings_property ON bookings(property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_property ON cleaning_tasks(property_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_cleaner ON cleaning_tasks(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_date ON cleaning_tasks(scheduled_date);
