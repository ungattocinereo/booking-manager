const DEFAULT_STALE_MINUTES = 26 * 60;

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function parseFeedErrors(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isoOrNull(value) {
  if (!value) return null;
  const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function buildSyncHealth({ lastRun = null, lastDataAt = null, now = new Date(), staleMinutes } = {}) {
  const staleAfterMinutes = positiveNumber(staleMinutes, DEFAULT_STALE_MINUTES);
  const completedAt = isoOrNull(lastRun?.completed_at);
  const dataAt = isoOrNull(lastDataAt || completedAt);
  const nowMs = new Date(now).getTime();
  const dataMs = dataAt ? new Date(dataAt).getTime() : 0;
  const ageMinutes = dataMs && Number.isFinite(nowMs)
    ? Math.max(0, Math.floor((nowMs - dataMs) / 60000))
    : null;
  const stale = ageMinutes === null || ageMinutes > staleAfterMinutes;
  const runStatus = lastRun?.status || (dataAt ? 'legacy' : 'unknown');
  const feedErrors = parseFeedErrors(lastRun?.feed_errors);

  let status = 'ok';
  if (!dataAt || stale || runStatus === 'failed' || runStatus === 'running') status = 'error';
  else if (runStatus === 'partial' || feedErrors.length > 0) status = 'warning';

  return {
    status,
    run_status: runStatus,
    stale,
    stale_after_minutes: staleAfterMinutes,
    age_minutes: ageMinutes,
    last_completed_at: completedAt,
    last_data_at: dataAt,
    events_synced: Number(lastRun?.events_synced) || 0,
    feed_error_count: feedErrors.length,
    feed_errors: feedErrors.map(error => ({
      property_id: error?.property_id || null,
      platform: error?.platform || null,
      error: error?.error ? String(error.error).slice(0, 240) : 'Unknown feed error'
    }))
  };
}

module.exports = {
  DEFAULT_STALE_MINUTES,
  buildSyncHealth,
  parseFeedErrors,
  positiveNumber
};
