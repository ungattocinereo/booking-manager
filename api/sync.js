// Vercel Serverless Function
const { syncAll } = require('../backend/src/sync-calendars');

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔄 Starting calendar sync...');
    await syncAll();
    
    res.status(200).json({
      success: true,
      message: 'Calendars synced successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Sync failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
