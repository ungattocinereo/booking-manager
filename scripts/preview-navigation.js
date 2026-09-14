// Local UI preview: synthetic fixtures, no database or external calendar sync.
const { createServer } = require('./test-ui-performance');

const port = Number(process.env.PORT || 3002);
const server = createServer();
server.listen(port, '127.0.0.1', () => {
  console.log(`Navigation preview (demo data): http://127.0.0.1:${port}`);
});
