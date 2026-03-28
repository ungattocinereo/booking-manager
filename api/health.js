// Vercel Serverless Function
module.exports = async (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: process.env.POSTGRES_URL ? 'postgres' : 'sqlite'
  });
};
