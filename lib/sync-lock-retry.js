function nonNegativeDuration(value, fallback) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration >= 0 ? duration : fallback;
}

function positiveDuration(value, fallback) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : fallback;
}

async function acquireSyncLockWithRetry(acquire, options = {}) {
  if (typeof acquire !== 'function') throw new TypeError('acquire must be a function');

  const waitMs = nonNegativeDuration(options.waitMs, 0);
  const retryMs = positiveDuration(options.retryMs, 1000);
  const sleep = options.sleep || (delayMs => new Promise(resolve => setTimeout(resolve, delayMs)));
  const now = options.now || Date.now;
  const deadline = now() + waitMs;
  let attempt = 0;

  while (true) {
    attempt++;
    const lock = await acquire();
    if (lock) return lock;

    const remainingMs = deadline - now();
    if (remainingMs <= 0) return null;

    const delayMs = Math.min(retryMs, remainingMs);
    if (typeof options.onRetry === 'function') {
      options.onRetry({ attempt, delayMs, remainingMs });
    }
    await sleep(delayMs);
  }
}

module.exports = {
  acquireSyncLockWithRetry
};
