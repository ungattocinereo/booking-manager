// Vercel Serverless Function
const { runSync, SyncInProgressError } = require('../backend/src/sync-service');

module.exports = async (req, res) => {
  // Preview deployments share the production database, but intentionally do
  // not receive ICAL_URLS. Never let an open preview tab overwrite the shared
  // sync health with a configuration error.
  if (process.env.VERCEL_ENV === 'preview') {
    return res.status(403).json({
      success: false,
      code: 'SYNC_DISABLED_IN_PREVIEW',
      error: 'Calendar sync is disabled in preview deployments'
    });
  }

  // Allow POST (manual) and GET (scheduled automation/Vercel Cron)
  if (req.method === 'GET') {
    // Verify cron secret if set
    if (process.env.CRON_SECRET && req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔄 Starting calendar sync...');
    
    const result = await runSync({ source: req.method === 'GET' ? 'cron' : 'manual' });
    if (result.partial && req.method === 'GET') {
      return res.status(502).json({ ...result, success: false });
    }
    res.status(result.partial ? 207 : 200).json(result);
  } catch (error) {
    if (error instanceof SyncInProgressError) {
      return res.status(409).json({ success: false, code: error.code, error: error.message });
    }
    console.error('❌ Sync failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
