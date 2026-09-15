-- Additive, portable analytics storage. JSON is TEXT on both engines.
CREATE TABLE IF NOT EXISTS booking_analytics_state (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS booking_analytics_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  property_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_time ON booking_analytics_events(occurred_at);
CREATE TABLE IF NOT EXISTS booking_analytics_snapshots (
  snapshot_date TEXT PRIMARY KEY,
  captured_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
